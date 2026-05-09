import { NextRequest } from "next/server";

import { Attendance, AttendanceSetting, User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

type AttendanceSettingRaw = {
  id: number;
  role: string;
  checkInTime: string | null;
  checkOutTime?: string | null;
  lateToleranceMinutes: number;
  penaltyIntervalMinutes: number;
  penaltyPointsPerInterval: number;
  maxLatePenaltyPoints: number;
  absentPenaltyPoints: number;
  isActive: boolean;
  note: string | null;
};

function toNumberOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function todayDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeStatus(value: unknown) {
  return String(value ?? "hadir").trim().toLowerCase();
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

function isAbsentStatus(status: string) {
  const cleanStatus = status.trim().toLowerCase();

  return (
    cleanStatus === "alpha" ||
    cleanStatus === "absen" ||
    cleanStatus === "tidak_masuk" ||
    cleanStatus === "tidak masuk"
  );
}

function isLateStatus(status: string) {
  const cleanStatus = status.trim().toLowerCase();

  return cleanStatus === "telat" || cleanStatus === "terlambat";
}

function isFreeStatus(status: string) {
  const cleanStatus = status.trim().toLowerCase();

  return (
    cleanStatus === "izin" ||
    cleanStatus === "sakit" ||
    cleanStatus === "pulang"
  );
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

  const penaltyIntervalMinutes = Math.max(
    Number(params.penaltyIntervalMinutes ?? 60),
    1,
  );

  const penaltyPointsPerInterval = Math.max(
    Number(params.penaltyPointsPerInterval ?? 1),
    0,
  );

  const maxLatePenaltyPoints = Math.max(
    Number(params.maxLatePenaltyPoints ?? 8),
    0,
  );

  const intervalCount = Math.ceil(lateMinutes / penaltyIntervalMinutes);
  const rawPenaltyPoints = intervalCount * penaltyPointsPerInterval;
  const cappedPenaltyPoints = Math.min(rawPenaltyPoints, maxLatePenaltyPoints);

  return -Math.abs(cappedPenaltyPoints);
}

async function resolveAttendanceResult(params: {
  role: string;
  checkIn: string | null;
  inputStatus: string;
}) {
  const { role, checkIn } = params;
  const inputStatus = normalizeStatus(params.inputStatus);
  const setting = await getAttendanceSetting(role);

  if (!setting) {
    return {
      status: inputStatus,
      lateMinutes: null,
      pointPenalty: 0,
    };
  }

  if (isAbsentStatus(inputStatus)) {
    const absentPenaltyPoints = Number(setting.absentPenaltyPoints ?? 8);

    return {
      status: "alpha",
      lateMinutes: null,
      pointPenalty: -Math.abs(absentPenaltyPoints),
    };
  }

  if (isFreeStatus(inputStatus)) {
    return {
      status: inputStatus,
      lateMinutes: 0,
      pointPenalty: 0,
    };
  }

  if (!checkIn || !setting.checkInTime) {
    return {
      status: inputStatus,
      lateMinutes: null,
      pointPenalty: 0,
    };
  }

  const expectedMinutes = timeToMinutes(setting.checkInTime);
  const actualMinutes = timeToMinutes(checkIn);

  if (expectedMinutes === null || actualMinutes === null) {
    return {
      status: inputStatus,
      lateMinutes: null,
      pointPenalty: 0,
    };
  }

  const rawLateMinutes = actualMinutes - expectedMinutes;
  const lateMinutes = rawLateMinutes > 0 ? rawLateMinutes : 0;
  const lateToleranceMinutes = Number(setting.lateToleranceMinutes ?? 0);
  const isLateByRule = actualMinutes > expectedMinutes + lateToleranceMinutes;

  if (isLateStatus(inputStatus) || isLateByRule) {
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

  return {
    status: "hadir",
    lateMinutes: 0,
    pointPenalty: 0,
  };
}

async function applyUserPointDelta(userId: number | null, delta: number) {
  if (!userId || delta === 0) return;

  const user = await User.findByPk(userId);
  if (!user) return;

  const currentPoints = Number(user.get("points") ?? 100);
  const nextPoints = Math.max(currentPoints + delta, 0);

  await user.update({ points: nextPoints });
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const userId = toNumberOrNull(searchParams.get("userId"));
    const role = searchParams.get("role");
    const status = searchParams.get("status");
    const date = searchParams.get("date");

    const where: Record<string, unknown> = {};

    if (userId) where.userId = userId;
    if (role) where.role = role.toLowerCase();
    if (status) where.status = status;
    if (date) where.attendanceDate = date;

    const attendances = await Attendance.findAll({
      where,
      order: [
        ["attendanceDate", "DESC"],
        ["createdAt", "DESC"],
      ],
    });

    return successResponse({
      message: "Data absensi berhasil diambil",
      data: attendances,
    });
  } catch (error) {
    console.error("GET MANAGER ATTENDANCES ERROR:", error);
    return errorResponse("Gagal mengambil data absensi", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const userId = toNumberOrNull(body.userId ?? body.user_id);
    const fullName = String(
      body.fullName ?? body.full_name ?? body.name ?? "",
    ).trim();

    const role = String(body.role ?? "").trim().toLowerCase();
    const attendanceDate = body.attendanceDate
      ? String(body.attendanceDate).trim()
      : todayDate();

    const checkIn = body.checkIn ? String(body.checkIn).trim() : null;
    const checkOut = body.checkOut ? String(body.checkOut).trim() : null;
    const inputStatus = normalizeStatus(body.status);
    const location = body.location ? String(body.location).trim() : null;
    const deviceMac = body.deviceMac ? String(body.deviceMac).trim() : null;
    const note = body.note ? String(body.note).trim() : null;

    const checkInPhoto =
      body.checkInPhoto ?? body.check_in_photo
        ? String(body.checkInPhoto ?? body.check_in_photo).trim()
        : null;

    const checkOutPhoto =
      body.checkOutPhoto ?? body.check_out_photo
        ? String(body.checkOutPhoto ?? body.check_out_photo).trim()
        : null;

    const isManual =
      typeof body.isManual === "boolean"
        ? body.isManual
        : typeof body.is_manual === "boolean"
          ? body.is_manual
          : true;

    if (!fullName) return errorResponse("Nama wajib diisi", 400);
    if (!role) return errorResponse("Role wajib diisi", 400);

    const attendanceResult = await resolveAttendanceResult({
      role,
      checkIn,
      inputStatus,
    });

    const attendance = await Attendance.create({
      userId,
      fullName,
      role,
      attendanceDate,
      checkIn,
      checkOut,
      status: attendanceResult.status,
      lateMinutes: attendanceResult.lateMinutes,
      pointPenalty: attendanceResult.pointPenalty,
      location,
      deviceMac,
      checkInPhoto,
      checkOutPhoto,
      note,
      isManual,
    });

    await applyUserPointDelta(userId, attendanceResult.pointPenalty);

    return successResponse({
      message: "Absensi berhasil dibuat",
      data: attendance,
    });
  } catch (error) {
    console.error("CREATE MANAGER ATTENDANCE ERROR:", error);
    return errorResponse("Gagal membuat absensi", 500);
  }
}
