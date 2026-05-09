import { Op } from "sequelize";

import { Membership, MembershipPlan, User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

function toNumber(value: unknown, defaultValue = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

function toBoolean(value: unknown, defaultValue = false) {
  if (typeof value === "boolean") return value;

  const text = String(value ?? "").trim().toLowerCase();

  if (text === "true" || text === "1") return true;
  if (text === "false" || text === "0") return false;

  return defaultValue;
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
    isActive: data.isActive ?? data.is_active ?? true,
  };
}

function serializePlan(plan: any) {
  if (!plan) return null;

  const data = plan?.get ? plan.get({ plain: true }) : plan;

  const durationDays = Math.max(
    Number(data.durationDays ?? data.duration_days ?? 30),
    1,
  );

  const freeMembershipDays = Math.max(
    Number(data.freeMembershipDays ?? data.free_membership_days ?? 0),
    0,
  );

  const totalActiveDays = Math.max(durationDays + freeMembershipDays, 1);

  return {
    id: data.id,
    programName: data.programName ?? data.program_name ?? "",
    customerCategory: data.customerCategory ?? data.customer_category ?? "",
    packageCode: data.packageCode ?? data.package_code ?? "",
    name: data.name ?? "",
    description: data.description ?? null,
    imageUrl: data.imageUrl ?? data.image_url ?? null,

    price: Number(data.price ?? 0),

    durationDays,
    freeMembershipDays,
    totalActiveDays,

    discountPercent: Number(data.discountPercent ?? data.discount_percent ?? 0),

    personalTrainerSessions: Number(
      data.personalTrainerSessions ?? data.personal_trainer_sessions ?? 0,
    ),

    pilatesSessions: Number(data.pilatesSessions ?? data.pilates_sessions ?? 0),

    benefits: Array.isArray(data.benefits) ? data.benefits : [],

    isActive: data.isActive ?? data.is_active ?? true,
    createdAt: data.createdAt ?? data.created_at ?? null,
    updatedAt: data.updatedAt ?? data.updated_at ?? null,
  };
}

function serializeMembership(membership: any, user: any, plan: any) {
  if (!membership) return null;

  const data = membership?.get ? membership.get({ plain: true }) : membership;
  const serializedPlan = serializePlan(plan);

  const userScheduleSet = toBoolean(
    data.userScheduleSet ?? data.user_schedule_set,
    false,
  );

  const scheduleEditCount = Math.max(
    Number(data.scheduleEditCount ?? data.schedule_edit_count ?? 0),
    0,
  );

  const canEditSchedule = userScheduleSet && scheduleEditCount < 1;
  const remainingScheduleEdit = userScheduleSet
    ? Math.max(1 - scheduleEditCount, 0)
    : 1;

  return {
    id: data.id,
    userId: data.userId ?? data.user_id,
    salesUserId: data.salesUserId ?? data.sales_user_id,
    planId: data.planId ?? data.plan_id,

    packageName: data.packageName ?? data.package_name,
    packagePrice: Number(data.packagePrice ?? data.package_price ?? 0),

    paymentMethod: data.paymentMethod ?? data.payment_method,
    paymentStatus: data.paymentStatus ?? data.payment_status,
    paidAmount: Number(data.paidAmount ?? data.paid_amount ?? 0),
    paidAt: data.paidAt ?? data.paid_at,

    paymentProofPhoto:
      data.paymentProofPhoto ?? data.payment_proof_photo ?? null,

    memberStatus: data.memberStatus ?? data.member_status,
    salesStatus: data.salesStatus ?? data.sales_status ?? "pending",

    startedAt: data.startedAt ?? data.started_at,
    expiredAt: data.expiredAt ?? data.expired_at,

    userScheduleSet,
    scheduleEditCount,
    canEditSchedule,
    remainingScheduleEdit,

    notes: data.notes,
    createdAt: data.createdAt ?? data.created_at,
    updatedAt: data.updatedAt ?? data.updated_at,

    user: serializeUser(user),
    plan: serializedPlan,
  };
}

/**
 * GET /api/user/membership?userId=1
 *
 * Ambil membership terakhir milik user.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = toNumber(url.searchParams.get("userId"), 0);

    if (!userId) {
      return errorResponse("User ID wajib dikirim", 400);
    }

    const user = await User.findByPk(userId);

    if (!user) {
      return errorResponse("User tidak ditemukan", 404);
    }

    const membership = await Membership.findOne({
      where: {
        userId,
        paymentStatus: {
          [Op.in]: ["paid", "unpaid"],
        },
        memberStatus: {
          [Op.in]: ["pending", "active", "expired", "revoked"],
        },
      },
      order: [
        ["createdAt", "DESC"],
        ["id", "DESC"],
      ],
    });

    if (!membership) {
      return successResponse({
        message: "User belum punya paket membership",
        data: {
          hasMembership: false,
          membership: null,
        },
      });
    }

    const plan = membership.planId
      ? await MembershipPlan.findByPk(membership.planId)
      : null;

    return successResponse({
      message: "Paket membership user berhasil diambil",
      data: {
        hasMembership: true,
        membership: serializeMembership(membership, user, plan),
      },
    });
  } catch (error) {
    console.error("GET USER MEMBERSHIP ERROR:", error);
    return errorResponse("Gagal mengambil paket membership user", 500);
  }
}