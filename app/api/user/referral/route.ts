import { Op } from "sequelize";

import { Membership, User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { requireAuth } from "@/lib/rbac";

export const runtime = "nodejs";

const REFERRAL_REWARD_AMOUNT = 50000;

function toNumber(value: unknown, defaultValue = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

function serializeDate(value: unknown) {
  if (!value) return null;

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(String(value));

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function getMembershipStatus(membership: unknown) {
  if (!membership) return "pending";

  const data = (
    typeof (membership as { get?: unknown }).get === "function"
      ? (membership as { get: (opt: { plain: boolean }) => Record<string, unknown> }).get({ plain: true })
      : membership
  ) as Record<string, unknown>;

  const paymentStatus = String(
    data.paymentStatus ?? data.payment_status ?? "",
  ).toLowerCase();

  const memberStatus = String(
    data.memberStatus ?? data.member_status ?? "",
  ).toLowerCase();

  const salesStatus = String(
    data.salesStatus ?? data.sales_status ?? "",
  ).toLowerCase();

  if (paymentStatus === "paid") {
    return "rewarded";
  }

  if (
    memberStatus === "revoked" ||
    memberStatus === "cancelled" ||
    salesStatus === "rejected" ||
    salesStatus === "cancelled"
  ) {
    return "failed";
  }

  if (memberStatus === "active") {
    return "active";
  }

  return "pending";
}

function serializeReferralUser(user: unknown, membership: unknown) {
  const userData = (
    typeof (user as { get?: unknown }).get === "function"
      ? (user as { get: (opt: { plain: boolean }) => Record<string, unknown> }).get({ plain: true })
      : user
  ) as Record<string, unknown>;

  const membershipData = (
    membership && typeof (membership as { get?: unknown }).get === "function"
      ? (membership as { get: (opt: { plain: boolean }) => Record<string, unknown> }).get({ plain: true })
      : membership
  ) as Record<string, unknown> | null;

  const status = getMembershipStatus(membershipData);
  const reward = status === "rewarded" ? REFERRAL_REWARD_AMOUNT : 0;

  return {
    id: userData.id,
    name: userData.name ?? "",
    email: userData.email ?? "",
    phone: userData.phone ?? "",
    referredByCode: userData.referredByCode ?? userData.referred_by_code ?? null,
    joinedAt: serializeDate(userData.createdAt ?? userData.created_at),

    membershipId: membershipData?.id ?? null,
    packageName:
      membershipData?.packageName ??
      membershipData?.package_name ??
      "Belum pilih paket",
    packagePrice: Number(
      membershipData?.packagePrice ?? membershipData?.package_price ?? 0,
    ),
    paymentStatus:
      membershipData?.paymentStatus ?? membershipData?.payment_status ?? null,
    memberStatus:
      membershipData?.memberStatus ?? membershipData?.member_status ?? null,
    paidAt: serializeDate(membershipData?.paidAt ?? membershipData?.paid_at),
    usedAt: serializeDate(
      membershipData?.paidAt ??
        membershipData?.paid_at ??
        membershipData?.createdAt ??
        membershipData?.created_at ??
        userData.createdAt ??
        userData.created_at,
    ),

    status,
    reward,
  };
}

/**
 * GET /api/user/referral?userId=1
 */
export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    if (!auth.success) {
      return errorResponse(auth.message, auth.statusCode);
    }

    const url = new URL(request.url);
    const queryUserId = toNumber(url.searchParams.get("userId"), 0);
    const targetUserId = queryUserId > 0 ? queryUserId : auth.user.id;

    const requesterRole = String(auth.user.role || "").toLowerCase();
    const isStaff = ["admin", "owner", "direktur", "manager", "sales"].includes(requesterRole);

    if (targetUserId !== auth.user.id && !isStaff) {
      return errorResponse(
        "Akses ditolak: Anda tidak memiliki izin untuk melihat data referral pengguna lain",
        403
      );
    }

    const user = await User.findByPk(targetUserId);

    if (!user) {
      return errorResponse("User tidak ditemukan", 404);
    }

    const userData = user.get({ plain: true }) as unknown as Record<string, unknown>;

    const referredUsers = await User.findAll({
      where: {
        referredByUserId: targetUserId,
      },
      order: [
        ["createdAt", "DESC"],
        ["id", "DESC"],
      ],
    });

    const referredUserIds = referredUsers
      .map((referredUser) => {
        const referredUserData =
          typeof referredUser.get === "function"
            ? referredUser.get({ plain: true })
            : referredUser;
        return Number((referredUserData as any).id);
      })
      .filter((id) => Number.isFinite(id) && id > 0);

    const memberships =
      referredUserIds.length > 0
        ? await Membership.findAll({
            where: {
              userId: {
                [Op.in]: referredUserIds,
              },
              paymentStatus: {
                [Op.in]: ["paid", "unpaid"],
              },
              memberStatus: {
                [Op.in]: ["pending", "active", "expired", "revoked"],
              },
            },
            attributes: {
              exclude: ["paymentProofPhoto"],
            },
            order: [
              ["createdAt", "DESC"],
              ["id", "DESC"],
            ],
          })
        : [];

    const latestMembershipByUser = new Map<number, any>();
    for (const membership of memberships) {
      const plain =
        typeof membership.get === "function"
          ? membership.get({ plain: true })
          : membership;
      const uid = Number((plain as any).userId ?? (plain as any).user_id);
      if (uid > 0 && !latestMembershipByUser.has(uid)) {
        latestMembershipByUser.set(uid, membership);
      }
    }

    const users = referredUsers.map((referredUser) => {
      const referredUserData =
        typeof referredUser.get === "function"
          ? referredUser.get({ plain: true })
          : referredUser;
      const uid = Number((referredUserData as any).id);
      const membership = latestMembershipByUser.get(uid) || null;
      return serializeReferralUser(referredUser, membership);
    });

    const totalUsed = users.length;
    const totalRewarded = users.filter(
      (item) => item.status === "rewarded",
    ).length;
    const totalPending = users.filter(
      (item) => item.status === "pending",
    ).length;
    const totalActive = users.filter((item) => item.status === "active").length;
    const totalFailed = users.filter((item) => item.status === "failed").length;
    const totalReward = users.reduce((sum, item) => sum + item.reward, 0);

    return successResponse({
      message: "Data referral berhasil diambil",
      data: {
        user: {
          id: userData.id,
          name: userData.name ?? "",
          email: userData.email ?? "",
          phone: userData.phone ?? "",
          role: userData.role ?? "",
          referralCode:
            userData.referralCode ?? userData.referral_code ?? "",
        },
        referralCode:
          userData.referralCode ?? userData.referral_code ?? "",
        totalUsed,
        totalRewarded,
        totalPending,
        totalActive,
        totalFailed,
        totalReward,
        rewardPerPaidReferral: REFERRAL_REWARD_AMOUNT,
        users,
      },
    });
  } catch (error) {
    console.error("GET USER REFERRAL ERROR:", error);
    return errorResponse("Gagal mengambil data referral", 500, error);
  }
}