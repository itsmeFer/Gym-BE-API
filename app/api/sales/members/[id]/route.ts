import { NextRequest } from "next/server";

import { Membership, MembershipPlan, User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

function toNumber(value: unknown, defaultValue = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

const allowedSalesStatuses = [
  "pending",
  "follow_up",
  "interested",
  "waiting_payment",
  "not_interested",
  "cancelled",
];

function serializeMembership(membership: any) {
  const data = membership.get ? membership.get({ plain: true }) : membership;

  return {
    id: data.id,
    userId: data.userId,
    salesUserId: data.salesUserId,
    planId: data.planId,

    packageName: data.packageName,
    packagePrice: Number(data.packagePrice ?? 0),

    paymentMethod: data.paymentMethod,
    paymentStatus: data.paymentStatus,
    paidAmount: Number(data.paidAmount ?? 0),
    paidAt: data.paidAt,

    memberStatus: data.memberStatus,
    salesStatus: data.salesStatus ?? "pending",

    startedAt: data.startedAt,
    expiredAt: data.expiredAt,

    notes: data.notes,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,

    user: data.user ?? null,
    sales: data.sales ?? null,
    plan: data.plan ?? null,
  };
}

async function findMembershipWithRelations(id: number) {
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
      },
      {
        model: MembershipPlan,
        as: "plan",
      },
    ],
  });
}

/**
 * GET /api/sales/members/:id
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const membershipId = toNumber(id, 0);

    if (!membershipId) {
      return errorResponse("ID membership tidak valid", 400);
    }

    const membership = await findMembershipWithRelations(membershipId);

    if (!membership) {
      return errorResponse("Data membership tidak ditemukan", 404);
    }

    return successResponse({
      message: "Detail membership berhasil diambil",
      data: serializeMembership(membership),
    });
  } catch (error) {
    console.error("GET SALES MEMBER DETAIL ERROR:", error);
    return errorResponse("Gagal mengambil detail membership", 500);
  }
}

/**
 * PUT /api/sales/members/:id
 *
 * Sales hanya boleh update:
 * - userId
 * - planId
 * - salesStatus
 * - notes
 *
 * Sales tidak boleh update pembayaran.
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const membershipId = toNumber(id, 0);

    if (!membershipId) {
      return errorResponse("ID membership tidak valid", 400);
    }

    const body = await request.json();

    const salesUserId = toNumber(body.salesUserId ?? body.sales_user_id, 0);
    const userId = toNumber(body.userId ?? body.user_id, 0);
    const planId = toNumber(body.planId ?? body.plan_id, 0);

    const salesStatus = String(
      body.salesStatus ?? body.sales_status ?? "pending",
    )
      .trim()
      .toLowerCase();

    const notes = body.notes ? String(body.notes).trim() : null;

    if (!salesUserId) {
      return errorResponse("Sales user wajib dikirim", 400);
    }

    if (!userId) {
      return errorResponse("User customer/member wajib dipilih", 400);
    }

    if (!planId) {
      return errorResponse("Paket membership wajib dipilih", 400);
    }

    if (!allowedSalesStatuses.includes(salesStatus)) {
      return errorResponse(
        "Status sales tidak valid",
        400,
      );
    }

    const membership = await Membership.findByPk(membershipId);

    if (!membership) {
      return errorResponse("Data membership tidak ditemukan", 404);
    }

    if (membership.salesUserId !== salesUserId) {
      return errorResponse("Data ini bukan milik sales tersebut", 403);
    }

    if (
      membership.paymentStatus === "paid" ||
      membership.memberStatus === "active"
    ) {
      return errorResponse(
        "Data yang sudah dibayar/aktif tidak bisa diedit oleh sales",
        400,
      );
    }

    const salesUser = await User.findByPk(salesUserId);

    if (!salesUser) {
      return errorResponse("Sales tidak ditemukan", 404);
    }

    if (salesUser.role !== "sales") {
      return errorResponse("User ini bukan role sales", 400);
    }

    const user = await User.findByPk(userId);

    if (!user) {
      return errorResponse("User customer/member tidak ditemukan", 404);
    }

    if (user.role !== "customer") {
      return errorResponse("User yang dipilih harus role customer", 400);
    }

    const plan = await MembershipPlan.findByPk(planId);

    if (!plan) {
      return errorResponse("Paket membership tidak ditemukan", 404);
    }

    const planData = plan.get({ plain: true });

    if (planData.isActive === false) {
      return errorResponse("Paket membership sedang tidak aktif", 400);
    }

    await membership.update({
      userId,
      planId,
      packageName: planData.name,
      packagePrice: Number(planData.price ?? 0),
      salesStatus: salesStatus as any,
      notes,
    });

    const freshMembership = await findMembershipWithRelations(membership.id);

    return successResponse({
      message: "Status sales berhasil diperbarui",
      data: {
        membership: serializeMembership(freshMembership),
      },
    });
  } catch (error) {
    console.error("UPDATE SALES MEMBER ERROR:", error);
    return errorResponse("Gagal memperbarui status sales", 500);
  }
}

/**
 * DELETE /api/sales/members/:id
 *
 * Sales hanya boleh hapus data yang belum dibayar dan belum aktif.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const membershipId = toNumber(id, 0);

    if (!membershipId) {
      return errorResponse("ID membership tidak valid", 400);
    }

    const salesUserId = toNumber(
      request.nextUrl.searchParams.get("salesUserId"),
      0,
    );

    if (!salesUserId) {
      return errorResponse("Sales user wajib dikirim", 400);
    }

    const membership = await Membership.findByPk(membershipId);

    if (!membership) {
      return errorResponse("Data membership tidak ditemukan", 404);
    }

    if (membership.salesUserId !== salesUserId) {
      return errorResponse("Data ini bukan milik sales tersebut", 403);
    }

    if (
      membership.paymentStatus === "paid" ||
      membership.memberStatus === "active"
    ) {
      return errorResponse(
        "Data yang sudah dibayar/aktif tidak bisa dihapus oleh sales",
        400,
      );
    }

    await membership.destroy();

    return successResponse({
      message: "Status sales berhasil dihapus",
      data: {
        id: membershipId,
      },
    });
  } catch (error) {
    console.error("DELETE SALES MEMBER ERROR:", error);
    return errorResponse("Gagal menghapus status sales", 500);
  }
}