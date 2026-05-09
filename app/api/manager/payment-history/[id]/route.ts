import { NextRequest } from "next/server";

import { Membership, MembershipPlan, User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

function toNumber(value: unknown, defaultValue = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

function serializeHistory(membership: any) {
  const data = membership?.get ? membership.get({ plain: true }) : membership;

  return {
    id: data?.id,
    userId: data?.userId,
    salesUserId: data?.salesUserId,
    planId: data?.planId,

    packageName: data?.packageName,
    packagePrice: Number(data?.packagePrice ?? 0),

    paymentMethod: data?.paymentMethod,
    paymentStatus: data?.paymentStatus,
    paidAmount: Number(data?.paidAmount ?? 0),
    paidAt: data?.paidAt,

    paymentProofPhoto:
      data?.paymentProofPhoto ?? data?.payment_proof_photo ?? null,

    memberStatus: data?.memberStatus,
    salesStatus: data?.salesStatus ?? "pending",

    startedAt: data?.startedAt,
    expiredAt: data?.expiredAt,

    notes: data?.notes,
    createdAt: data?.createdAt,
    updatedAt: data?.updatedAt,

    user: data?.user ?? null,
    sales: data?.sales ?? null,
    plan: data?.plan ?? null,
  };
}

async function findHistoryWithRelations(id: number) {
  return Membership.findByPk(id, {
    include: [
      {
        model: User,
        as: "user",
        attributes: ["id", "name", "email", "phone", "role", "isActive"],
      },
      {
        model: User,
        as: "sales",
        attributes: ["id", "name", "email", "phone", "role"],
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

function normalizePaymentMethod(value: unknown) {
  const method = String(value ?? "").trim().toLowerCase();
  const allowed = ["cash", "transfer", "qris", "debit", "credit"];

  return allowed.includes(method) ? method : null;
}

function parseDateOrNull(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
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
      message: "Detail riwayat pembayaran berhasil diambil",
      data: serializeHistory(history),
    });
  } catch (error) {
    console.error("GET MANAGER PAYMENT HISTORY DETAIL ERROR:", error);
    return errorResponse("Gagal mengambil detail riwayat pembayaran", 500);
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const historyId = toNumber(id, 0);

    if (!historyId) {
      return errorResponse("ID riwayat tidak valid", 400);
    }

    const body = await request.json();

    const managerUserId = toNumber(
      body.managerUserId ??
        body.manager_user_id ??
        body.adminUserId ??
        body.admin_user_id,
      0,
    );

    if (!managerUserId) {
      return errorResponse("Manager user wajib dikirim", 400);
    }

    const manager = await User.findByPk(managerUserId);

    if (!manager) {
      return errorResponse("Manager tidak ditemukan", 404);
    }

    const managerRole = String(manager.get("role") ?? "").toLowerCase();

    if (managerRole !== "manager") {
      return errorResponse("User ini bukan manager", 403);
    }

    const history = await Membership.findByPk(historyId);

    if (!history) {
      return errorResponse("Riwayat pembayaran tidak ditemukan", 404);
    }

    if (history.paymentStatus !== "paid") {
      return errorResponse(
        "Hanya riwayat yang sudah paid yang bisa diedit manager",
        400,
      );
    }

    const paidAmount = toNumber(
      body.paidAmount ?? body.paid_amount ?? history.paidAmount,
      history.paidAmount,
    );

    if (!paidAmount || paidAmount <= 0) {
      return errorResponse("Nominal pembayaran wajib lebih dari 0", 400);
    }

    const paymentMethod =
      normalizePaymentMethod(body.paymentMethod ?? body.payment_method) ??
      history.paymentMethod;

    const paidAt =
      parseDateOrNull(body.paidAt ?? body.paid_at) ?? history.paidAt;

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
      !paymentProofPhoto.startsWith("https://")
    ) {
      return errorResponse("Format foto bukti pembayaran tidak valid", 400);
    }

    await history.update({
      paidAmount,
      paymentMethod,
      paidAt,
      startedAt,
      expiredAt,
      notes,
      paymentProofPhoto,
    });

    const freshHistory = await findHistoryWithRelations(history.id);

    return successResponse({
      message: "Riwayat pembayaran berhasil diupdate",
      data: serializeHistory(freshHistory),
    });
  } catch (error) {
    console.error("UPDATE MANAGER PAYMENT HISTORY ERROR:", error);
    return errorResponse("Gagal update riwayat pembayaran", 500);
  }
}
