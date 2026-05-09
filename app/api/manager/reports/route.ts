import { NextRequest } from "next/server";
import { Op } from "sequelize";

import {
  Attendance,
  Membership,
  MembershipPlan,
  User,
} from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function toNumber(value: unknown, defaultValue = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

function parseDateOrNull(value: unknown) {
  const text = String(value ?? "").trim();

  if (!text) return null;

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function dateOnly(date: Date) {
  const year = date.getFullYear().toString().padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getJakartaDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isPaid(value: unknown) {
  const status = normalize(value);

  return status === "paid" || status === "success" || status === "approved";
}

function isActive(value: unknown) {
  return normalize(value) === "active";
}

function isRevoked(value: unknown) {
  const status = normalize(value);

  return (
    status === "revoke" ||
    status === "revoked" ||
    status === "dicabut" ||
    status === "dibatalkan"
  );
}

function safeName(value: unknown, fallback = "Tanpa nama") {
  const text = String(value ?? "").trim();

  return text || fallback;
}

function serializeUser(user: any) {
  if (!user) return null;

  const data = user?.get ? user.get({ plain: true }) : user;

  return {
    id: data?.id,
    name: data?.name ?? "",
    email: data?.email ?? "",
    phone: data?.phone ?? "",
    role: data?.role ?? "",
    points: Number(data?.points ?? 0),
    maxPoints: Number(data?.maxPoints ?? data?.max_points ?? 0),
    isActive: data?.isActive ?? data?.is_active ?? true,
    createdAt: data?.createdAt ?? data?.created_at ?? null,
    updatedAt: data?.updatedAt ?? data?.updated_at ?? null,
  };
}

function serializePlan(plan: any) {
  if (!plan) return null;

  const data = plan?.get ? plan.get({ plain: true }) : plan;

  return {
    id: data?.id,
    programName: data?.programName ?? data?.program_name ?? "",
    customerCategory: data?.customerCategory ?? data?.customer_category ?? "",
    packageCode: data?.packageCode ?? data?.package_code ?? "",
    name: data?.name ?? "",
    description: data?.description ?? "",
    imageUrl: data?.imageUrl ?? data?.image_url ?? null,
    price: Number(data?.price ?? 0),
    durationDays: Number(data?.durationDays ?? data?.duration_days ?? 0),
    discountPercent: Number(
      data?.discountPercent ?? data?.discount_percent ?? 0
    ),
    personalTrainerSessions: Number(
      data?.personalTrainerSessions ?? data?.personal_trainer_sessions ?? 0
    ),
    pilatesSessions: Number(data?.pilatesSessions ?? data?.pilates_sessions ?? 0),
    freeMembershipDays: Number(
      data?.freeMembershipDays ?? data?.free_membership_days ?? 0
    ),
    benefits: Array.isArray(data?.benefits) ? data.benefits : [],
    isActive: data?.isActive ?? data?.is_active ?? true,
    createdAt: data?.createdAt ?? data?.created_at ?? null,
    updatedAt: data?.updatedAt ?? data?.updated_at ?? null,
  };
}

function serializeMembership(membership: any) {
  const data = membership?.get ? membership.get({ plain: true }) : membership;

  return {
    id: data?.id,
    userId: data?.userId ?? data?.user_id,
    salesUserId: data?.salesUserId ?? data?.sales_user_id,
    processedByUserId: data?.processedByUserId ?? data?.processed_by_user_id,
    planId: data?.planId ?? data?.plan_id,

    packageName: data?.packageName ?? data?.package_name ?? "",
    packagePrice: Number(data?.packagePrice ?? data?.package_price ?? 0),

    paymentMethod: data?.paymentMethod ?? data?.payment_method ?? "",
    paymentStatus: data?.paymentStatus ?? data?.payment_status ?? "",
    paidAmount: Number(data?.paidAmount ?? data?.paid_amount ?? 0),
    paidAt: data?.paidAt ?? data?.paid_at ?? null,
    paymentProofPhoto:
      data?.paymentProofPhoto ?? data?.payment_proof_photo ?? null,

    memberStatus: data?.memberStatus ?? data?.member_status ?? "",
    salesStatus: data?.salesStatus ?? data?.sales_status ?? "pending",

    startedAt: data?.startedAt ?? data?.started_at ?? null,
    expiredAt: data?.expiredAt ?? data?.expired_at ?? null,

    userScheduleSet: data?.userScheduleSet ?? data?.user_schedule_set ?? false,
    scheduleEditCount:
      data?.scheduleEditCount ?? data?.schedule_edit_count ?? 0,

    notes: data?.notes ?? null,
    createdAt: data?.createdAt ?? data?.created_at ?? null,
    updatedAt: data?.updatedAt ?? data?.updated_at ?? null,

    user: serializeUser(data?.user),
    sales: serializeUser(data?.sales),
    processedBy: serializeUser(data?.processedBy),
    plan: serializePlan(data?.plan),
  };
}

function serializeAttendance(attendance: any) {
  const data = attendance?.get ? attendance.get({ plain: true }) : attendance;

  return {
    id: data?.id,
    userId: data?.userId ?? data?.user_id ?? null,
    fullName: data?.fullName ?? data?.full_name ?? data?.full_name ?? "",
    role: data?.role ?? "",
    attendanceDate: data?.attendanceDate ?? data?.attendance_date ?? null,
    checkIn: data?.checkIn ?? data?.check_in ?? null,
    checkOut: data?.checkOut ?? data?.check_out ?? null,
    status: data?.status ?? "",
    lateMinutes: Number(data?.lateMinutes ?? data?.late_minutes ?? 0),
    pointPenalty: Number(data?.pointPenalty ?? data?.point_penalty ?? 0),
    location: data?.location ?? null,
    deviceMac: data?.deviceMac ?? data?.device_mac ?? null,
    checkInPhoto: data?.checkInPhoto ?? data?.check_in_photo ?? null,
    checkOutPhoto: data?.checkOutPhoto ?? data?.check_out_photo ?? null,
    note: data?.note ?? null,
    isManual: data?.isManual ?? data?.is_manual ?? false,
    createdAt: data?.createdAt ?? data?.created_at ?? null,
    updatedAt: data?.updatedAt ?? data?.updated_at ?? null,
  };
}

function addCount(target: Record<string, number>, key: string, amount = 1) {
  const cleanKey = key.trim() || "unknown";
  target[cleanKey] = (target[cleanKey] ?? 0) + amount;
}

function topEntries(data: Record<string, number>, limit = 8) {
  return Object.fromEntries(
    Object.entries(data)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
  );
}

function sumRevenue(memberships: any[]) {
  return memberships.reduce((sum, item) => {
    if (isRevoked(item.memberStatus)) return sum;
    if (!isPaid(item.paymentStatus)) return sum;

    const paidAmount = toNumber(item.paidAmount);
    const packagePrice = toNumber(item.packagePrice);

    return sum + (paidAmount > 0 ? paidAmount : packagePrice);
  }, 0);
}

function buildMembershipReports(memberships: any[]) {
  const counted = memberships.filter((item) => !isRevoked(item.memberStatus));
  const paidItems = counted.filter((item) => isPaid(item.paymentStatus));
  const activeItems = counted.filter((item) => isActive(item.memberStatus));
  const revokedItems = memberships.filter((item) => isRevoked(item.memberStatus));

  const paymentStatusChart: Record<string, number> = {};
  const memberStatusChart: Record<string, number> = {};
  const paymentMethodChart: Record<string, number> = {};
  const packageChart: Record<string, number> = {};
  const salesChart: Record<string, number> = {};
  const processedByChart: Record<string, number> = {};
  const revenueByPackage: Record<string, number> = {};
  const revenueBySales: Record<string, number> = {};
  const revenueByAdmin: Record<string, number> = {};
  const dailyRevenueChart: Record<string, number> = {};
  const dailyTransactionChart: Record<string, number> = {};

  for (const item of memberships) {
    const paymentStatus = normalize(item.paymentStatus) || "unknown";
    const memberStatus = normalize(item.memberStatus) || "unknown";
    const paymentMethod = normalize(item.paymentMethod) || "unknown";

    addCount(paymentStatusChart, paymentStatus);
    addCount(memberStatusChart, memberStatus);
    addCount(paymentMethodChart, paymentMethod);

    if (isRevoked(item.memberStatus)) continue;

    const packageName = safeName(item.packageName, "Tanpa paket");
    const salesName = safeName(item.sales?.name, "Tanpa sales");
    const adminName = safeName(item.processedBy?.name, "Belum ada admin proses");

    addCount(packageChart, packageName);
    addCount(salesChart, salesName);
    addCount(processedByChart, adminName);

    if (isPaid(item.paymentStatus)) {
      const amount =
        toNumber(item.paidAmount) > 0
          ? toNumber(item.paidAmount)
          : toNumber(item.packagePrice);

      revenueByPackage[packageName] = (revenueByPackage[packageName] ?? 0) + amount;
      revenueBySales[salesName] = (revenueBySales[salesName] ?? 0) + amount;
      revenueByAdmin[adminName] = (revenueByAdmin[adminName] ?? 0) + amount;

      const dateSource = item.paidAt ?? item.createdAt ?? new Date();
      const date = new Date(dateSource);
      const key = Number.isNaN(date.getTime()) ? "unknown" : dateOnly(date);

      dailyRevenueChart[key] = (dailyRevenueChart[key] ?? 0) + amount;
      dailyTransactionChart[key] = (dailyTransactionChart[key] ?? 0) + 1;
    }
  }

  return {
    summary: {
      totalMemberships: counted.length,
      paidMemberships: paidItems.length,
      activeMemberships: activeItems.length,
      revokedMemberships: revokedItems.length,
      unpaidMemberships: counted.filter(
        (item) => normalize(item.paymentStatus) === "unpaid"
      ).length,
      pendingMemberships: counted.filter(
        (item) => normalize(item.paymentStatus) === "pending"
      ).length,
      totalRevenue: sumRevenue(memberships),
      averageTransaction:
        paidItems.length > 0 ? Math.round(sumRevenue(memberships) / paidItems.length) : 0,
    },

    charts: {
      paymentStatusChart: topEntries(paymentStatusChart, 10),
      memberStatusChart: topEntries(memberStatusChart, 10),
      paymentMethodChart: topEntries(paymentMethodChart, 10),
      packageChart: topEntries(packageChart, 10),
      salesChart: topEntries(salesChart, 10),
      processedByChart: topEntries(processedByChart, 10),
      revenueByPackage: topEntries(revenueByPackage, 10),
      revenueBySales: topEntries(revenueBySales, 10),
      revenueByAdmin: topEntries(revenueByAdmin, 10),
      dailyRevenueChart: Object.fromEntries(
        Object.entries(dailyRevenueChart).sort((a, b) => a[0].localeCompare(b[0]))
      ),
      dailyTransactionChart: Object.fromEntries(
        Object.entries(dailyTransactionChart).sort((a, b) =>
          a[0].localeCompare(b[0])
        )
      ),
    },

    top: {
      recentPayments: memberships
        .filter((item) => isPaid(item.paymentStatus))
        .slice(0, 10),
      latestMemberships: memberships.slice(0, 10),
      revokedMemberships: revokedItems.slice(0, 10),
      topSalesByTransaction: Object.entries(salesChart)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, total]) => ({ name, total })),
      topAdminByTransaction: Object.entries(processedByChart)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, total]) => ({ name, total })),
    },
  };
}

function buildUserReports(users: any[]) {
  const roleChart: Record<string, number> = {};
  const activeChart: Record<string, number> = {};

  for (const user of users) {
    addCount(roleChart, normalize(user.role) || "unknown");
    addCount(activeChart, user.isActive ? "active" : "inactive");
  }

  const staffRoles = [
    "admin",
    "direktur",
    "manager",
    "karyawan",
    "trainer",
    "sales",
    "kasir",
  ];

  return {
    summary: {
      totalUsers: users.length,
      totalCustomers: users.filter((user) => normalize(user.role) === "customer")
        .length,
      totalStaff: users.filter((user) =>
        staffRoles.includes(normalize(user.role))
      ).length,
      totalSales: users.filter((user) => normalize(user.role) === "sales").length,
      totalManagers: users.filter((user) => normalize(user.role) === "manager")
        .length,
      activeUsers: users.filter((user) => user.isActive).length,
      inactiveUsers: users.filter((user) => !user.isActive).length,
    },
    charts: {
      roleChart: topEntries(roleChart, 12),
      activeChart,
    },
    top: {
      latestUsers: users.slice(0, 10),
      lowestPointUsers: [...users]
        .sort((a, b) => toNumber(a.points) - toNumber(b.points))
        .slice(0, 10),
    },
  };
}

function buildAttendanceReports(attendances: any[]) {
  const today = getJakartaDateString();

  const todayAttendances = attendances.filter(
    (item) => String(item.attendanceDate ?? "") === today
  );

  const statusChart: Record<string, number> = {};
  const roleChart: Record<string, number> = {};
  const dailyChart: Record<string, number> = {};
  const lateByRoleChart: Record<string, number> = {};
  const penaltyByRoleChart: Record<string, number> = {};

  let totalLateMinutes = 0;
  let totalPenaltyPoints = 0;

  for (const item of attendances) {
    const status = normalize(item.status) || "unknown";
    const role = normalize(item.role) || "unknown";
    const date = String(item.attendanceDate ?? "unknown");

    const lateMinutes = toNumber(item.lateMinutes);
    const penalty = toNumber(item.pointPenalty);

    totalLateMinutes += lateMinutes;
    totalPenaltyPoints += penalty;

    addCount(statusChart, status);
    addCount(roleChart, role);
    addCount(dailyChart, date);

    lateByRoleChart[role] = (lateByRoleChart[role] ?? 0) + lateMinutes;
    penaltyByRoleChart[role] = (penaltyByRoleChart[role] ?? 0) + penalty;
  }

  return {
    summary: {
      totalAttendances: attendances.length,
      todayAttendances: todayAttendances.length,
      checkedInToday: todayAttendances.filter((item) => item.checkIn).length,
      checkedOutToday: todayAttendances.filter((item) => item.checkOut).length,
      totalLateMinutes,
      totalPenaltyPoints,
      lateAttendances: attendances.filter((item) => toNumber(item.lateMinutes) > 0)
        .length,
      manualAttendances: attendances.filter((item) => item.isManual).length,
    },
    charts: {
      attendanceStatusChart: topEntries(statusChart, 10),
      attendanceRoleChart: topEntries(roleChart, 10),
      dailyAttendanceChart: Object.fromEntries(
        Object.entries(dailyChart).sort((a, b) => a[0].localeCompare(b[0]))
      ),
      lateByRoleChart: topEntries(lateByRoleChart, 10),
      penaltyByRoleChart: topEntries(penaltyByRoleChart, 10),
    },
    top: {
      todayAttendances: todayAttendances.slice(0, 15),
      latestAttendances: attendances.slice(0, 15),
      mostLateAttendances: [...attendances]
        .sort((a, b) => toNumber(b.lateMinutes) - toNumber(a.lateMinutes))
        .slice(0, 10),
      mostPenaltyAttendances: [...attendances]
        .sort((a, b) => toNumber(b.pointPenalty) - toNumber(a.pointPenalty))
        .slice(0, 10),
    },
  };
}

function buildPlanReports(plans: any[]) {
  const activePlans = plans.filter((plan) => plan.isActive);
  const inactivePlans = plans.filter((plan) => !plan.isActive);

  const categoryChart: Record<string, number> = {};
  const priceRangeChart: Record<string, number> = {};

  for (const plan of plans) {
    addCount(categoryChart, normalize(plan.customerCategory) || "unknown");

    const price = toNumber(plan.price);

    if (price < 250000) {
      addCount(priceRangeChart, "< 250rb");
    } else if (price < 500000) {
      addCount(priceRangeChart, "250rb - 499rb");
    } else if (price < 1000000) {
      addCount(priceRangeChart, "500rb - 999rb");
    } else {
      addCount(priceRangeChart, ">= 1jt");
    }
  }

  return {
    summary: {
      totalPlans: plans.length,
      activePlans: activePlans.length,
      inactivePlans: inactivePlans.length,
      averagePlanPrice:
        plans.length > 0
          ? Math.round(
              plans.reduce((sum, item) => sum + toNumber(item.price), 0) /
                plans.length
            )
          : 0,
    },
    charts: {
      planCategoryChart: topEntries(categoryChart, 10),
      planPriceRangeChart: priceRangeChart,
    },
    top: {
      mostExpensivePlans: [...plans]
        .sort((a, b) => toNumber(b.price) - toNumber(a.price))
        .slice(0, 8),
      latestPlans: plans.slice(0, 8),
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const startDate = parseDateOrNull(searchParams.get("startDate"));
    const endDate = parseDateOrNull(searchParams.get("endDate"));

    const membershipWhere: any = {};
    const attendanceWhere: any = {};
    const userWhere: any = {};
    const planWhere: any = {};

    if (startDate || endDate) {
      membershipWhere.createdAt = {};
      attendanceWhere.createdAt = {};
      userWhere.createdAt = {};
      planWhere.createdAt = {};

      if (startDate) {
        membershipWhere.createdAt[Op.gte] = startDate;
        attendanceWhere.createdAt[Op.gte] = startDate;
        userWhere.createdAt[Op.gte] = startDate;
        planWhere.createdAt[Op.gte] = startDate;
      }

      if (endDate) {
        const safeEnd = new Date(endDate);
        safeEnd.setHours(23, 59, 59, 999);

        membershipWhere.createdAt[Op.lte] = safeEnd;
        attendanceWhere.createdAt[Op.lte] = safeEnd;
        userWhere.createdAt[Op.lte] = safeEnd;
        planWhere.createdAt[Op.lte] = safeEnd;
      }
    }

    const [membershipsRaw, usersRaw, attendancesRaw, plansRaw] =
      await Promise.all([
        Membership.findAll({
          where: membershipWhere,
          include: [
            {
              model: User,
              as: "user",
              attributes: [
                "id",
                "name",
                "email",
                "phone",
                "role",
                "points",
                "maxPoints",
                "isActive",
                "createdAt",
                "updatedAt",
              ],
              required: false,
            },
            {
              model: User,
              as: "sales",
              attributes: [
                "id",
                "name",
                "email",
                "phone",
                "role",
                "isActive",
                "createdAt",
                "updatedAt",
              ],
              required: false,
            },
            {
              model: User,
              as: "processedBy",
              attributes: [
                "id",
                "name",
                "email",
                "phone",
                "role",
                "isActive",
                "createdAt",
                "updatedAt",
              ],
              required: false,
            },
            {
              model: MembershipPlan,
              as: "plan",
              required: false,
            },
          ],
          order: [["createdAt", "DESC"]],
        }),

        User.findAll({
          where: userWhere,
          attributes: [
            "id",
            "name",
            "email",
            "phone",
            "role",
            "points",
            "maxPoints",
            "isActive",
            "createdAt",
            "updatedAt",
          ],
          order: [["createdAt", "DESC"]],
        }),

        Attendance.findAll({
          where: attendanceWhere,
          order: [
            ["attendanceDate", "DESC"],
            ["createdAt", "DESC"],
          ],
        }),

        MembershipPlan.findAll({
          where: planWhere,
          order: [["createdAt", "DESC"]],
        }),
      ]);

    const memberships = membershipsRaw.map((item) => serializeMembership(item));
    const users = usersRaw.map((item) => serializeUser(item)).filter(Boolean);
    const attendances = attendancesRaw.map((item) => serializeAttendance(item));
    const plans = plansRaw.map((item) => serializePlan(item)).filter(Boolean);

    const membershipReports = buildMembershipReports(memberships);
    const userReports = buildUserReports(users);
    const attendanceReports = buildAttendanceReports(attendances);
    const planReports = buildPlanReports(plans);

    const summary = {
      period: {
        startDate: startDate ? dateOnly(startDate) : null,
        endDate: endDate ? dateOnly(endDate) : null,
        today: getJakartaDateString(),
      },

      business: {
        totalRevenue: membershipReports.summary.totalRevenue,
        averageTransaction: membershipReports.summary.averageTransaction,
        totalPaid: membershipReports.summary.paidMemberships,
        totalActiveMembers: membershipReports.summary.activeMemberships,
        totalRevokedMembers: membershipReports.summary.revokedMemberships,
        totalUsers: userReports.summary.totalUsers,
        totalCustomers: userReports.summary.totalCustomers,
        totalStaff: userReports.summary.totalStaff,
        todayAttendances: attendanceReports.summary.todayAttendances,
      },

      membership: membershipReports.summary,
      user: userReports.summary,
      attendance: attendanceReports.summary,
      plan: planReports.summary,
    };

    const charts = {
      ...membershipReports.charts,
      ...userReports.charts,
      ...attendanceReports.charts,
      ...planReports.charts,
    };

    const top = {
      ...membershipReports.top,
      ...userReports.top,
      ...attendanceReports.top,
      ...planReports.top,
    };

    return successResponse({
      message: "Rekapan laporan manager berhasil diambil",
      summary,
      charts,
      top,
      data: {
        memberships,
        users,
        attendances,
        plans,
      },
    });
  } catch (error) {
    console.error("GET MANAGER REPORTS ERROR:", error);
    return errorResponse("Gagal mengambil rekapan laporan manager", 500);
  }
}