import { NextRequest } from "next/server";

import { Membership, MembershipPlan, User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

function toNumber(value: unknown, defaultValue = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

function normalizeRole(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizePaymentMethod(value: unknown) {
  const method = String(value ?? "").trim().toLowerCase();

  const allowed = [
    "cash",
    "cashier",
    "transfer",
    "qris",
    "debit",
    "credit",
    "cashless",
  ];

  return allowed.includes(method) ? method : null;
}

function parseDateOrNull(value: unknown) {
  const text = String(value ?? "").trim();

  if (!text) return null;

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) return null;

  return date;
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

async function findHistoryWithRelations(id: number) {
  return Membership.findByPk(id, {
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
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const historyId = toNumber(id, 0);

    if (!historyId) {
      return errorResponse("ID riwayat tidak valid", 400);
    }

    const history = await findHistoryWithRelations(historyId);

    if (!history) {
      return errorResponse("Riwayat pembayaran tidak ditemukan", 404);
    }

    return successResponse({
      message: "Detail riwayat pembayaran manager berhasil diambil",
      data: serializeHistory(history),
    });
  } catch (error) {
    console.error("GET MANAGER PAYMENT HISTORY DETAIL ERROR:", error);
    return errorResponse("Gagal mengambil detail riwayat pembayaran manager", 500);
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const historyId = toNumber(id, 0);

    if (!historyId) {
      return errorResponse("ID riwayat tidak valid", 400);
    }

    const body = await request.json();

    const adminUserId = toNumber(
      body.adminUserId ??
        body.admin_user_id ??
        body.processedByUserId ??
        body.processed_by_user_id,
      0
    );

    if (!adminUserId) {
      return errorResponse("Admin user wajib dikirim", 400);
    }

    const admin = await User.findByPk(adminUserId);

    if (!admin) {
      return errorResponse("Admin tidak ditemukan", 404);
    }

    const adminRole = normalizeRole(admin.get("role"));

    if (adminRole !== "admin" && adminRole !== "manager" && adminRole !== "direktur" && adminRole !== "owner") {
      return errorResponse("User yang memproses pembayaran wajib role admin, manager, direktur, atau owner", 403);
    }

    const history = await Membership.findByPk(historyId);

    if (!history) {
      return errorResponse("Riwayat pembayaran tidak ditemukan", 404);
    }

    const paidAmount = toNumber(
      body.paidAmount ?? body.paid_amount ?? history.paidAmount,
      history.paidAmount
    );

    if (!paidAmount || paidAmount <= 0) {
      return errorResponse("Nominal pembayaran wajib lebih dari 0", 400);
    }

    const paymentMethod =
      normalizePaymentMethod(body.paymentMethod ?? body.payment_method) ??
      history.paymentMethod;

    const paidAt =
      parseDateOrNull(body.paidAt ?? body.paid_at) ??
      history.paidAt ??
      new Date();

    const startedAt =
      parseDateOrNull(body.startedAt ?? body.started_at) ?? history.startedAt;

    const expiredAt =
      parseDateOrNull(body.expiredAt ?? body.expired_at) ?? history.expiredAt;

    const notes =
      body.notes === undefined || body.notes === null
        ? history.notes
        : String(body.notes).trim() || null;

    const paymentProofPhoto =
      body.paymentProofPhoto === undefined &&
      body.payment_proof_photo === undefined
        ? history.paymentProofPhoto
        : String(body.paymentProofPhoto ?? body.payment_proof_photo ?? "").trim();

    if (!paymentProofPhoto) {
      return errorResponse("Foto bukti pembayaran wajib ada", 400);
    }

    if (
      !paymentProofPhoto.startsWith("data:image/") &&
      !paymentProofPhoto.startsWith("http://") &&
      !paymentProofPhoto.startsWith("https://") &&
      !paymentProofPhoto.startsWith("/uploads/") &&
      !paymentProofPhoto.startsWith("uploads/")
    ) {
      return errorResponse("Format foto bukti pembayaran tidak valid", 400);
    }

    await history.update({
      paymentStatus: "paid",
      paidAmount,
      paymentMethod,
      paidAt,
      startedAt,
      expiredAt,
      notes,
      paymentProofPhoto,
      processedByUserId: adminUserId,
    });

    const freshHistory = await findHistoryWithRelations(history.id);

    return successResponse({
      message: "Pembayaran berhasil diproses oleh admin",
      data: serializeHistory(freshHistory),
    });
  } catch (error) {
    console.error("UPDATE MANAGER PAYMENT HISTORY ERROR:", error);
    return errorResponse("Gagal update riwayat pembayaran manager", 500);
  }
}