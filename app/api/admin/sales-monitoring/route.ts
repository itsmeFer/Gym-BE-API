import { NextRequest } from "next/server";
import { Op } from "sequelize";

import { Membership, MembershipPlan, User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

type PlainUser = {
  id: number;
  name: string;
  phone: string;
  email: string;
  role: string;
  isActive?: boolean;
  is_active?: boolean;
  createdAt?: Date;
  created_at?: Date;
};

type PlainMembership = {
  id: number;
  userId: number;
  salesUserId: number | null;
  planId: number | null;

  packageName: string;
  packagePrice: number;

  paymentMethod: string;
  paymentStatus: string;
  paidAmount: number;
  paidAt: Date | string | null;
  paymentProofPhoto: string | null;

  memberStatus: string;
  salesStatus: string;

  startedAt: Date | string | null;
  expiredAt: Date | string | null;

  notes: string | null;

  createdAt?: Date | string;
  updatedAt?: Date | string;

  user?: PlainUser | null;
  sales?: PlainUser | null;
  plan?: {
    id: number;
    programName: string;
    customerCategory: string;
    packageCode: string;
    name: string;
    price: number;
    durationDays: number;
    discountPercent: number;
    personalTrainerSessions: number;
    pilatesSessions: number;
    freeMembershipDays: number;
    isActive: boolean;
  } | null;
};

function normalizeStatus(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isRevokedMembership(memberStatus: unknown) {
  const status = normalizeStatus(memberStatus);

  return (
    status === "revoke" ||
    status === "revoked" ||
    status === "dicabut" ||
    status === "dibatalkan"
  );
}

function isPaid(paymentStatus: unknown) {
  return normalizeStatus(paymentStatus) === "paid";
}

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDateOnly(value: unknown) {
  const text = String(value ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }

  return text;
}

function getDateRange(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const startDateParam = parseDateOnly(searchParams.get("startDate"));
  const endDateParam = parseDateOnly(searchParams.get("endDate"));

  if (!startDateParam || !endDateParam) {
    return {
      startDate: null,
      endDate: null,
      where: {},
      label: "Semua data",
    };
  }

  const start = new Date(`${startDateParam}T00:00:00.000+07:00`);
  const end = new Date(`${endDateParam}T23:59:59.999+07:00`);

  return {
    startDate: startDateParam,
    endDate: endDateParam,
    where: {
      createdAt: {
        [Op.between]: [start, end],
      },
    },
    label: `${startDateParam} s/d ${endDateParam}`,
  };
}

function getSalesActive(value: PlainUser) {
  const direct = value.isActive;

  if (typeof direct === "boolean") {
    return direct;
  }

  const underscored = value.is_active;

  if (typeof underscored === "boolean") {
    return underscored;
  }

  return true;
}

function calcRevenue(item: PlainMembership) {
  if (!isPaid(item.paymentStatus)) return 0;
  if (isRevokedMembership(item.memberStatus)) return 0;

  const paidAmount = toNumber(item.paidAmount);
  const packagePrice = toNumber(item.packagePrice);

  return paidAmount > 0 ? paidAmount : packagePrice;
}

function shortDate(value: unknown) {
  if (!value) return null;

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function percentage(part: number, total: number) {
  if (total <= 0) return 0;

  return Math.round((part / total) * 100);
}

function emptySalesPerformance(sales: PlainUser) {
  return {
    id: sales.id,
    name: sales.name,
    phone: sales.phone,
    email: sales.email,
    role: sales.role,
    isActive: getSalesActive(sales),

    totalLead: 0,
    totalDeal: 0,
    totalPaid: 0,
    totalPending: 0,
    totalUnpaid: 0,
    totalActive: 0,
    totalRevoked: 0,
    totalExpired: 0,

    totalRevenue: 0,
    averageRevenue: 0,
    conversionRate: 0,
    activeRate: 0,
    revokeRate: 0,

    lastTransactionAt: null as string | null,
    topPackage: "-",

    packages: {} as Record<
      string,
      {
        packageName: string;
        total: number;
        paid: number;
        revenue: number;
      }
    >,

    memberships: [] as PlainMembership[],
  };
}

function serializeMembership(item: PlainMembership) {
  return {
    id: item.id,
    userId: item.userId,
    salesUserId: item.salesUserId,
    planId: item.planId,

    memberName: item.user?.name ?? "-",
    memberPhone: item.user?.phone ?? "-",
    memberEmail: item.user?.email ?? "-",

    salesName: item.sales?.name ?? "Tanpa sales",

    packageName: item.packageName,
    packagePrice: toNumber(item.packagePrice),

    paymentMethod: item.paymentMethod,
    paymentStatus: item.paymentStatus,
    paidAmount: toNumber(item.paidAmount),
    paidAt: shortDate(item.paidAt),

    memberStatus: item.memberStatus,
    salesStatus: item.salesStatus,

    startedAt: shortDate(item.startedAt),
    expiredAt: shortDate(item.expiredAt),

    notes: item.notes,

    createdAt: shortDate(item.createdAt),
    updatedAt: shortDate(item.updatedAt),

    isPaid: isPaid(item.paymentStatus),
    isRevoked: isRevokedMembership(item.memberStatus),
    countedRevenue: calcRevenue(item),

    plan: item.plan
      ? {
          id: item.plan.id,
          programName: item.plan.programName,
          customerCategory: item.plan.customerCategory,
          packageCode: item.plan.packageCode,
          name: item.plan.name,
          price: item.plan.price,
          durationDays: item.plan.durationDays,
          discountPercent: item.plan.discountPercent,
          personalTrainerSessions: item.plan.personalTrainerSessions,
          pilatesSessions: item.plan.pilatesSessions,
          freeMembershipDays: item.plan.freeMembershipDays,
          isActive: item.plan.isActive,
        }
      : null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const range = getDateRange(request);

    const salesUsers = await User.findAll({
      where: {
        role: "sales",
      },
      attributes: [
        "id",
        "name",
        "phone",
        "email",
        "role",
        "isActive",
        "createdAt",
      ],
      order: [["name", "ASC"]],
    });

    const memberships = await Membership.findAll({
      where: {
        ...range.where,
        salesUserId: {
          [Op.ne]: null,
        },
      },
      include: [
        {
          model: User,
          as: "user",
          attributes: [
            "id",
            "name",
            "phone",
            "email",
            "role",
            "points",
            "maxPoints",
          ],
          required: false,
        },
        {
          model: User,
          as: "sales",
          attributes: [
            "id",
            "name",
            "phone",
            "email",
            "role",
            "isActive",
            "createdAt",
          ],
          required: false,
        },
        {
          model: MembershipPlan,
          as: "plan",
          attributes: [
            "id",
            "programName",
            "customerCategory",
            "packageCode",
            "name",
            "price",
            "durationDays",
            "discountPercent",
            "personalTrainerSessions",
            "pilatesSessions",
            "freeMembershipDays",
            "isActive",
          ],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const plainSales = salesUsers.map((item) =>
      item.get({ plain: true })
    ) as PlainUser[];

    const plainMemberships = memberships.map((item) =>
      item.get({ plain: true })
    ) as PlainMembership[];

    const salesMap = new Map<number, ReturnType<typeof emptySalesPerformance>>();

    for (const sales of plainSales) {
      salesMap.set(sales.id, emptySalesPerformance(sales));
    }

    for (const item of plainMemberships) {
      const salesId = toNumber(item.salesUserId);

      if (!salesId) {
        continue;
      }

      const fallbackSales = item.sales;

      if (!salesMap.has(salesId) && fallbackSales) {
        salesMap.set(salesId, emptySalesPerformance(fallbackSales));
      }

      const sales = salesMap.get(salesId);

      if (!sales) continue;

      const paymentStatus = normalizeStatus(item.paymentStatus);
      const memberStatus = normalizeStatus(item.memberStatus);
      const revoked = isRevokedMembership(item.memberStatus);
      const paid = isPaid(item.paymentStatus);
      const revenue = calcRevenue(item);

      sales.totalLead += 1;

      if (paid && !revoked) {
        sales.totalDeal += 1;
        sales.totalPaid += 1;
      }

      if (paymentStatus === "pending") {
        sales.totalPending += 1;
      }

      if (paymentStatus === "unpaid") {
        sales.totalUnpaid += 1;
      }

      if (memberStatus === "active" && !revoked) {
        sales.totalActive += 1;
      }

      if (revoked) {
        sales.totalRevoked += 1;
      }

      if (memberStatus === "expired") {
        sales.totalExpired += 1;
      }

      sales.totalRevenue += revenue;

      const createdAt = shortDate(item.createdAt);

      if (createdAt) {
        if (!sales.lastTransactionAt) {
          sales.lastTransactionAt = createdAt;
        } else if (new Date(createdAt) > new Date(sales.lastTransactionAt)) {
          sales.lastTransactionAt = createdAt;
        }
      }

      const packageName = item.packageName || item.plan?.name || "Membership";

      if (!sales.packages[packageName]) {
        sales.packages[packageName] = {
          packageName,
          total: 0,
          paid: 0,
          revenue: 0,
        };
      }

      sales.packages[packageName].total += 1;

      if (paid && !revoked) {
        sales.packages[packageName].paid += 1;
        sales.packages[packageName].revenue += revenue;
      }

      sales.memberships.push(item);
    }

    const salesPerformance = Array.from(salesMap.values()).map((sales) => {
      const packages = Object.values(sales.packages).sort(
        (a, b) => b.revenue - a.revenue || b.total - a.total
      );

      const topPackage = packages[0]?.packageName ?? "-";

      const cleanMemberships = sales.memberships
        .sort((a, b) => {
          const dateA = new Date(String(a.createdAt ?? 0)).getTime();
          const dateB = new Date(String(b.createdAt ?? 0)).getTime();
          return dateB - dateA;
        })
        .map(serializeMembership);

      return {
        id: sales.id,
        name: sales.name,
        phone: sales.phone,
        email: sales.email,
        role: sales.role,
        isActive: sales.isActive,

        totalLead: sales.totalLead,
        totalDeal: sales.totalDeal,
        totalPaid: sales.totalPaid,
        totalPending: sales.totalPending,
        totalUnpaid: sales.totalUnpaid,
        totalActive: sales.totalActive,
        totalRevoked: sales.totalRevoked,
        totalExpired: sales.totalExpired,

        totalRevenue: sales.totalRevenue,
        averageRevenue:
          sales.totalDeal > 0 ? Math.round(sales.totalRevenue / sales.totalDeal) : 0,

        conversionRate: percentage(sales.totalDeal, sales.totalLead),
        activeRate: percentage(sales.totalActive, sales.totalLead),
        revokeRate: percentage(sales.totalRevoked, sales.totalLead),

        lastTransactionAt: sales.lastTransactionAt,
        topPackage,

        packages,
        memberships: cleanMemberships,
      };
    });

    salesPerformance.sort((a, b) => {
      if (b.totalRevenue !== a.totalRevenue) {
        return b.totalRevenue - a.totalRevenue;
      }

      return b.totalDeal - a.totalDeal;
    });

    const totalSales = salesPerformance.length;
    const activeSales = salesPerformance.filter((item) => item.isActive).length;
    const inactiveSales = totalSales - activeSales;

    const totalLead = salesPerformance.reduce(
      (sum, item) => sum + item.totalLead,
      0
    );

    const totalDeal = salesPerformance.reduce(
      (sum, item) => sum + item.totalDeal,
      0
    );

    const totalPaid = salesPerformance.reduce(
      (sum, item) => sum + item.totalPaid,
      0
    );

    const totalPending = salesPerformance.reduce(
      (sum, item) => sum + item.totalPending,
      0
    );

    const totalUnpaid = salesPerformance.reduce(
      (sum, item) => sum + item.totalUnpaid,
      0
    );

    const totalRevoked = salesPerformance.reduce(
      (sum, item) => sum + item.totalRevoked,
      0
    );

    const totalRevenue = salesPerformance.reduce(
      (sum, item) => sum + item.totalRevenue,
      0
    );

    const averageRevenue =
      totalDeal > 0 ? Math.round(totalRevenue / totalDeal) : 0;

    const salesRevenue = salesPerformance
      .filter((item) => item.totalRevenue > 0 || item.totalLead > 0)
      .slice(0, 10)
      .map((item) => ({
        id: item.id,
        name: item.name,
        value: item.totalRevenue,
      }));

    const salesDeal = [...salesPerformance]
      .filter((item) => item.totalDeal > 0 || item.totalLead > 0)
      .sort((a, b) => b.totalDeal - a.totalDeal)
      .slice(0, 10)
      .map((item) => ({
        id: item.id,
        name: item.name,
        value: item.totalDeal,
      }));

    const salesLead = [...salesPerformance]
      .filter((item) => item.totalLead > 0)
      .sort((a, b) => b.totalLead - a.totalLead)
      .slice(0, 10)
      .map((item) => ({
        id: item.id,
        name: item.name,
        value: item.totalLead,
      }));

    const statusChart = {
      paid: totalPaid,
      pending: totalPending,
      unpaid: totalUnpaid,
      revoked: totalRevoked,
    };

    const packageMap: Record<
      string,
      {
        packageName: string;
        total: number;
        paid: number;
        revenue: number;
      }
    > = {};

    for (const sales of salesPerformance) {
      for (const packageItem of sales.packages) {
        if (!packageMap[packageItem.packageName]) {
          packageMap[packageItem.packageName] = {
            packageName: packageItem.packageName,
            total: 0,
            paid: 0,
            revenue: 0,
          };
        }

        packageMap[packageItem.packageName].total += packageItem.total;
        packageMap[packageItem.packageName].paid += packageItem.paid;
        packageMap[packageItem.packageName].revenue += packageItem.revenue;
      }
    }

    const topPackages = Object.values(packageMap)
      .sort((a, b) => b.revenue - a.revenue || b.total - a.total)
      .slice(0, 10);

    return successResponse({
      message: "Monitoring sales berhasil diambil",
      data: {
        period: {
          startDate: range.startDate,
          endDate: range.endDate,
          label: range.label,
          generatedAt: new Date().toISOString(),
        },

        summary: {
          totalSales,
          activeSales,
          inactiveSales,

          totalLead,
          totalDeal,
          totalPaid,
          totalPending,
          totalUnpaid,
          totalRevoked,

          totalRevenue,
          averageRevenue,

          conversionRate: percentage(totalDeal, totalLead),
          revokeRate: percentage(totalRevoked, totalLead),
        },

        charts: {
          salesRevenue,
          salesDeal,
          salesLead,
          statusChart,
          topPackages,
        },

        sales: salesPerformance,
      },
    });
  } catch (error) {
    console.error("GET ADMIN SALES MONITORING ERROR:", error);

    return errorResponse("Gagal mengambil monitoring sales", 500);
  }
}