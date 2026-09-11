import { NextRequest } from "next/server";
import { Membership, MembershipPlan, User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { getTokenFromRequest, verifyToken } from "@/lib/auth";

export const runtime = "nodejs";

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

/**
 * GET /api/admin/payments
 *
 * Ambil data pembayaran yang menunggu diproses admin.
 */
export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    const userPayload = token ? verifyToken(token) : null;

    if (!userPayload) {
      return errorResponse("Autentikasi gagal. Silakan login kembali.", 401);
    }

    const allowedRoles = ["admin", "kasir", "owner", "direktur", "manager"];
    if (!allowedRoles.includes(userPayload.role.toLowerCase())) {
      return errorResponse("Akses ditolak: Anda tidak memiliki akses ke antrean pembayaran", 403);
    }

    const payments = await Membership.findAll({
      where: {
        salesStatus: "waiting_payment",
        memberStatus: "pending",
      },
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
      order: [["id", "DESC"]],
    });

    return successResponse({
      message: "Data pembayaran admin berhasil diambil",
      data: payments.map(serializePayment),
    });
  } catch (error) {
    console.error("GET ADMIN PAYMENTS ERROR:", error);

    return errorResponse("Gagal mengambil data pembayaran admin", 500);
  }
}