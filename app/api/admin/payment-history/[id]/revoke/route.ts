import { NextRequest } from "next/server";

import { sequelize } from "@/database/connection";
import { Membership, MembershipPlan, User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { requireFeature } from "@/lib/feature-permission";

export const runtime = "nodejs";

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

    const auth = await requireFeature(
      request,
      ["admin.kasir", "kasir.verifikasi", "kasir.pembayaran", "manager.pembayaran"],
      ["admin", "kasir", "manager"]
    );
    if (!auth.success) {
      return errorResponse(auth.message, auth.statusCode);
    }

    const resolvedAdminId = auth.user.id;

    const body = await request.json().catch(() => ({}));

    const revokeReason = String(
      body.revokeReason ?? body.revoke_reason ?? ""
    ).trim();

    if (!revokeReason) {
      return errorResponse("Alasan cabut membership wajib diisi", 400);
    }

    const admin = await User.findByPk(resolvedAdminId);

    if (!admin) {
      return errorResponse("Admin/Kasir tidak ditemukan", 404);
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
    const adminName = admin.get("name") || admin.get("email") || "Admin";
    const timestampStr = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    const revocationLog = `[REVOKE ${timestampStr}] Oleh ${adminName} (ID: ${resolvedAdminId}): ${revokeReason}`;

    const newNotes = oldNotes
      ? `${oldNotes}\n\n${revocationLog}`
      : revocationLog;

    const t = await sequelize.transaction();

    try {
      await history.update(
        {
          memberStatus: "revoked",
          salesStatus: "completed",
          expiredAt: new Date(),
          processedByUserId: resolvedAdminId,
          notes: newNotes,
        },
        { transaction: t }
      );

      await t.commit();
    } catch (dbError) {
      await t.rollback();
      throw dbError;
    }

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