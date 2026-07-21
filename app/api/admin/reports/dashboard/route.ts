import { NextRequest } from "next/server";
import { Op } from "sequelize";

import {
    Attendance,
    Membership,
    MembershipPlan,
    User,
} from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

type PlainRecord = Record<string, any>;

type DateRange = {
    startDate: string;
    endDate: string;
    startDateTime: Date;
    endDateTime: Date;
};

const REVOKED_STATUSES = ["revoke", "revoked", "dicabut", "dibatalkan"];

const STAFF_ROLES = [
    "admin",
    "direktur",
    "manager",
    "karyawan",
    "trainer",
    "sales",
    "kasir",
];

function normalizeText(value: unknown) {
    return String(value ?? "").trim().toLowerCase();
}

function toNumber(value: unknown, defaultValue = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : defaultValue;
}

function isRevokedMembership(value: unknown) {
    return REVOKED_STATUSES.includes(normalizeText(value));
}

function isPaidMembership(value: unknown) {
    return normalizeText(value) === "paid";
}

function getJakartaDateString(date = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
}

function getMonthStartDateString(date = new Date()) {
    const jakartaDate = getJakartaDateString(date);
    const [year, month] = jakartaDate.split("-");

    return `${year}-${month}-01`;
}

function parseDateOnly(value: unknown) {
    const text = String(value ?? "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return null;
    }

    const date = new Date(`${text}T00:00:00.000+07:00`);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return text;
}

function dateOnlyToDateStart(value: string) {
    return new Date(`${value}T00:00:00.000+07:00`);
}

function dateOnlyToDateEnd(value: string) {
    return new Date(`${value}T23:59:59.999+07:00`);
}

function getDateRange(request: NextRequest): DateRange {
    const searchParams = request.nextUrl.searchParams;

    const today = getJakartaDateString();
    const defaultStartDate = getMonthStartDateString();

    const startDate = parseDateOnly(searchParams.get("startDate")) ?? defaultStartDate;
    const endDate = parseDateOnly(searchParams.get("endDate")) ?? today;

    return {
        startDate,
        endDate,
        startDateTime: dateOnlyToDateStart(startDate),
        endDateTime: dateOnlyToDateEnd(endDate),
    };
}

function parseUnknownDate(value: unknown) {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === "string" || typeof value === "number") {
        const date = new Date(value);

        return Number.isNaN(date.getTime()) ? null : date;
    }

    return null;
}

function isDateInsideRange(dateValue: unknown, range: DateRange) {
    const date = parseUnknownDate(dateValue);

    if (!date) {
        return false;
    }

    return date >= range.startDateTime && date <= range.endDateTime;
}

function getPaymentDate(membership: PlainRecord) {
    return (
        membership.paidAt ??
        membership.paid_at ??
        membership.updatedAt ??
        membership.updated_at ??
        membership.createdAt ??
        membership.created_at ??
        null
    );
}

function getCreatedDate(item: PlainRecord) {
    return item.createdAt ?? item.created_at ?? null;
}

function getPaidAmount(membership: PlainRecord) {
    const paidAmount = toNumber(membership.paidAmount ?? membership.paid_amount, 0);
    const packagePrice = toNumber(
        membership.packagePrice ?? membership.package_price,
        0,
    );

    return paidAmount > 0 ? paidAmount : packagePrice;
}

function formatMonthKey(dateValue: unknown) {
    const date = parseUnknownDate(dateValue);
    if (!date) {
        return "unknown";
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");

    return `${year}-${month}`;
}

function getLastSixMonthKeys() {
    const now = new Date();
    const keys: string[] = [];

    for (let index = 5; index >= 0; index -= 1) {
        const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");

        keys.push(`${year}-${month}`);
    }

    return keys;
}

function getMonthLabel(monthKey: string) {
    const [year, month] = monthKey.split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);

    return new Intl.DateTimeFormat("id-ID", {
        month: "short",
        year: "2-digit",
    }).format(date);
}

function countBy(items: PlainRecord[], keyGetter: (item: PlainRecord) => string) {
    return items.reduce((result: Record<string, number>, item) => {
        const key = keyGetter(item) || "unknown";
        result[key] = (result[key] ?? 0) + 1;
        return result;
    }, {});
}

function sumBy(items: PlainRecord[], valueGetter: (item: PlainRecord) => number) {
    return items.reduce((sum, item) => sum + valueGetter(item), 0);
}

function getUserName(user: any) {
    if (!user) return "Tanpa nama";

    return (
        user.name ??
        user.fullName ??
        user.full_name ??
        user.email ??
        `User ${user.id ?? ""}`
    );
}

function serializeUser(user: any) {
    if (!user) return null;

    const data = user?.get ? user.get({ plain: true }) : user;

    return {
        id: data.id,
        name: getUserName(data),
        email: data.email ?? "",
        phone: data.phone ?? "",
        role: normalizeText(data.role),
        points: toNumber(data.points, 0),
        maxPoints: toNumber(data.maxPoints ?? data.max_points, 100),
        isActive: Boolean(data.isActive ?? data.is_active ?? true),
    };
}

function serializePlan(plan: any) {
    if (!plan) return null;

    const data = plan?.get ? plan.get({ plain: true }) : plan;

    return {
        id: data.id,
        programName: data.programName ?? data.program_name ?? "",
        customerCategory: data.customerCategory ?? data.customer_category ?? "",
        packageCode: data.packageCode ?? data.package_code ?? "",
        name: data.name ?? "",
        price: toNumber(data.price, 0),
        isActive: Boolean(data.isActive ?? data.is_active ?? true),
    };
}

function serializeMembership(membership: any) {
    const data = membership?.get ? membership.get({ plain: true }) : membership;

    return {
        id: data.id,
        userId: data.userId ?? data.user_id,
        salesUserId: data.salesUserId ?? data.sales_user_id,
        planId: data.planId ?? data.plan_id,

        packageName: data.packageName ?? data.package_name,
        packagePrice: toNumber(data.packagePrice ?? data.package_price, 0),

        paymentMethod: data.paymentMethod ?? data.payment_method,
        paymentStatus: data.paymentStatus ?? data.payment_status,
        paidAmount: toNumber(data.paidAmount ?? data.paid_amount, 0),
        paidAt: data.paidAt ?? data.paid_at,

        memberStatus: data.memberStatus ?? data.member_status,
        salesStatus: data.salesStatus ?? data.sales_status ?? "pending",

        startedAt: data.startedAt ?? data.started_at,
        expiredAt: data.expiredAt ?? data.expired_at,

        notes: data.notes,
        createdAt: data.createdAt ?? data.created_at,
        updatedAt: data.updatedAt ?? data.updated_at,

        user: serializeUser(data.user),
        sales: serializeUser(data.sales),
        plan: serializePlan(data.plan),
    };
}

function serializeAttendance(attendance: any) {
    const data = attendance?.get ? attendance.get({ plain: true }) : attendance;

    return {
        id: data.id,
        userId: data.userId ?? data.user_id,
        fullName: data.fullName ?? data.full_name ?? "Tanpa nama",
        role: normalizeText(data.role),
        attendanceDate: data.attendanceDate ?? data.attendance_date,
        checkIn: data.checkIn ?? data.check_in,
        checkOut: data.checkOut ?? data.check_out,
        status: normalizeText(data.status),
        lateMinutes: data.lateMinutes ?? data.late_minutes,
        pointPenalty: toNumber(data.pointPenalty ?? data.point_penalty, 0),
        location: data.location,
        deviceMac: data.deviceMac ?? data.device_mac,
        checkInPhoto: data.checkInPhoto ?? data.check_in_photo,
        checkOutPhoto: data.checkOutPhoto ?? data.check_out_photo,
        note: data.note,
        isManual: Boolean(data.isManual ?? data.is_manual ?? true),
        createdAt: data.createdAt ?? data.created_at,
        updatedAt: data.updatedAt ?? data.updated_at,
    };
}

function buildRevenueChart(paidMemberships: PlainRecord[]) {
    const monthKeys = getLastSixMonthKeys();

    const revenueByMonth = monthKeys.reduce(
        (result: Record<string, number>, key) => {
            result[key] = 0;
            return result;
        },
        {},
    );

    const transactionByMonth = monthKeys.reduce(
        (result: Record<string, number>, key) => {
            result[key] = 0;
            return result;
        },
        {},
    );

    for (const membership of paidMemberships) {
        const paymentDate = getPaymentDate(membership);
        const monthKey = formatMonthKey(paymentDate);

        if (!revenueByMonth[monthKey] && revenueByMonth[monthKey] !== 0) {
            continue;
        }

        revenueByMonth[monthKey] += getPaidAmount(membership);
        transactionByMonth[monthKey] += 1;
    }

    return monthKeys.map((monthKey) => ({
        key: monthKey,
        label: getMonthLabel(monthKey),
        revenue: revenueByMonth[monthKey],
        transactions: transactionByMonth[monthKey],
    }));
}

function buildSalesLeaderboard(memberships: PlainRecord[]) {
    const salesMap = new Map<
        string,
        {
            salesId: number | null;
            name: string;
            totalLead: number;
            totalDeal: number;
            totalRevenue: number;
            waitingPayment: number;
            cancelled: number;
        }
    >();

    for (const membership of memberships) {
        const sales = membership.sales;
        const salesId = sales?.id ?? membership.salesUserId ?? membership.sales_user_id ?? null;
        const name = sales?.name ?? "Tanpa sales";
        const key = String(salesId ?? name);

        if (!salesMap.has(key)) {
            salesMap.set(key, {
                salesId,
                name,
                totalLead: 0,
                totalDeal: 0,
                totalRevenue: 0,
                waitingPayment: 0,
                cancelled: 0,
            });
        }

        const item = salesMap.get(key)!;
        const paymentStatus = normalizeText(
            membership.paymentStatus ?? membership.payment_status,
        );
        const salesStatus = normalizeText(
            membership.salesStatus ?? membership.sales_status,
        );
        const memberStatus = normalizeText(
            membership.memberStatus ?? membership.member_status,
        );

        item.totalLead += 1;

        if (paymentStatus === "paid" && !isRevokedMembership(memberStatus)) {
            item.totalDeal += 1;
            item.totalRevenue += getPaidAmount(membership);
        }

        if (salesStatus === "waiting_payment") {
            item.waitingPayment += 1;
        }

        if (salesStatus === "cancelled" || salesStatus === "not_interested") {
            item.cancelled += 1;
        }
    }

    return Array.from(salesMap.values())
        .sort((a, b) => b.totalRevenue - a.totalRevenue || b.totalDeal - a.totalDeal)
        .slice(0, 8);
}

function buildPackageChart(paidMemberships: PlainRecord[]) {
    const packageMap = new Map<
        string,
        {
            packageName: string;
            totalSold: number;
            totalRevenue: number;
        }
    >();

    for (const membership of paidMemberships) {
        const packageName =
            membership.packageName ??
            membership.package_name ??
            membership.plan?.name ??
            "Paket tanpa nama";

        if (!packageMap.has(packageName)) {
            packageMap.set(packageName, {
                packageName,
                totalSold: 0,
                totalRevenue: 0,
            });
        }

        const item = packageMap.get(packageName)!;

        item.totalSold += 1;
        item.totalRevenue += getPaidAmount(membership);
    }

    return Array.from(packageMap.values())
        .sort((a, b) => b.totalRevenue - a.totalRevenue || b.totalSold - a.totalSold)
        .slice(0, 8);
}

function buildAttendanceDailyChart(attendances: PlainRecord[]) {
    const result = new Map<
        string,
        {
            date: string;
            hadir: number;
            telat: number;
            alpha: number;
            izin: number;
            sakit: number;
            pulang: number;
            totalPenalty: number;
        }
    >();

    for (const attendance of attendances) {
        const date =
            attendance.attendanceDate ??
            attendance.attendance_date ??
            getJakartaDateString();

        if (!result.has(date)) {
            result.set(date, {
                date,
                hadir: 0,
                telat: 0,
                alpha: 0,
                izin: 0,
                sakit: 0,
                pulang: 0,
                totalPenalty: 0,
            });
        }

        const item = result.get(date)!;
        const status = normalizeText(attendance.status);

        if (status === "telat" || status === "terlambat") {
            item.telat += 1;
        } else if (
            status === "alpha" ||
            status === "absen" ||
            status === "tidak_masuk" ||
            status === "tidak masuk"
        ) {
            item.alpha += 1;
        } else if (status === "izin") {
            item.izin += 1;
        } else if (status === "sakit") {
            item.sakit += 1;
        } else if (status === "pulang") {
            item.pulang += 1;
        } else {
            item.hadir += 1;
        }

        item.totalPenalty += Math.abs(
            toNumber(attendance.pointPenalty ?? attendance.point_penalty, 0),
        );
    }

    return Array.from(result.values()).sort((a, b) =>
        a.date.localeCompare(b.date),
    );
}

function buildActivities(params: {
    memberships: PlainRecord[];
    attendances: PlainRecord[];
}) {
    const membershipActivities = params.memberships.slice(0, 8).map((item) => {
        const paymentStatus = normalizeText(item.paymentStatus ?? item.payment_status);
        const memberStatus = normalizeText(item.memberStatus ?? item.member_status);
        const isRevoked = isRevokedMembership(memberStatus);

        return {
            id: `membership-${item.id}`,
            type: "membership",
            title: isRevoked
                ? "Membership dicabut / revoke"
                : paymentStatus === "paid"
                    ? "Pembayaran membership berhasil"
                    : "Aktivitas membership terbaru",
            userName: item.user?.name ?? "Tanpa nama",
            description: `${item.packageName ?? item.package_name ?? "Paket"} • ${paymentStatus || "-"}`,
            amount: isRevoked ? 0 : paymentStatus === "paid" ? getPaidAmount(item) : 0,
            status: isRevoked ? "revoked" : paymentStatus || memberStatus || "-",
            createdAt: getPaymentDate(item) ?? getCreatedDate(item),
            data: serializeMembership(item),
        };
    });

    const attendanceActivities = params.attendances.slice(0, 8).map((item) => {
        const status = normalizeText(item.status);
        const penalty = Math.abs(
            toNumber(item.pointPenalty ?? item.point_penalty, 0),
        );

        return {
            id: `attendance-${item.id}`,
            type: "attendance",
            title:
                penalty > 0
                    ? "Absensi dengan pengurangan poin"
                    : "Aktivitas absensi terbaru",
            userName: item.fullName ?? item.full_name ?? "Tanpa nama",
            description: `${status || "-"} • ${item.attendanceDate ?? item.attendance_date ?? "-"}`,
            amount: penalty > 0 ? -penalty : 0,
            status,
            createdAt: getCreatedDate(item),
            data: serializeAttendance(item),
        };
    });

    return [...membershipActivities, ...attendanceActivities]
        .sort((a, b) => {
            const dateA = new Date(a.createdAt ?? 0).getTime();
            const dateB = new Date(b.createdAt ?? 0).getTime();

            return dateB - dateA;
        })
        .slice(0, 12);
}

export async function GET(request: NextRequest) {
    try {
        const range = getDateRange(request);

        const [membershipsRaw, attendancesRaw, usersRaw, plansRaw] =
            await Promise.all([
                Membership.findAll({
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
                                "points",
                                "maxPoints",
                                "isActive",
                            ],
                            required: false,
                        },
                        {
                            model: MembershipPlan,
                            as: "plan",
                            required: false,
                        },
                    ],
                    order: [["id", "DESC"]],
                }),

                Attendance.findAll({
                    where: {
                        attendanceDate: {
                            [Op.between]: [range.startDate, range.endDate],
                        },
                    },
                    order: [["id", "DESC"]],
                }),

                User.findAll({
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
                    ],
                    order: [["id", "DESC"]],
                }),

                MembershipPlan.findAll({
                    order: [["id", "DESC"]],
                }),
            ]);

        const memberships = membershipsRaw.map((item) =>
            item.get({ plain: true }),
        ) as PlainRecord[];

        const attendances = attendancesRaw.map((item) =>
            item.get({ plain: true }),
        ) as PlainRecord[];

        const users = usersRaw.map((item) =>
            item.get({ plain: true }),
        ) as PlainRecord[];

        const plans = plansRaw.map((item) =>
            item.get({ plain: true }),
        ) as PlainRecord[];

        const membershipsInRange = memberships.filter((item) => {
            const targetDate = getPaymentDate(item) ?? getCreatedDate(item);
            return isDateInsideRange(targetDate, range);
        });

        const countedMemberships = membershipsInRange.filter(
            (item) => !isRevokedMembership(item.memberStatus ?? item.member_status),
        );

        const revokedMemberships = membershipsInRange.filter((item) =>
            isRevokedMembership(item.memberStatus ?? item.member_status),
        );

        const paidMemberships = countedMemberships.filter((item) =>
            isPaidMembership(item.paymentStatus ?? item.payment_status),
        );

        const now = new Date();
        const activeMemberships = countedMemberships.filter((item) => {
          const status = normalizeText(item.memberStatus ?? item.member_status);
          if (status !== "active") return false;
          const startedAt = item.startedAt ? new Date(item.startedAt) : null;
          const expiredAt = item.expiredAt ? new Date(item.expiredAt) : null;
          if (startedAt && startedAt > now) return false;
          if (expiredAt && expiredAt < now) return false;
          return true;
        });

        const expiredMemberships = countedMemberships.filter(
            (item) => normalizeText(item.memberStatus ?? item.member_status) === "expired",
        );

        const pendingMemberships = countedMemberships.filter(
            (item) => normalizeText(item.memberStatus ?? item.member_status) === "pending",
        );

        const waitingPaymentMemberships = countedMemberships.filter(
            (item) =>
                normalizeText(item.salesStatus ?? item.sales_status) ===
                "waiting_payment" ||
                normalizeText(item.paymentStatus ?? item.payment_status) === "unpaid",
        );

        const totalRevenue = sumBy(paidMemberships, getPaidAmount);

        const attendanceStatusChart = countBy(attendances, (item) =>
            normalizeText(item.status),
        );

        const attendanceByRoleChart = countBy(attendances, (item) =>
            normalizeText(item.role),
        );

        const totalAttendance = attendances.length;

        const totalLate = attendances.filter((item) => {
            const status = normalizeText(item.status);
            return status === "telat" || status === "terlambat";
        }).length;

        const totalAbsent = attendances.filter((item) => {
            const status = normalizeText(item.status);
            return (
                status === "alpha" ||
                status === "absen" ||
                status === "tidak_masuk" ||
                status === "tidak masuk"
            );
        }).length;

        const totalPointPenalty = sumBy(attendances, (item) =>
            Math.abs(toNumber(item.pointPenalty ?? item.point_penalty, 0)),
        );

        const staffUsers = users.filter((item) =>
            STAFF_ROLES.includes(normalizeText(item.role)),
        );

        const customerUsers = users.filter(
            (item) => normalizeText(item.role) === "customer",
        );

        const activeUsers = users.filter(
            (item) => Boolean(item.isActive ?? item.is_active ?? true) === true,
        );

        const inactiveUsers = users.filter(
            (item) => Boolean(item.isActive ?? item.is_active ?? true) === false,
        );

        const activePlans = plans.filter(
            (item) => Boolean(item.isActive ?? item.is_active ?? true) === true,
        );

        const inactivePlans = plans.filter(
            (item) => Boolean(item.isActive ?? item.is_active ?? true) === false,
        );

        const roleChart = countBy(users, (item) => normalizeText(item.role));

        const membershipStatusChart = countBy(membershipsInRange, (item) =>
            normalizeText(item.memberStatus ?? item.member_status),
        );

        const paymentStatusChart = countBy(countedMemberships, (item) =>
            normalizeText(item.paymentStatus ?? item.payment_status),
        );

        const salesStatusChart = countBy(countedMemberships, (item) =>
            normalizeText(item.salesStatus ?? item.sales_status),
        );

        const revenueChart = buildRevenueChart(paidMemberships);
        const salesLeaderboard = buildSalesLeaderboard(countedMemberships);
        const packageChart = buildPackageChart(paidMemberships);
        const attendanceDailyChart = buildAttendanceDailyChart(attendances);

        const recentMemberships = membershipsInRange
            .sort((a, b) => {
                const dateA = new Date(getPaymentDate(a) ?? getCreatedDate(a) ?? 0).getTime();
                const dateB = new Date(getPaymentDate(b) ?? getCreatedDate(b) ?? 0).getTime();

                return dateB - dateA;
            })
            .slice(0, 10)
            .map(serializeMembership);

        const recentAttendances = attendances
            .slice(0, 10)
            .map(serializeAttendance);

        const activities = buildActivities({
            memberships: membershipsInRange,
            attendances,
        });

        return successResponse({
            message: "Laporan dashboard admin berhasil diambil",
            data: {
                period: {
                    startDate: range.startDate,
                    endDate: range.endDate,
                },

                kpi: {
                    totalRevenue,
                    totalRevenueFormatted: totalRevenue,
                    totalMembership: membershipsInRange.length,
                    totalCountedMembership: countedMemberships.length,
                    totalPaidMembership: paidMemberships.length,
                    totalActiveMembership: activeMemberships.length,
                    totalExpiredMembership: expiredMemberships.length,
                    totalPendingMembership: pendingMemberships.length,
                    totalWaitingPaymentMembership: waitingPaymentMemberships.length,
                    totalRevokedMembership: revokedMemberships.length,

                    totalAttendance,
                    totalLate,
                    totalAbsent,
                    totalPointPenalty,
                    attendanceRate:
                        totalAttendance > 0
                            ? Math.round(
                                ((totalAttendance - totalAbsent) / totalAttendance) * 100,
                            )
                            : 0,

                    totalUser: users.length,
                    totalStaff: staffUsers.length,
                    totalCustomer: customerUsers.length,
                    totalActiveUser: activeUsers.length,
                    totalInactiveUser: inactiveUsers.length,

                    totalPlan: plans.length,
                    totalActivePlan: activePlans.length,
                    totalInactivePlan: inactivePlans.length,
                },

                charts: {
                    revenueChart,
                    membershipStatusChart,
                    paymentStatusChart,
                    salesStatusChart,
                    attendanceStatusChart,
                    attendanceByRoleChart,
                    attendanceDailyChart,
                    roleChart,
                    salesLeaderboard,
                    packageChart,
                },

                lists: {
                    recentMemberships,
                    recentAttendances,
                    activities,
                    topSales: salesLeaderboard,
                    topPackages: packageChart,
                },

                notes: {
                    revenueRule:
                        "Membership dengan status revoke/revoked/dicabut/dibatalkan tetap tampil, tetapi tidak dihitung ke total revenue.",
                    attendanceRule:
                        "Point penalty dihitung dari data absensi yang sudah tersimpan.",
                },
            },
        });
    } catch (error) {
        console.error("GET ADMIN REPORT DASHBOARD ERROR:", error);

        return errorResponse("Gagal mengambil laporan dashboard admin", 500);
    }
}