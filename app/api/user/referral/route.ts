import { Op } from "sequelize";

import { Membership, User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

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

function getMembershipStatus(membership: any) {
  if (!membership) return "pending";

  const data = membership?.get ? membership.get({ plain: true }) : membership;

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

function serializeReferralUser(user: any, membership: any) {
  const userData = user?.get ? user.get({ plain: true }) : user;
  const membershipData = membership?.get
    ? membership.get({ plain: true })
    : membership;

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
    const url = new URL(request.url);
    const userId = toNumber(url.searchParams.get("userId"), 0);

    if (!userId) {
      return errorResponse("User ID wajib dikirim", 400);
    }

    const user = await User.findByPk(userId);

    if (!user) {
      return errorResponse("User tidak ditemukan", 404);
    }

    const userData = user.get({ plain: true }) as any;

    const referredUsers = await User.findAll({
      where: {
        referredByUserId: userId,
      },
      order: [
        ["createdAt", "DESC"],
        ["id", "DESC"],
      ],
    });

    const users = await Promise.all(
      referredUsers.map(async (referredUser) => {
        const referredUserData = referredUser.get({ plain: true }) as any;

        const membership = await Membership.findOne({
          where: {
            userId: referredUserData.id,
            paymentStatus: {
              [Op.in]: ["paid", "unpaid"],
            },
            memberStatus: {
              [Op.in]: ["pending", "active", "expired", "revoked"],
            },
          },
          order: [
            ["createdAt", "DESC"],
            ["id", "DESC"],
          ],
        });

        return serializeReferralUser(referredUser, membership);
      }),
    );

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