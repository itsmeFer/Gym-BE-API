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

function getPlainAttendance(attendance: any) {
  return attendance.get({ plain: true }) as any;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;

    const attendance = await Attendance.findByPk(id);

    if (!attendance) {
      return errorResponse("Absensi tidak ditemukan", 404);
    }

    return successResponse({
      message: "Detail absensi berhasil diambil",
      data: attendance,
    });
  } catch (error) {
    console.error("GET MANAGER ATTENDANCE DETAIL ERROR:", error);
    return errorResponse("Gagal mengambil detail absensi", 500);
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const attendance = await Attendance.findByPk(id);

    if (!attendance) {
      return errorResponse("Absensi tidak ditemukan", 404);
    }

    const oldAttendance = getPlainAttendance(attendance);
    const oldUserId = toNumberOrNull(oldAttendance.userId ?? oldAttendance.user_id);
    const oldPointPenalty = Number(
      oldAttendance.pointPenalty ?? oldAttendance.point_penalty ?? 0,
    );

    const userId = toNumberOrNull(body.userId ?? body.user_id) ?? oldUserId;

    const fullName = String(
      body.fullName ??
        body.full_name ??
        oldAttendance.fullName ??
        oldAttendance.full_name ??
        "",
    ).trim();

    const role = String(body.role ?? oldAttendance.role ?? "")
      .trim()
      .toLowerCase();

    const attendanceDate = String(
      body.attendanceDate ??
        body.attendance_date ??
        oldAttendance.attendanceDate ??
        oldAttendance.attendance_date ??
        "",
    ).trim();

    const checkIn =
      body.checkIn ??
      body.check_in ??
      oldAttendance.checkIn ??
      oldAttendance.check_in ??
      null;

    const checkOut =
      body.checkOut ??
      body.check_out ??
      oldAttendance.checkOut ??
      oldAttendance.check_out ??
      null;

    const inputStatus = normalizeStatus(body.status ?? oldAttendance.status);

    const location =
      body.location !== undefined
        ? String(body.location).trim() || null
        : oldAttendance.location ?? null;

    const deviceMac =
      body.deviceMac !== undefined || body.device_mac !== undefined
        ? String(body.deviceMac ?? body.device_mac).trim() || null
        : oldAttendance.deviceMac ?? oldAttendance.device_mac ?? null;

    const note =
      body.note !== undefined
        ? String(body.note).trim() || null
        : oldAttendance.note ?? null;

    const checkInPhoto =
      body.checkInPhoto !== undefined || body.check_in_photo !== undefined
        ? String(body.checkInPhoto ?? body.check_in_photo).trim() || null
        : oldAttendance.checkInPhoto ?? oldAttendance.check_in_photo ?? null;

    const checkOutPhoto =
      body.checkOutPhoto !== undefined || body.check_out_photo !== undefined
        ? String(body.checkOutPhoto ?? body.check_out_photo).trim() || null
        : oldAttendance.checkOutPhoto ?? oldAttendance.check_out_photo ?? null;

    if (!fullName) return errorResponse("Nama wajib diisi", 400);
    if (!role) return errorResponse("Role wajib diisi", 400);

    const attendanceResult = await resolveAttendanceResult({
      role,
      checkIn,
      inputStatus,
    });

    await attendance.update({
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
    });

    if (oldUserId !== userId) {
      await applyUserPointDelta(oldUserId, -oldPointPenalty);
      await applyUserPointDelta(userId, attendanceResult.pointPenalty);
    } else {
      await applyUserPointDelta(userId, attendanceResult.pointPenalty - oldPointPenalty);
    }

    const updatedAttendance = await Attendance.findByPk(id);

    return successResponse({
      message: "Absensi berhasil diupdate",
      data: updatedAttendance,
    });
  } catch (error) {
    console.error("UPDATE MANAGER ATTENDANCE ERROR:", error);
    return errorResponse("Gagal update absensi", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;

    const attendance = await Attendance.findByPk(id);

    if (!attendance) {
      return errorResponse("Absensi tidak ditemukan", 404);
    }

    const oldAttendance = getPlainAttendance(attendance);
    const userId = toNumberOrNull(oldAttendance.userId ?? oldAttendance.user_id);
    const pointPenalty = Number(
      oldAttendance.pointPenalty ?? oldAttendance.point_penalty ?? 0,
    );

    await attendance.destroy();
    await applyUserPointDelta(userId, -pointPenalty);

    return successResponse({
      message: "Absensi berhasil dihapus",
      data: null,
    });
  } catch (error) {
    console.error("DELETE MANAGER ATTENDANCE ERROR:", error);
    return errorResponse("Gagal hapus absensi", 500);
  }
}
