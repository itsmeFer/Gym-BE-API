import { NextRequest } from "next/server";

import { Attendance, AttendanceSetting, User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

type AttendanceSettingRaw = {
  id: number;
  role: string;
  checkInTime: string | null;
  lateToleranceMinutes: number;
  penaltyIntervalMinutes: number;
  penaltyPointsPerInterval: number;
  maxLatePenaltyPoints: number;
  absentPenaltyPoints: number;
  isActive: boolean;
};

function getJakartaDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getJakartaTimeString() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

function toNumberOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function timeToMinutes(time: string) {
  const cleanTime = time.trim().slice(0, 5);

  if (!/^\d{2}:\d{2}$/.test(cleanTime)) return null;

  const [hour, minute] = cleanTime.split(":").map(Number);

  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return hour * 60 + minute;
}

async function getAttendanceSetting(role: string) {
  return (await AttendanceSetting.findOne({
    where: {
      role,
      isActive: true,
    },
    raw: true,
  })) as AttendanceSettingRaw | null;
}

function calculatePenalty(params: {
  lateMinutes: number;
  penaltyIntervalMinutes: number;
  penaltyPointsPerInterval: number;
  maxLatePenaltyPoints: number;
}) {
  const lateMinutes = Math.max(params.lateMinutes, 0);

  if (lateMinutes <= 0) return 0;

  const interval = Math.max(Number(params.penaltyIntervalMinutes ?? 60), 1);
  const pointsPerInterval = Math.max(
    Number(params.penaltyPointsPerInterval ?? 1),
    0,
  );

  const maxPenalty = Math.max(Number(params.maxLatePenaltyPoints ?? 8), 0);
  const rawPenalty = Math.ceil(lateMinutes / interval) * pointsPerInterval;

  return -Math.abs(Math.min(rawPenalty, maxPenalty));
}

async function applyUserPointDelta(userId: number | null, delta: number) {
  if (!userId || delta === 0) return;

  const user = await User.findByPk(userId);
  if (!user) return;

  const currentPoints = Number(user.get("points") ?? 100);
  await user.update({ points: Math.max(currentPoints + delta, 0) });
}

async function resolveCheckInResult(role: string, checkIn: string) {
  const setting = await getAttendanceSetting(role);

  if (!setting || !setting.checkInTime) {
    return {
      status: "hadir",
      lateMinutes: 0,
      pointPenalty: 0,
    };
  }

  const expectedMinutes = timeToMinutes(setting.checkInTime);
  const actualMinutes = timeToMinutes(checkIn);

  if (expectedMinutes === null || actualMinutes === null) {
    return {
      status: "hadir",
      lateMinutes: 0,
      pointPenalty: 0,
    };
  }

  const lateToleranceMinutes = Number(setting.lateToleranceMinutes ?? 0);
  const lateMinutes = Math.max(actualMinutes - expectedMinutes, 0);
  const isLate = actualMinutes > expectedMinutes + lateToleranceMinutes;

  if (!isLate) {
    return {
      status: "hadir",
      lateMinutes: 0,
      pointPenalty: 0,
    };
  }

  const pointPenalty = calculatePenalty({
    lateMinutes,
    penaltyIntervalMinutes: setting.penaltyIntervalMinutes,
    penaltyPointsPerInterval: setting.penaltyPointsPerInterval,
    maxLatePenaltyPoints: setting.maxLatePenaltyPoints,
  });

  return {
    status: "telat",
    lateMinutes,
    pointPenalty,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const userId = toNumberOrNull(body.userId ?? body.user_id);
    const fullName = String(
      body.fullName ?? body.full_name ?? body.name ?? "",
    ).trim();

    const role = String(body.role ?? "manager").trim().toLowerCase();
    const attendanceDate = String(
      body.attendanceDate ?? body.attendance_date ?? getJakartaDateString(),
    ).trim();

    const checkIn = String(
      body.checkIn ?? body.check_in ?? getJakartaTimeString(),
    ).trim();

    const location = body.location ? String(body.location).trim() : null;
    const deviceMac = body.deviceMac ? String(body.deviceMac).trim() : null;
    const note = body.note ? String(body.note).trim() : null;

    const checkInPhoto =
      body.checkInPhoto ?? body.check_in_photo
        ? String(body.checkInPhoto ?? body.check_in_photo).trim()
        : null;

    if (!userId) return errorResponse("User wajib dikirim", 400);
    if (!fullName) return errorResponse("Nama wajib dikirim", 400);
    if (!role) return errorResponse("Role wajib dikirim", 400);

    const existing = await Attendance.findOne({
      where: {
        userId,
        attendanceDate,
      },
      order: [["createdAt", "DESC"]],
    });

    if (existing && existing.get("checkIn")) {
      return errorResponse("Kamu sudah absen masuk hari ini.", 409);
    }

    const result = await resolveCheckInResult(role, checkIn);

    const attendance = existing
      ? await existing.update({
          fullName,
          role,
          checkIn,
          status: result.status,
          lateMinutes: result.lateMinutes,
          pointPenalty: result.pointPenalty,
          location,
          deviceMac,
          checkInPhoto,
          note,
          isManual: false,
        })
      : await Attendance.create({
          userId,
          fullName,
          role,
          attendanceDate,
          checkIn,
          checkOut: null,
          status: result.status,
          lateMinutes: result.lateMinutes,
          pointPenalty: result.pointPenalty,
          location,
          deviceMac,
          checkInPhoto,
          checkOutPhoto: null,
          note,
          isManual: false,
        });

    await applyUserPointDelta(userId, result.pointPenalty);

    return successResponse({
      message: "Absen masuk berhasil",
      data: attendance,
    });
  } catch (error) {
    console.error("MANAGER CHECK IN ERROR:", error);
    return errorResponse("Gagal absen masuk", 500);
  }
}
