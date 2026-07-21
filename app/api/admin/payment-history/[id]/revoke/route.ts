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

/**
 * POST /api/admin/payment-history/:id/revoke
 *
 * Cabut membership.
 * Data tidak dihapus.
 *
 * Body:
 * {
 *   "adminUserId": 1,
 *   "revokeReason": "Member minta dibatalkan"
 * }
 */
export async function POST(
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
        body.cashierUserId ??
        body.cashier_user_id,
      0
    );

    const revokeReason = String(
      body.revokeReason ?? body.revoke_reason ?? ""
    ).trim();

    if (!adminUserId) {
      return errorResponse("Admin user wajib dikirim", 400);
    }

    if (!revokeReason) {
      return errorResponse("Alasan cabut membership wajib diisi", 400);
    }

    const admin = await User.findByPk(adminUserId);

    if (!admin) {
      return errorResponse("Admin tidak ditemukan", 404);
    }

    const adminRole = String(admin.get("role") ?? "").toLowerCase();

    if (adminRole !== "admin" && adminRole !== "kasir" && adminRole !== "owner" && adminRole !== "direktur") {
      return errorResponse("User ini bukan admin/kasir/owner/direktur", 403);
    }

    const history = await Membership.findByPk(historyId);

    if (!history) {
      return errorResponse("Riwayat pembayaran tidak ditemukan", 404);
    }

    if (history.paymentStatus !== "paid") {
      return errorResponse(
        "Membership yang belum paid tidak bisa dicabut dari riwayat admin",
        400
      );
    }

    const currentMemberStatus = String(history.memberStatus ?? "").toLowerCase();

    if (currentMemberStatus === "revoked" || currentMemberStatus === "revoke") {
      return errorResponse("Membership ini sudah dicabut", 400);
    }

    const oldNotes = history.notes ? String(history.notes) : "";
    const newNotes = oldNotes
      ? `${oldNotes}\n\nCabut membership: ${revokeReason}`
      : `Cabut membership: ${revokeReason}`;

    await history.update({
      memberStatus: "revoked",
      salesStatus: "completed",
      expiredAt: new Date(),
      notes: newNotes,
    });

    const freshHistory = await findHistoryWithRelations(history.id);

    return successResponse({
      message: "Membership berhasil dicabut. Data riwayat tetap tersimpan.",
      data: serializeHistory(freshHistory),
    });
  } catch (error) {
    console.error("REVOKE ADMIN PAYMENT HISTORY ERROR:", error);

    return errorResponse("Gagal mencabut membership", 500);
  }
}