import { NextRequest } from "next/server";

import { Membership, MembershipPlan, User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

function toNumber(value: unknown, defaultValue = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

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
    paymentProofPhoto: data.paymentProofPhoto ?? null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,

    user: data.user ?? null,
    sales: data.sales ?? null,
    plan: data.plan ?? null,
  };
}

/**
 * GET /api/sales/members?salesUserId=4
 *
 * Ambil riwayat membership/follow up milik sales.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const salesUserId = toNumber(searchParams.get("salesUserId"), 0);

    const where: Record<string, unknown> = {};

    if (salesUserId > 0) {
      where.salesUserId = salesUserId;
    }

    const memberships = await Membership.findAll({
      where,
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
      order: [["id", "DESC"]],
    });

    return successResponse({
      message: "Data member sales berhasil diambil",
      data: memberships.map(serializeMembership),
    });
  } catch (error) {
    console.error("GET SALES MEMBERS ERROR:", error);
    return errorResponse("Gagal mengambil data member sales", 500);
  }
}

/**
 * POST /api/sales/members
 *
 * Sales hanya membuat status/follow up membership.
 * Nominal pembayaran tidak diisi sales.
 * Kasir nanti yang mengubah:
 * - paymentStatus
 * - paidAmount
 * - paidAt
 * - memberStatus
 * - startedAt
 * - expiredAt
 */
export async function POST(request: NextRequest) {
  try {
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
    const paymentProofPhoto = body.paymentProofPhoto ? String(body.paymentProofPhoto) : null;

    if (!salesUserId) {
      return errorResponse("Sales user wajib dikirim", 400);
    }

    if (!userId) {
      return errorResponse("User customer/member wajib dipilih", 400);
    }

    if (!planId) {
      return errorResponse("Paket membership wajib dipilih", 400);
    }

    const allowedSalesStatuses = [
      "pending",
      "follow_up",
      "interested",
      "waiting_payment",
      "not_interested",
      "cancelled",
    ];

    if (!allowedSalesStatuses.includes(salesStatus)) {
      return errorResponse(
        "Status sales hanya boleh pending, follow_up, interested, waiting_payment, not_interested, atau cancelled",
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

    const membership = await Membership.create({
      userId,
      salesUserId,
      planId,

      packageName: planData.name,
      packagePrice: Number(planData.price ?? 0),

      paymentMethod: "cashier",
      paymentStatus: "unpaid",
      paidAmount: 0,
      paidAt: null,

      memberStatus: "pending",
      salesStatus: salesStatus as any,

      startedAt: null,
      expiredAt: null,

      notes,
      paymentProofPhoto,
    });

    const freshMembership = await Membership.findByPk(membership.id, {
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

    return successResponse({
      message: "Status sales berhasil disimpan. Pembayaran menunggu kasir.",
      data: {
        membership: serializeMembership(freshMembership),
      },
    });
  } catch (error) {
    console.error("CREATE SALES MEMBER ERROR:", error);
    return errorResponse("Gagal membuat status sales", 500);
  }
}