import { Op } from "sequelize";

import { Membership, MembershipPlan, User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

function uniqueNumbers(values: Array<number | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
  );
}

function makeMapById(items: any[]) {
  const map = new Map<number, any>();

  for (const item of items) {
    const data = item?.get ? item.get({ plain: true }) : item;
    map.set(Number(data.id), data);
  }

  return map;
}

function serializeUser(user: any) {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name ?? "",
    email: user.email ?? "",
    phone: user.phone ?? "",
    role: user.role ?? "",
    isActive: user.isActive ?? user.is_active ?? true,
  };
}

function serializePlan(plan: any) {
  if (!plan) return null;

  return {
    id: plan.id,
    programName: plan.programName ?? plan.program_name ?? "",
    customerCategory: plan.customerCategory ?? plan.customer_category ?? "",
    packageCode: plan.packageCode ?? plan.package_code ?? "",
    name: plan.name ?? "",
    description: plan.description ?? null,
    imageUrl: plan.imageUrl ?? plan.image_url ?? null,
    price: Number(plan.price ?? 0),
    discountPercent: Number(plan.discountPercent ?? plan.discount_percent ?? 0),
    personalTrainerSessions: Number(
      plan.personalTrainerSessions ?? plan.personal_trainer_sessions ?? 0
    ),
    pilatesSessions: Number(plan.pilatesSessions ?? plan.pilates_sessions ?? 0),
    freeMembershipMonths: Number(
      plan.freeMembershipMonths ?? plan.free_membership_months ?? 0
    ),
    benefits: Array.isArray(plan.benefits) ? plan.benefits : [],
    isActive: plan.isActive ?? plan.is_active ?? true,
    createdAt: plan.createdAt ?? plan.created_at ?? null,
    updatedAt: plan.updatedAt ?? plan.updated_at ?? null,
  };
}

function serializeHistory(
  membership: any,
  maps?: {
    usersById?: Map<number, any>;
    plansById?: Map<number, any>;
  }
) {
  const data = membership?.get ? membership.get({ plain: true }) : membership;

  const user = maps?.usersById?.get(Number(data?.userId));
  const sales = maps?.usersById?.get(Number(data?.salesUserId));
  const plan = maps?.plansById?.get(Number(data?.planId));

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

    user: serializeUser(user),
    sales: serializeUser(sales),
    plan: serializePlan(plan),
  };
}

/**
 * GET /api/admin/payment-history
 *
 * Riwayat pembayaran admin.
 *
 * Query optional:
 * /api/admin/payment-history?memberStatus=active
 * /api/admin/payment-history?memberStatus=revoked
 * /api/admin/payment-history?memberStatus=expired
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const memberStatus = String(url.searchParams.get("memberStatus") ?? "")
      .trim()
      .toLowerCase();

    const where: Record<string, unknown> = {
      paymentStatus: "paid",
    };

    if (memberStatus) {
      where.memberStatus = memberStatus;
    }

    const histories = await Membership.findAll({
      where,
      order: [
        ["paidAt", "DESC"],
        ["id", "DESC"],
      ],
    });

    const plainHistories = histories.map((item) => item.get({ plain: true }));

    const userIds = uniqueNumbers([
      ...plainHistories.map((item: any) => item.userId),
      ...plainHistories.map((item: any) => item.salesUserId),
    ]);

    const planIds = uniqueNumbers(
      plainHistories.map((item: any) => item.planId)
    );

    const users = userIds.length
      ? await User.findAll({
          where: {
            id: {
              [Op.in]: userIds,
            },
          },
        })
      : [];

    const plans = planIds.length
      ? await MembershipPlan.findAll({
          where: {
            id: {
              [Op.in]: planIds,
            },
          },
        })
      : [];

    const usersById = makeMapById(users);
    const plansById = makeMapById(plans);

    return successResponse({
      message: "Riwayat pembayaran admin berhasil diambil",
      data: plainHistories.map((history) =>
        serializeHistory(history, {
          usersById,
          plansById,
        })
      ),
    });
  } catch (error) {
    console.error("GET ADMIN PAYMENT HISTORY ERROR:", error);

    return errorResponse("Gagal mengambil riwayat pembayaran admin", 500);
  }
}