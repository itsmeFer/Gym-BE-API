import { Op } from "sequelize";

import { Membership, User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

export const runtime = "nodejs";

type StatusType = "active" | "pending" | "failed";

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

function getPlain(model: any) {
  return model?.get ? model.get({ plain: true }) : model;
}

function toNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getMembershipStatus(membership: any): StatusType {
  if (!membership) return "pending";

  const data = getPlain(membership) as any;

  const paymentStatus = String(
    data.paymentStatus ?? data.payment_status ?? "",
  ).toLowerCase();

  const memberStatus = String(
    data.memberStatus ?? data.member_status ?? "",
  ).toLowerCase();

  const salesStatus = String(
    data.salesStatus ?? data.sales_status ?? "",
  ).toLowerCase();

  if (
    memberStatus === "revoked" ||
    memberStatus === "cancelled" ||
    memberStatus === "canceled" ||
    salesStatus === "rejected" ||
    salesStatus === "cancelled" ||
    salesStatus === "canceled"
  ) {
    return "failed";
  }

  if (paymentStatus === "paid" || memberStatus === "active") {
    return "active";
  }

  return "pending";
}

function getStatusLabel(status: StatusType) {
  switch (status) {
    case "active":
      return "Aktif";
    case "failed":
      return "Gagal";
    case "pending":
    default:
      return "Pending";
  }
}

function getPerformanceLabel(total: number, active: number, failed: number) {
  if (total <= 0) return "Belum Ada Data";

  const conversionRate = Math.round((active / total) * 100);

  if (conversionRate >= 75 && total >= 3) return "Sangat Bagus";
  if (conversionRate >= 50) return "Bagus";
  if (failed > active && total >= 3) return "Perlu Dipantau";
  return "Berkembang";
}

/**
 * GET /api/admin/referrals
 *
 * Khusus admin:
 * Melihat performa referral antar user/customer.
 */
export async function GET() {
  try {
    const referredUsers = await User.findAll({
      where: {
        role: "customer",
        referredByUserId: {
          [Op.ne]: null,
        },
      },
      order: [
        ["createdAt", "DESC"],
        ["id", "DESC"],
      ],
    });

    const referrerIds = [
      ...new Set(
        referredUsers
          .map((user) => {
            const data = getPlain(user) as any;

            return toNumber(
              data.referredByUserId ?? data.referred_by_user_id,
              0,
            );
          })
          .filter((id) => id > 0),
      ),
    ];

    const referrers = referrerIds.length
      ? await User.findAll({
          where: {
            id: {
              [Op.in]: referrerIds,
            },
            role: "customer",
          },
        })
      : [];

    const referrerMap = new Map<number, any>();

    referrers.forEach((referrer) => {
      const data = getPlain(referrer) as any;
      referrerMap.set(Number(data.id), data);
    });

    const details = await Promise.all(
      referredUsers.map(async (referredUser) => {
        const referredData = getPlain(referredUser) as any;

        const referredByUserId = toNumber(
          referredData.referredByUserId ?? referredData.referred_by_user_id,
          0,
        );

        const referrerData = referrerMap.get(referredByUserId) ?? null;

        const membership = await Membership.findOne({
          where: {
            userId: referredData.id,
            paymentStatus: {
              [Op.in]: ["paid", "unpaid"],
            },
            memberStatus: {
              [Op.in]: [
                "pending",
                "active",
                "expired",
                "revoked",
                "cancelled",
                "canceled",
              ],
            },
          },
          order: [
            ["createdAt", "DESC"],
            ["id", "DESC"],
          ],
        });

        const membershipData = getPlain(membership) as any;
        const status = getMembershipStatus(membershipData);

        return {
          id: referredData.id,
          name: referredData.name ?? "",
          email: referredData.email ?? "",
          phone: referredData.phone ?? "",
          role: referredData.role ?? "customer",
          joinedAt: serializeDate(
            referredData.createdAt ?? referredData.created_at,
          ),

          usedReferralCode:
            referredData.referredByCode ??
            referredData.referred_by_code ??
            null,

          referredByUserId,

          referrer: referrerData
            ? {
                id: referrerData.id,
                name: referrerData.name ?? "",
                email: referrerData.email ?? "",
                phone: referrerData.phone ?? "",
                role: referrerData.role ?? "customer",
                referralCode:
                  referrerData.referralCode ??
                  referrerData.referral_code ??
                  "",
              }
            : null,

          membership: membershipData
            ? {
                id: membershipData.id,
                packageName:
                  membershipData.packageName ??
                  membershipData.package_name ??
                  "Membership",
                packagePrice: Number(
                  membershipData.packagePrice ??
                    membershipData.package_price ??
                    0,
                ),
                paymentStatus:
                  membershipData.paymentStatus ??
                  membershipData.payment_status ??
                  null,
                memberStatus:
                  membershipData.memberStatus ??
                  membershipData.member_status ??
                  null,
                salesStatus:
                  membershipData.salesStatus ??
                  membershipData.sales_status ??
                  null,
                paidAt: serializeDate(
                  membershipData.paidAt ?? membershipData.paid_at,
                ),
                startedAt: serializeDate(
                  membershipData.startedAt ?? membershipData.started_at,
                ),
                expiredAt: serializeDate(
                  membershipData.expiredAt ?? membershipData.expired_at,
                ),
              }
            : null,

          status,
          statusLabel: getStatusLabel(status),
        };
      }),
    );

    const rankingMap = new Map<number, any>();

    details.forEach((item) => {
      if (!item.referrer) return;

      const referrerId = Number(item.referrer.id);

      if (!rankingMap.has(referrerId)) {
        rankingMap.set(referrerId, {
          userId: referrerId,
          name: item.referrer.name,
          email: item.referrer.email,
          phone: item.referrer.phone,
          role: item.referrer.role,
          referralCode: item.referrer.referralCode,

          total: 0,
          active: 0,
          pending: 0,
          failed: 0,
          score: 0,
          conversionRate: 0,
          performanceLabel: "Belum Ada Data",
        });
      }

      const rank = rankingMap.get(referrerId);

      rank.total += 1;

      if (item.status === "active") {
        rank.active += 1;
      } else if (item.status === "failed") {
        rank.failed += 1;
      } else {
        rank.pending += 1;
      }

      rank.score = rank.active * 3 + rank.pending * 1 - rank.failed * 1;
      rank.conversionRate =
        rank.total > 0 ? Math.round((rank.active / rank.total) * 100) : 0;
      rank.performanceLabel = getPerformanceLabel(
        rank.total,
        rank.active,
        rank.failed,
      );
    });

    const ranking = Array.from(rankingMap.values())
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.active !== a.active) return b.active - a.active;
        return b.total - a.total;
      })
      .map((item, index) => ({
        rank: index + 1,
        ...item,
      }));

    const totalReferrals = details.length;
    const totalActive = details.filter((item) => item.status === "active").length;
    const totalPending = details.filter(
      (item) => item.status === "pending",
    ).length;
    const totalFailed = details.filter((item) => item.status === "failed").length;

    const chart = ranking.slice(0, 10).map((item) => ({
      name: item.name,
      referralCode: item.referralCode,
      total: item.total,
      active: item.active,
      pending: item.pending,
      failed: item.failed,
      score: item.score,
      conversionRate: item.conversionRate,
      performanceLabel: item.performanceLabel,
    }));

    return successResponse({
      message: "Data referral user berhasil diambil",
      data: {
        summary: {
          totalReferrals,
          totalActive,
          totalPending,
          totalFailed,
          totalReferrers: ranking.length,
        },
        ranking,
        chart,
        details,
      },
    });
  } catch (error) {
    console.error("GET ADMIN USER REFERRALS ERROR:", error);
    return errorResponse("Gagal mengambil data referral user", 500, error);
  }
}