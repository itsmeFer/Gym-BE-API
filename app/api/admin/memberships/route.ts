import { Membership, User, MembershipPlan } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

function normalizeStatus(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isRevokedMembership(memberStatus: unknown) {
  const status = normalizeStatus(memberStatus);

  return (
    status === "revoke" ||
    status === "revoked" ||
    status === "dicabut" ||
    status === "dibatalkan"
  );
}

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export async function GET() {
  try {
    const memberships = await Membership.findAll({
      include: [
        {
          model: User,
          as: "user",
          attributes: [
            "id",
            "name",
            "phone",
            "email",
            "role",
            "points",
            "maxPoints",
          ],
        },
        {
          model: User,
          as: "sales",
          attributes: ["id", "name", "phone", "email", "role"],
          required: false,
        },
        {
          model: MembershipPlan,
          as: "plan",
          attributes: [
            "id",
            "programName",
            "customerCategory",
            "packageCode",
            "name",
            "price",
            "durationDays",
            "discountPercent",
            "personalTrainerSessions",
            "pilatesSessions",
            "freeMembershipDays",
            "benefits",
            "isActive",
          ],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const plainMemberships = memberships.map((item) =>
      item.get({ plain: true })
    );

    const countedMemberships = plainMemberships.filter(
      (item: any) => !isRevokedMembership(item.memberStatus)
    );

    const total = countedMemberships.length;

    const paid = countedMemberships.filter(
      (item: any) => normalizeStatus(item.paymentStatus) === "paid"
    ).length;

    const active = countedMemberships.filter(
      (item: any) => normalizeStatus(item.memberStatus) === "active"
    ).length;

    const revoked = plainMemberships.filter((item: any) =>
      isRevokedMembership(item.memberStatus)
    ).length;

    const totalRevenue = countedMemberships.reduce((sum: number, item: any) => {
      const paymentStatus = normalizeStatus(item.paymentStatus);

      if (paymentStatus !== "paid") {
        return sum;
      }

      const paidAmount = toNumber(item.paidAmount);
      const packagePrice = toNumber(item.packagePrice);

      return sum + (paidAmount > 0 ? paidAmount : packagePrice);
    }, 0);

    const paymentStatusChart = countedMemberships.reduce(
      (result: Record<string, number>, item: any) => {
        const key = normalizeStatus(item.paymentStatus) || "unknown";
        result[key] = (result[key] ?? 0) + 1;
        return result;
      },
      {}
    );

    const memberStatusChart = countedMemberships.reduce(
      (result: Record<string, number>, item: any) => {
        const key = normalizeStatus(item.memberStatus) || "unknown";
        result[key] = (result[key] ?? 0) + 1;
        return result;
      },
      {}
    );

    const salesChartRaw = countedMemberships.reduce(
      (result: Record<string, number>, item: any) => {
        const salesName = item.sales?.name || "Tanpa sales";
        result[salesName] = (result[salesName] ?? 0) + 1;
        return result;
      },
      {}
    );

    const salesChart = Object.fromEntries(
      Object.entries(salesChartRaw)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    );

    return successResponse({
      message: "Data membership berhasil diambil",
      data: plainMemberships,

      dashboard: {
        total,
        paid,
        active,
        revoked,
        totalRevenue,
        paymentStatusChart,
        memberStatusChart,
        salesChart,
      },
    });
  } catch (error) {
    console.error("GET ADMIN MEMBERSHIPS ERROR:", error);

    return errorResponse("Gagal mengambil data membership", 500);
  }
}