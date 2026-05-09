import { NextRequest } from "next/server";

import { Membership, MembershipPlan, User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

function toNumber(value: unknown, defaultValue = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

function toBoolean(value: unknown, defaultValue = false) {
  if (typeof value === "boolean") return value;

  const text = String(value ?? "").trim().toLowerCase();

  if (text === "true" || text === "1") return true;
  if (text === "false" || text === "0") return false;

  return defaultValue;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function getJakartaParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);

  const get = (type: string) => {
    return parts.find((part) => part.type === type)?.value ?? "";
  };

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

function getJakartaTodayDateOnly() {
  const now = getJakartaParts();

  return new Date(now.year, now.month - 1, now.day);
}

function getJakartaHourNow() {
  return getJakartaParts().hour;
}

function parseDateOnly(value: unknown) {
  const text = String(value ?? "").trim();

  if (!text) return null;

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sameDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function serializeMembership(membership: any) {
  if (!membership) return null;

  const data = membership?.get ? membership.get({ plain: true }) : membership;

  const userScheduleSet = toBoolean(
    data.userScheduleSet ?? data.user_schedule_set,
    false,
  );

  const scheduleEditCount = Math.max(
    Number(data.scheduleEditCount ?? data.schedule_edit_count ?? 0),
    0,
  );

  return {
    id: data.id,
    userId: data.userId ?? data.user_id,
    salesUserId: data.salesUserId ?? data.sales_user_id,
    planId: data.planId ?? data.plan_id,

    packageName: data.packageName ?? data.package_name,
    packagePrice: Number(data.packagePrice ?? data.package_price ?? 0),

    paymentMethod: data.paymentMethod ?? data.payment_method,
    paymentStatus: data.paymentStatus ?? data.payment_status,
    paidAmount: Number(data.paidAmount ?? data.paid_amount ?? 0),
    paidAt: data.paidAt ?? data.paid_at,

    paymentProofPhoto:
      data.paymentProofPhoto ?? data.payment_proof_photo ?? null,

    memberStatus: data.memberStatus ?? data.member_status,
    salesStatus: data.salesStatus ?? data.sales_status,

    startedAt: data.startedAt ?? data.started_at,
    expiredAt: data.expiredAt ?? data.expired_at,

    userScheduleSet,
    scheduleEditCount,
    canEditSchedule: userScheduleSet && scheduleEditCount < 1,
    remainingScheduleEdit: userScheduleSet
      ? Math.max(1 - scheduleEditCount, 0)
      : 1,

    notes: data.notes,
    createdAt: data.createdAt ?? data.created_at,
    updatedAt: data.updatedAt ?? data.updated_at,
  };
}

/**
 * POST /api/user/membership/schedule
 *
 * Body:
 * {
 *   "userId": 5,
 *   "membershipId": 1,
 *   "startedAt": "2026-05-15T00:00:00.000"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const userId = toNumber(body.userId ?? body.user_id, 0);
    const membershipId = toNumber(body.membershipId ?? body.membership_id, 0);
    const selectedStartDate = parseDateOnly(
      body.startedAt ?? body.started_at,
    );

    if (!userId) {
      return errorResponse("User ID wajib dikirim", 400);
    }

    if (!membershipId) {
      return errorResponse("Membership ID wajib dikirim", 400);
    }

    if (!selectedStartDate) {
      return errorResponse("Tanggal mulai tidak valid", 400);
    }

    const today = getJakartaTodayDateOnly();
    const jakartaHour = getJakartaHourNow();

    if (selectedStartDate < today) {
      return errorResponse("Tanggal mulai tidak boleh sebelum hari ini", 400);
    }

    if (sameDate(selectedStartDate, today) && jakartaHour >= 23) {
      return errorResponse(
        "Pilih tanggal hari ini hanya boleh sebelum jam 23:00 WIB",
        400,
      );
    }

    const user = await User.findByPk(userId);

    if (!user) {
      return errorResponse("User tidak ditemukan", 404);
    }

    const membership = await Membership.findOne({
      where: {
        id: membershipId,
        userId,
      },
    });

    if (!membership) {
      return errorResponse("Membership user tidak ditemukan", 404);
    }

    if (membership.paymentStatus !== "paid") {
      return errorResponse(
        "Paket ini belum bisa dipilih waktunya karena belum dibayar",
        400,
      );
    }

    if (membership.memberStatus === "revoked") {
      return errorResponse("Membership ini sudah dicabut", 400);
    }

    if (!membership.planId) {
      return errorResponse("Membership ini belum punya paket", 400);
    }

    const plan = await MembershipPlan.findByPk(membership.planId);

    if (!plan) {
      return errorResponse("Paket membership tidak ditemukan", 404);
    }

    const planData = plan.get({ plain: true }) as any;

    const durationDays = Math.max(
      Number(planData.durationDays ?? planData.duration_days ?? 30),
      1,
    );

    const freeMembershipDays = Math.max(
      Number(
        planData.freeMembershipDays ?? planData.free_membership_days ?? 0,
      ),
      0,
    );

    const totalActiveDays = Math.max(durationDays + freeMembershipDays, 1);
    const expiredAt = addDays(selectedStartDate, totalActiveDays);

    const membershipData = membership.get({ plain: true }) as any;

    const userScheduleSet = toBoolean(
      membershipData.userScheduleSet ?? membershipData.user_schedule_set,
      false,
    );

    const scheduleEditCount = Math.max(
      Number(
        membershipData.scheduleEditCount ??
          membershipData.schedule_edit_count ??
          0,
      ),
      0,
    );

    const isFirstSchedule = !userScheduleSet;

    if (!isFirstSchedule && scheduleEditCount >= 1) {
      return errorResponse(
        "Batas edit waktu membership sudah habis. Kamu hanya bisa edit 1 kali.",
        400,
      );
    }

    const nextEditCount = isFirstSchedule
      ? scheduleEditCount
      : scheduleEditCount + 1;

    const oldNotes = membership.notes ? String(membership.notes) : "";

    const actionText = isFirstSchedule
      ? "User memilih waktu membership pertama kali"
      : `User mengedit waktu membership ke-${nextEditCount}`;

    const scheduleNote =
      `${actionText}: ` +
      `${selectedStartDate.toISOString()} sampai ${expiredAt.toISOString()} ` +
      `(${durationDays} hari + bonus ${freeMembershipDays} hari = ${totalActiveDays} hari)`;

    const notes = oldNotes ? `${oldNotes}\n\n${scheduleNote}` : scheduleNote;

    await membership.update({
      memberStatus: "active",
      startedAt: selectedStartDate,
      expiredAt,
      userScheduleSet: true,
      scheduleEditCount: nextEditCount,
      notes,
    });

    const updatedMembership = await Membership.findByPk(membership.id);

    return successResponse({
      message: isFirstSchedule
        ? "Waktu membership berhasil dipilih"
        : "Waktu membership berhasil diedit",
      data: {
        membership: serializeMembership(updatedMembership),
        durationDays,
        freeMembershipDays,
        totalActiveDays,
        startedAt: selectedStartDate,
        expiredAt,
        userScheduleSet: true,
        scheduleEditCount: nextEditCount,
        remainingScheduleEdit: Math.max(1 - nextEditCount, 0),
      },
    });
  } catch (error) {
    console.error("POST USER MEMBERSHIP SCHEDULE ERROR:", error);
    return errorResponse("Gagal memilih waktu membership", 500);
  }
}