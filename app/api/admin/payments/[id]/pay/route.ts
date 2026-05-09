import { NextRequest } from "next/server";

import { Membership, MembershipPlan, User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

function toNumber(value: unknown, defaultValue = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function serializePayment(membership: any) {
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

async function findPaymentWithRelations(id: number) {
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
 * POST /api/admin/payments/:id/pay
 *
 * Admin/kasir memproses pembayaran.
 *
 * Body:
 * {
 *   "adminUserId": 1,
 *   "paidAmount": 300000,
 *   "paymentMethod": "cash",
 *   "paymentProofPhoto": "http://.../image.jpg",
 *   "adminNote": "Bayar cash"
 * }
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const paymentId = toNumber(id, 0);

    if (!paymentId) {
      return errorResponse("ID pembayaran tidak valid", 400);
    }

    const body = await request.json();

    const adminUserId = toNumber(
      body.adminUserId ??
        body.admin_user_id ??
        body.cashierUserId ??
        body.cashier_user_id,
      0
    );

    const paidAmount = toNumber(body.paidAmount ?? body.paid_amount, 0);

    const paymentMethod = String(
      body.paymentMethod ?? body.payment_method ?? "cash"
    )
      .trim()
      .toLowerCase();

    const adminNote =
      body.adminNote ??
      body.admin_note ??
      body.cashierNote ??
      body.cashier_note;

    const cleanAdminNote = adminNote ? String(adminNote).trim() : null;

    const paymentProofPhoto = String(
      body.paymentProofPhoto ?? body.payment_proof_photo ?? ""
    ).trim();

    if (!adminUserId) {
      return errorResponse("Admin user wajib dikirim", 400);
    }

    if (!paidAmount || paidAmount <= 0) {
      return errorResponse("Nominal pembayaran wajib lebih dari 0", 400);
    }

    if (!paymentProofPhoto) {
      return errorResponse("Foto bukti pembayaran wajib dilampirkan", 400);
    }

    if (
      !paymentProofPhoto.startsWith("data:image/") &&
      !paymentProofPhoto.startsWith("http://") &&
      !paymentProofPhoto.startsWith("https://")
    ) {
      return errorResponse("Format foto bukti pembayaran tidak valid", 400);
    }

    const allowedPaymentMethods = [
      "cash",
      "transfer",
      "qris",
      "debit",
      "credit",
    ];

    if (!allowedPaymentMethods.includes(paymentMethod)) {
      return errorResponse(
        "Metode pembayaran hanya boleh cash, transfer, qris, debit, atau credit",
        400
      );
    }

    const admin = await User.findByPk(adminUserId);

    if (!admin) {
      return errorResponse("Admin tidak ditemukan", 404);
    }

    const adminRole = String(admin.get("role") ?? "").toLowerCase();

    if (adminRole !== "admin" && adminRole !== "kasir") {
      return errorResponse("User ini bukan admin/kasir", 403);
    }

    const membership = await Membership.findByPk(paymentId);

    if (!membership) {
      return errorResponse("Data pembayaran tidak ditemukan", 404);
    }

    if (membership.paymentStatus === "paid") {
      return errorResponse("Pembayaran ini sudah lunas", 400);
    }

    if (membership.memberStatus === "active") {
      return errorResponse("Membership ini sudah aktif", 400);
    }

    const plan = membership.planId
      ? await MembershipPlan.findByPk(membership.planId)
      : null;

    const planData = plan ? plan.get({ plain: true }) : null;

    const packagePrice = Number(membership.packagePrice ?? planData?.price ?? 0);

    if (paidAmount < packagePrice) {
      return errorResponse(
        `Nominal bayar kurang. Harga paket ${packagePrice}, dibayar ${paidAmount}`,
        400
      );
    }

    const durationDays = Math.max(Number(planData?.durationDays ?? 30), 1);
    const freeMembershipDays = Math.max(
      Number(planData?.freeMembershipDays ?? 0),
      0
    );

    const totalActiveDays = Math.max(durationDays + freeMembershipDays, 1);

    const startedAt = new Date();
    const expiredAt = addDays(startedAt, totalActiveDays);

    const oldNotes = membership.notes ? String(membership.notes) : "";

    const activePeriodNote = `Masa aktif: ${durationDays} hari${
      freeMembershipDays > 0
        ? ` + free membership ${freeMembershipDays} hari`
        : ""
    } = total ${totalActiveDays} hari`;

    const mergedNote = cleanAdminNote
      ? `Catatan admin: ${cleanAdminNote}\n${activePeriodNote}`
      : activePeriodNote;

    const newNotes = oldNotes
      ? `${oldNotes}\n\n${mergedNote}`
      : mergedNote;

    await membership.update({
      paymentMethod,
      paymentStatus: "paid",
      paidAmount,
      paidAt: startedAt,

      paymentProofPhoto,

      memberStatus: "active",
      salesStatus: "completed",

      startedAt,
      expiredAt,

      notes: newNotes,
    });

    const freshPayment = await findPaymentWithRelations(membership.id);

    return successResponse({
      message: "Pembayaran berhasil. Membership sudah aktif.",
      data: {
        payment: serializePayment(freshPayment),
      },
    });
  } catch (error) {
    console.error("PAY ADMIN PAYMENT ERROR:", error);

    return errorResponse("Gagal memproses pembayaran", 500);
  }
}