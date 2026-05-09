import { NextRequest } from "next/server";
import { Op } from "sequelize";

import { Membership, MembershipPlan, User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function toNumber(value: unknown, defaultValue = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

function parseDateOrNull(value: unknown) {
  const text = String(value ?? "").trim();

  if (!text) return null;

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function dateOnly(date: Date) {
  const year = date.getFullYear().toString().padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isPaid(value: unknown) {
  const status = normalize(value);

  return status === "paid" || status === "success" || status === "approved";
}

function isActive(value: unknown) {
  return normalize(value) === "active";
}

function isRevoked(value: unknown) {
  const status = normalize(value);

  return (
    status === "revoke" ||
    status === "revoked" ||
    status === "dicabut" ||
    status === "dibatalkan"
  );
}

function safeText(value: unknown, fallback = "-") {
  const text = String(value ?? "").trim();

  return text || fallback;
}

function addCount(target: Record<string, number>, key: string, amount = 1) {
  const cleanKey = key.trim() || "unknown";
  target[cleanKey] = (target[cleanKey] ?? 0) + amount;
}

function addAmount(target: Record<string, number>, key: string, amount = 0) {
  const cleanKey = key.trim() || "unknown";
  target[cleanKey] = (target[cleanKey] ?? 0) + amount;
}

function topEntries(data: Record<string, number>, limit = 10) {
  return Object.fromEntries(
    Object.entries(data)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
  );
}

function percent(part: number, total: number) {
  if (!total) return 0;

  return Math.round((part / total) * 100);
}

function serializeUser(user: any) {
  if (!user) return null;

  const data = user?.get ? user.get({ plain: true }) : user;

  return {
    id: data?.id,
    name: data?.name ?? "",
    email: data?.email ?? "",
    phone: data?.phone ?? "",
    role: data?.role ?? "",
    points: Number(data?.points ?? 0),
    maxPoints: Number(data?.maxPoints ?? data?.max_points ?? 0),
    isActive: data?.isActive ?? data?.is_active ?? true,
    createdAt: data?.createdAt ?? data?.created_at ?? null,
    updatedAt: data?.updatedAt ?? data?.updated_at ?? null,
  };
}

function serializePlan(plan: any) {
  if (!plan) return null;

  const data = plan?.get ? plan.get({ plain: true }) : plan;

  return {
    id: data?.id,
    programName: data?.programName ?? data?.program_name ?? "",
    customerCategory: data?.customerCategory ?? data?.customer_category ?? "",
    packageCode: data?.packageCode ?? data?.package_code ?? "",
    name: data?.name ?? "",
    description: data?.description ?? "",
    imageUrl: data?.imageUrl ?? data?.image_url ?? null,
    price: Number(data?.price ?? 0),
    durationDays: Number(data?.durationDays ?? data?.duration_days ?? 0),
    discountPercent: Number(
      data?.discountPercent ?? data?.discount_percent ?? 0
    ),
    personalTrainerSessions: Number(
      data?.personalTrainerSessions ?? data?.personal_trainer_sessions ?? 0
    ),
    pilatesSessions: Number(data?.pilatesSessions ?? data?.pilates_sessions ?? 0),
    freeMembershipDays: Number(
      data?.freeMembershipDays ?? data?.free_membership_days ?? 0
    ),
    benefits: Array.isArray(data?.benefits) ? data.benefits : [],
    isActive: data?.isActive ?? data?.is_active ?? true,
    createdAt: data?.createdAt ?? data?.created_at ?? null,
    updatedAt: data?.updatedAt ?? data?.updated_at ?? null,
  };
}

function serializeMembership(membership: any) {
  const data = membership?.get ? membership.get({ plain: true }) : membership;

  return {
    id: data?.id,
    userId: data?.userId ?? data?.user_id,
    salesUserId: data?.salesUserId ?? data?.sales_user_id,
    processedByUserId: data?.processedByUserId ?? data?.processed_by_user_id,
    planId: data?.planId ?? data?.plan_id,

    packageName: data?.packageName ?? data?.package_name ?? "",
    packagePrice: Number(data?.packagePrice ?? data?.package_price ?? 0),

    paymentMethod: data?.paymentMethod ?? data?.payment_method ?? "",
    paymentStatus: data?.paymentStatus ?? data?.payment_status ?? "",
    paidAmount: Number(data?.paidAmount ?? data?.paid_amount ?? 0),
    paidAt: data?.paidAt ?? data?.paid_at ?? null,
    paymentProofPhoto:
      data?.paymentProofPhoto ?? data?.payment_proof_photo ?? null,

    memberStatus: data?.memberStatus ?? data?.member_status ?? "",
    salesStatus: data?.salesStatus ?? data?.sales_status ?? "pending",

    startedAt: data?.startedAt ?? data?.started_at ?? null,
    expiredAt: data?.expiredAt ?? data?.expired_at ?? null,

    userScheduleSet: data?.userScheduleSet ?? data?.user_schedule_set ?? false,
    scheduleEditCount:
      data?.scheduleEditCount ?? data?.schedule_edit_count ?? 0,

    notes: data?.notes ?? null,
    createdAt: data?.createdAt ?? data?.created_at ?? null,
    updatedAt: data?.updatedAt ?? data?.updated_at ?? null,

    user: serializeUser(data?.user),
    sales: serializeUser(data?.sales),
    processedBy: serializeUser(data?.processedBy),
    plan: serializePlan(data?.plan),
  };
}

function paymentAmount(item: any) {
  const paidAmount = toNumber(item.paidAmount);
  const packagePrice = toNumber(item.packagePrice);

  return paidAmount > 0 ? paidAmount : packagePrice;
}

function buildSalesPerformance(
  salesUsers: any[],
  memberships: any[]
) {
  const salesMap = new Map<number, any>();

  for (const sales of salesUsers) {
    const data = serializeUser(sales);

    if (!data) continue;

    salesMap.set(Number(data.id), {
      sales: data,
      totalLeads: 0,
      totalPaid: 0,
      totalActive: 0,
      totalPending: 0,
      totalUnpaid: 0,
      totalRevoked: 0,
      totalRevenue: 0,
      averageTransaction: 0,
      closeRate: 0,
      activeRate: 0,
      revokedRate: 0,
      packages: {} as Record<string, number>,
      paymentMethods: {} as Record<string, number>,
      memberStatuses: {} as Record<string, number>,
      paymentStatuses: {} as Record<string, number>,
      latestTransactions: [] as any[],
    });
  }

  for (const membership of memberships) {
    const salesId = Number(membership.salesUserId ?? 0);

    if (!salesId) continue;

    if (!salesMap.has(salesId)) {
      salesMap.set(salesId, {
        sales: membership.sales ?? {
          id: salesId,
          name: "Sales tidak diketahui",
          email: "",
          phone: "",
          role: "sales",
          isActive: false,
        },
        totalLeads: 0,
        totalPaid: 0,
        totalActive: 0,
        totalPending: 0,
        totalUnpaid: 0,
        totalRevoked: 0,
        totalRevenue: 0,
        averageTransaction: 0,
        closeRate: 0,
        activeRate: 0,
        revokedRate: 0,
        packages: {} as Record<string, number>,
        paymentMethods: {} as Record<string, number>,
        memberStatuses: {} as Record<string, number>,
        paymentStatuses: {} as Record<string, number>,
        latestTransactions: [] as any[],
      });
    }

    const target = salesMap.get(salesId);

    target.totalLeads += 1;

    const paymentStatus = normalize(membership.paymentStatus) || "unknown";
    const memberStatus = normalize(membership.memberStatus) || "unknown";
    const paymentMethod = normalize(membership.paymentMethod) || "unknown";
    const packageName = safeText(membership.packageName, "Tanpa paket");

    addCount(target.paymentStatuses, paymentStatus);
    addCount(target.memberStatuses, memberStatus);
    addCount(target.paymentMethods, paymentMethod);
    addCount(target.packages, packageName);

    if (isPaid(membership.paymentStatus) && !isRevoked(membership.memberStatus)) {
      target.totalPaid += 1;
      target.totalRevenue += paymentAmount(membership);
    }

    if (isActive(membership.memberStatus) && !isRevoked(membership.memberStatus)) {
      target.totalActive += 1;
    }

    if (normalize(membership.paymentStatus) === "pending") {
      target.totalPending += 1;
    }

    if (normalize(membership.paymentStatus) === "unpaid") {
      target.totalUnpaid += 1;
    }

    if (isRevoked(membership.memberStatus)) {
      target.totalRevoked += 1;
    }

    target.latestTransactions.push(membership);
  }

  const salesPerformance = Array.from(salesMap.values()).map((item) => {
    item.averageTransaction =
      item.totalPaid > 0 ? Math.round(item.totalRevenue / item.totalPaid) : 0;

    item.closeRate = percent(item.totalPaid, item.totalLeads);
    item.activeRate = percent(item.totalActive, item.totalLeads);
    item.revokedRate = percent(item.totalRevoked, item.totalLeads);

    item.packages = topEntries(item.packages, 8);
    item.paymentMethods = topEntries(item.paymentMethods, 8);
    item.memberStatuses = topEntries(item.memberStatuses, 8);
    item.paymentStatuses = topEntries(item.paymentStatuses, 8);

    item.latestTransactions = item.latestTransactions
      .sort((a: any, b: any) => {
        const aDate = new Date(a.createdAt ?? 0).getTime();
        const bDate = new Date(b.createdAt ?? 0).getTime();

        return bDate - aDate;
      })
      .slice(0, 8);

    return item;
  });

  return salesPerformance.sort((a, b) => {
    if (b.totalRevenue !== a.totalRevenue) {
      return b.totalRevenue - a.totalRevenue;
    }

    if (b.totalPaid !== a.totalPaid) {
      return b.totalPaid - a.totalPaid;
    }

    return b.closeRate - a.closeRate;
  });
}

function buildGlobalCharts(salesPerformance: any[], memberships: any[]) {
  const salesRevenueChart: Record<string, number> = {};
  const salesClosingChart: Record<string, number> = {};
  const salesLeadChart: Record<string, number> = {};
  const salesCloseRateChart: Record<string, number> = {};
  const salesActiveMemberChart: Record<string, number> = {};
  const salesRevokedChart: Record<string, number> = {};
  const packageChart: Record<string, number> = {};
  const packageRevenueChart: Record<string, number> = {};
  const paymentMethodChart: Record<string, number> = {};
  const paymentStatusChart: Record<string, number> = {};
  const memberStatusChart: Record<string, number> = {};
  const dailyRevenueChart: Record<string, number> = {};
  const dailyClosingChart: Record<string, number> = {};
  const dailyLeadChart: Record<string, number> = {};

  for (const item of salesPerformance) {
    const name = safeText(item.sales?.name, "Tanpa nama");

    salesRevenueChart[name] = item.totalRevenue;
    salesClosingChart[name] = item.totalPaid;
    salesLeadChart[name] = item.totalLeads;
    salesCloseRateChart[name] = item.closeRate;
    salesActiveMemberChart[name] = item.totalActive;
    salesRevokedChart[name] = item.totalRevoked;
  }

  for (const membership of memberships) {
    const packageName = safeText(membership.packageName, "Tanpa paket");
    const paymentMethod = normalize(membership.paymentMethod) || "unknown";
    const paymentStatus = normalize(membership.paymentStatus) || "unknown";
    const memberStatus = normalize(membership.memberStatus) || "unknown";

    addCount(packageChart, packageName);
    addCount(paymentMethodChart, paymentMethod);
    addCount(paymentStatusChart, paymentStatus);
    addCount(memberStatusChart, memberStatus);

    const createdDate = new Date(membership.createdAt ?? new Date());
    const createdKey = Number.isNaN(createdDate.getTime())
      ? "unknown"
      : dateOnly(createdDate);

    addCount(dailyLeadChart, createdKey);

    if (isPaid(membership.paymentStatus) && !isRevoked(membership.memberStatus)) {
      const amount = paymentAmount(membership);

      addAmount(packageRevenueChart, packageName, amount);

      const paidDate = new Date(
        membership.paidAt ?? membership.createdAt ?? new Date()
      );

      const paidKey = Number.isNaN(paidDate.getTime())
        ? "unknown"
        : dateOnly(paidDate);

      addAmount(dailyRevenueChart, paidKey, amount);
      addCount(dailyClosingChart, paidKey);
    }
  }

  return {
    salesRevenueChart: topEntries(salesRevenueChart, 10),
    salesClosingChart: topEntries(salesClosingChart, 10),
    salesLeadChart: topEntries(salesLeadChart, 10),
    salesCloseRateChart: topEntries(salesCloseRateChart, 10),
    salesActiveMemberChart: topEntries(salesActiveMemberChart, 10),
    salesRevokedChart: topEntries(salesRevokedChart, 10),
    packageChart: topEntries(packageChart, 10),
    packageRevenueChart: topEntries(packageRevenueChart, 10),
    paymentMethodChart: topEntries(paymentMethodChart, 10),
    paymentStatusChart: topEntries(paymentStatusChart, 10),
    memberStatusChart: topEntries(memberStatusChart, 10),
    dailyRevenueChart: Object.fromEntries(
      Object.entries(dailyRevenueChart).sort((a, b) => a[0].localeCompare(b[0]))
    ),
    dailyClosingChart: Object.fromEntries(
      Object.entries(dailyClosingChart).sort((a, b) => a[0].localeCompare(b[0]))
    ),
    dailyLeadChart: Object.fromEntries(
      Object.entries(dailyLeadChart).sort((a, b) => a[0].localeCompare(b[0]))
    ),
  };
}

function buildSummary(salesPerformance: any[], memberships: any[]) {
  const countedMemberships = memberships.filter(
    (item) => !isRevoked(item.memberStatus)
  );

  const paidMemberships = countedMemberships.filter((item) =>
    isPaid(item.paymentStatus)
  );

  const activeMemberships = countedMemberships.filter((item) =>
    isActive(item.memberStatus)
  );

  const revokedMemberships = memberships.filter((item) =>
    isRevoked(item.memberStatus)
  );

  const totalRevenue = paidMemberships.reduce(
    (sum, item) => sum + paymentAmount(item),
    0
  );

  const bestSalesByRevenue = salesPerformance[0] ?? null;

  const bestSalesByClosing = [...salesPerformance].sort(
    (a, b) => b.totalPaid - a.totalPaid
  )[0] ?? null;

  const bestSalesByCloseRate = [...salesPerformance]
    .filter((item) => item.totalLeads > 0)
    .sort((a, b) => b.closeRate - a.closeRate)[0] ?? null;

  return {
    totalSales: salesPerformance.length,
    activeSales: salesPerformance.filter((item) => item.sales?.isActive).length,

    totalLeads: memberships.length,
    totalCountedLeads: countedMemberships.length,

    totalPaid: paidMemberships.length,
    totalActiveMembers: activeMemberships.length,
    totalRevoked: revokedMemberships.length,

    totalRevenue,
    averageTransaction:
      paidMemberships.length > 0
        ? Math.round(totalRevenue / paidMemberships.length)
        : 0,

    globalCloseRate: percent(paidMemberships.length, countedMemberships.length),
    globalActiveRate: percent(
      activeMemberships.length,
      countedMemberships.length
    ),
    globalRevokedRate: percent(revokedMemberships.length, memberships.length),

    bestSalesByRevenue: bestSalesByRevenue
      ? {
          id: bestSalesByRevenue.sales?.id,
          name: bestSalesByRevenue.sales?.name,
          totalRevenue: bestSalesByRevenue.totalRevenue,
          totalPaid: bestSalesByRevenue.totalPaid,
          closeRate: bestSalesByRevenue.closeRate,
        }
      : null,

    bestSalesByClosing: bestSalesByClosing
      ? {
          id: bestSalesByClosing.sales?.id,
          name: bestSalesByClosing.sales?.name,
          totalRevenue: bestSalesByClosing.totalRevenue,
          totalPaid: bestSalesByClosing.totalPaid,
          closeRate: bestSalesByClosing.closeRate,
        }
      : null,

    bestSalesByCloseRate: bestSalesByCloseRate
      ? {
          id: bestSalesByCloseRate.sales?.id,
          name: bestSalesByCloseRate.sales?.name,
          totalRevenue: bestSalesByCloseRate.totalRevenue,
          totalPaid: bestSalesByCloseRate.totalPaid,
          closeRate: bestSalesByCloseRate.closeRate,
        }
      : null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const startDate = parseDateOrNull(searchParams.get("startDate"));
    const endDate = parseDateOrNull(searchParams.get("endDate"));

    const membershipWhere: any = {};

    if (startDate || endDate) {
      membershipWhere.createdAt = {};

      if (startDate) {
        membershipWhere.createdAt[Op.gte] = startDate;
      }

      if (endDate) {
        const safeEnd = new Date(endDate);
        safeEnd.setHours(23, 59, 59, 999);

        membershipWhere.createdAt[Op.lte] = safeEnd;
      }
    }

    const [salesUsersRaw, membershipsRaw] = await Promise.all([
      User.findAll({
        where: {
          role: "sales",
        },
        attributes: [
          "id",
          "name",
          "email",
          "phone",
          "role",
          "points",
          "maxPoints",
          "isActive",
          "createdAt",
          "updatedAt",
        ],
        order: [["name", "ASC"]],
      }),

      Membership.findAll({
        where: membershipWhere,
        include: [
          {
            model: User,
            as: "user",
            attributes: [
              "id",
              "name",
              "email",
              "phone",
              "role",
              "points",
              "maxPoints",
              "isActive",
              "createdAt",
              "updatedAt",
            ],
            required: false,
          },
          {
            model: User,
            as: "sales",
            attributes: [
              "id",
              "name",
              "email",
              "phone",
              "role",
              "points",
              "maxPoints",
              "isActive",
              "createdAt",
              "updatedAt",
            ],
            required: false,
          },
          {
            model: User,
            as: "processedBy",
            attributes: [
              "id",
              "name",
              "email",
              "phone",
              "role",
              "isActive",
              "createdAt",
              "updatedAt",
            ],
            required: false,
          },
          {
            model: MembershipPlan,
            as: "plan",
            required: false,
          },
        ],
        order: [
          ["createdAt", "DESC"],
          ["id", "DESC"],
        ],
      }),
    ]);

    const memberships = membershipsRaw.map((item) => serializeMembership(item));

    const salesPerformance = buildSalesPerformance(salesUsersRaw, memberships);

    const summary = buildSummary(salesPerformance, memberships);

    const charts = buildGlobalCharts(salesPerformance, memberships);

    const top = {
      topSalesByRevenue: [...salesPerformance]
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, 10),

      topSalesByClosing: [...salesPerformance]
        .sort((a, b) => b.totalPaid - a.totalPaid)
        .slice(0, 10),

      topSalesByCloseRate: [...salesPerformance]
        .filter((item) => item.totalLeads > 0)
        .sort((a, b) => b.closeRate - a.closeRate)
        .slice(0, 10),

      topSalesByActiveMember: [...salesPerformance]
        .sort((a, b) => b.totalActive - a.totalActive)
        .slice(0, 10),

      salesNeedAttention: [...salesPerformance]
        .filter((item) => item.totalLeads > 0)
        .sort((a, b) => {
          if (a.closeRate !== b.closeRate) return a.closeRate - b.closeRate;
          return b.totalLeads - a.totalLeads;
        })
        .slice(0, 10),

      latestTransactions: memberships.slice(0, 15),
    };

    return successResponse({
      message: "Performa sales manager berhasil diambil",
      summary,
      charts,
      top,
      data: {
        salesPerformance,
        memberships,
      },
    });
  } catch (error) {
    console.error("GET MANAGER SALES PERFORMANCE ERROR:", error);

    return errorResponse("Gagal mengambil performa sales manager", 500);
  }
}