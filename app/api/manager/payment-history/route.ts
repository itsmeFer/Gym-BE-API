import { NextRequest } from "next/server";
import { Op } from "sequelize";

import { Membership, MembershipPlan, User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

function normalizeStatus(value: unknown) {
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

function isRevokedMembership(memberStatus: unknown) {
  const status = normalizeStatus(memberStatus);

  return (
    status === "revoke" ||
    status === "revoked" ||
    status === "dicabut" ||
    status === "dibatalkan"
  );
}

function isPaidStatus(value: unknown) {
  const status = normalizeStatus(value);

  return status === "paid" || status === "success" || status === "approved";
}

function serializeUser(user: any) {
  if (!user) return null;

  const data = user?.get ? user.get({ plain: true }) : user;

  return {
    id: data.id,
    name: data.name ?? "",
    email: data.email ?? "",
    phone: data.phone ?? "",
    role: data.role ?? "",
    points: Number(data.points ?? 0),
    maxPoints: Number(data.maxPoints ?? data.max_points ?? 0),
    isActive: data.isActive ?? data.is_active ?? true,
    createdAt: data.createdAt ?? data.created_at ?? null,
    updatedAt: data.updatedAt ?? data.updated_at ?? null,
  };
}

function serializePlan(plan: any) {
  if (!plan) return null;

  const data = plan?.get ? plan.get({ plain: true }) : plan;

  return {
    id: data.id,
    programName: data.programName ?? data.program_name ?? "",
    customerCategory: data.customerCategory ?? data.customer_category ?? "",
    packageCode: data.packageCode ?? data.package_code ?? "",
    name: data.name ?? "",
    description: data.description ?? "",
    imageUrl: data.imageUrl ?? data.image_url ?? null,
    price: Number(data.price ?? 0),
    durationDays: Number(data.durationDays ?? data.duration_days ?? 0),
    discountPercent: Number(
      data.discountPercent ?? data.discount_percent ?? 0
    ),
    personalTrainerSessions: Number(
      data.personalTrainerSessions ?? data.personal_trainer_sessions ?? 0
    ),
    pilatesSessions: Number(data.pilatesSessions ?? data.pilates_sessions ?? 0),
    freeMembershipDays: Number(
      data.freeMembershipDays ?? data.free_membership_days ?? 0
    ),
    benefits: Array.isArray(data.benefits) ? data.benefits : [],
    isActive: data.isActive ?? data.is_active ?? true,
    createdAt: data.createdAt ?? data.created_at ?? null,
    updatedAt: data.updatedAt ?? data.updated_at ?? null,
  };
}

function serializeHistory(membership: any) {
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

function buildDashboard(histories: any[]) {
  const countedHistories = histories.filter(
    (item) => !isRevokedMembership(item.memberStatus)
  );

  const total = countedHistories.length;

  const paid = countedHistories.filter((item) =>
    isPaidStatus(item.paymentStatus)
  ).length;

  const active = countedHistories.filter(
    (item) => normalizeStatus(item.memberStatus) === "active"
  ).length;

  const revoked = histories.filter((item) =>
    isRevokedMembership(item.memberStatus)
  ).length;

  const totalRevenue = countedHistories.reduce((sum, item) => {
    if (!isPaidStatus(item.paymentStatus)) return sum;

    const paidAmount = toNumber(item.paidAmount);
    const packagePrice = toNumber(item.packagePrice);

    return sum + (paidAmount > 0 ? paidAmount : packagePrice);
  }, 0);

  const paymentStatusChart = countedHistories.reduce(
    (result: Record<string, number>, item) => {
      const key = normalizeStatus(item.paymentStatus) || "unknown";
      result[key] = (result[key] ?? 0) + 1;
      return result;
    },
    {}
  );

  const memberStatusChart = countedHistories.reduce(
    (result: Record<string, number>, item) => {
      const key = normalizeStatus(item.memberStatus) || "unknown";
      result[key] = (result[key] ?? 0) + 1;
      return result;
    },
    {}
  );

  const salesChartRaw = countedHistories.reduce(
    (result: Record<string, number>, item) => {
      const salesName = item.sales?.name || "Tanpa sales";
      result[salesName] = (result[salesName] ?? 0) + 1;
      return result;
    },
    {}
  );

  const processedByChartRaw = countedHistories.reduce(
    (result: Record<string, number>, item) => {
      const adminName = item.processedBy?.name || "Belum ada admin proses";
      result[adminName] = (result[adminName] ?? 0) + 1;
      return result;
    },
    {}
  );

  const salesChart = Object.fromEntries(
    Object.entries(salesChartRaw)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  );

  const processedByChart = Object.fromEntries(
    Object.entries(processedByChartRaw)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  );

  return {
    total,
    paid,
    active,
    revoked,
    totalRevenue,
    paymentStatusChart,
    memberStatusChart,
    salesChart,
    processedByChart,
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const paymentStatus = normalizeStatus(searchParams.get("paymentStatus"));
    const memberStatus = normalizeStatus(searchParams.get("memberStatus"));
    const search = String(searchParams.get("search") ?? "").trim();

    const startDate = parseDateOrNull(searchParams.get("startDate"));
    const endDate = parseDateOrNull(searchParams.get("endDate"));

    const where: any = {};

    if (paymentStatus) {
      where.paymentStatus = paymentStatus;
    }

    if (memberStatus) {
      where.memberStatus = memberStatus;
    }

    if (startDate || endDate) {
      where.createdAt = {};

      if (startDate) {
        where.createdAt[Op.gte] = startDate;
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt[Op.lte] = end;
      }
    }

    if (search) {
      where[Op.or] = [
        {
          packageName: {
            [Op.iLike]: `%${search}%`,
          },
        },
        {
          paymentMethod: {
            [Op.iLike]: `%${search}%`,
          },
        },
        {
          paymentStatus: {
            [Op.iLike]: `%${search}%`,
          },
        },
        {
          memberStatus: {
            [Op.iLike]: `%${search}%`,
          },
        },
        {
          salesStatus: {
            [Op.iLike]: `%${search}%`,
          },
        },
        {
          notes: {
            [Op.iLike]: `%${search}%`,
          },
        },
      ];
    }

    const histories = await Membership.findAll({
      where,
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
        ["paidAt", "DESC"],
        ["createdAt", "DESC"],
        ["id", "DESC"],
      ],
    });

    const data = histories.map((item) => serializeHistory(item));

    return successResponse({
      message: "Riwayat pembayaran manager berhasil diambil",
      data,
      dashboard: buildDashboard(data),
    });
  } catch (error) {
    console.error("GET MANAGER PAYMENT HISTORY ERROR:", error);
    return errorResponse("Gagal mengambil riwayat pembayaran manager", 500);
  }
}