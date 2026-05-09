// File: /app/api/admin/attendances/[id]/route.ts
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

// helper functions
function toNumberOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeStatus(value: unknown) {
  return String(value ?? "hadir").trim().toLowerCase();
}

// convert hh:mm to total minutes
function timeToMinutes(time: string) {
  const cleanTime = time.trim().slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(cleanTime)) return null;
  const [hour, minute] = cleanTime.split(":").map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function isAbsentStatus(status: string) {
  const s = status.trim().toLowerCase();
  return ["alpha", "absen", "tidak_masuk", "tidak masuk"].includes(s);
}

function isLateStatus(status: string) {
  const s = status.trim().toLowerCase();
  return ["telat", "terlambat"].includes(s);
}

function isFreeStatus(status: string) {
  const s = status.trim().toLowerCase();
  return ["izin", "sakit", "pulang"].includes(s);
}

async function getAttendanceSetting(role: string) {
  return (await AttendanceSetting.findOne({
    where: { role, isActive: true },
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

  const intervalCount = Math.ceil(
    lateMinutes / Math.max(params.penaltyIntervalMinutes ?? 60, 1)
  );
  const rawPenaltyPoints = intervalCount * Math.max(params.penaltyPointsPerInterval ?? 1, 0);
  return -Math.abs(Math.min(rawPenaltyPoints, Math.max(params.maxLatePenaltyPoints ?? 8, 0)));
}

async function resolveAttendanceResult(params: {
  role: string;
  checkIn: string | null;
  inputStatus: string;
}) {
  const { role, checkIn } = params;
  const inputStatus = normalizeStatus(params.inputStatus);
  const setting = await getAttendanceSetting(role);

  if (!setting) return { status: inputStatus, lateMinutes: null, pointPenalty: 0 };
  if (isAbsentStatus(inputStatus)) return { status: "alpha", lateMinutes: null, pointPenalty: -Math.abs(setting.absentPenaltyPoints ?? 8) };
  if (isFreeStatus(inputStatus)) return { status: inputStatus, lateMinutes: 0, pointPenalty: 0 };
  if (!checkIn || !setting.checkInTime) return { status: inputStatus, lateMinutes: null, pointPenalty: 0 };

  const expectedMinutes = timeToMinutes(setting.checkInTime);
  const actualMinutes = timeToMinutes(checkIn);
  if (expectedMinutes === null || actualMinutes === null) return { status: inputStatus, lateMinutes: null, pointPenalty: 0 };

  const lateMinutes = Math.max(actualMinutes - expectedMinutes, 0);
  const isLateByRule = actualMinutes > expectedMinutes + (setting.lateToleranceMinutes ?? 0);

  if (isLateStatus(inputStatus) || isLateByRule) {
    const pointPenalty = calculatePenalty({
      lateMinutes,
      penaltyIntervalMinutes: setting.penaltyIntervalMinutes,
      penaltyPointsPerInterval: setting.penaltyPointsPerInterval,
      maxLatePenaltyPoints: setting.maxLatePenaltyPoints,
    });
    return { status: "telat", lateMinutes, pointPenalty };
  }

  return { status: "hadir", lateMinutes: 0, pointPenalty: 0 };
}

async function applyUserPointDelta(userId: number | null, delta: number) {
  if (!userId || delta === 0) return;
  const user = await User.findByPk(userId);
  if (!user) return;
  const currentPoints = Number(user.get("points") ?? 100);
  await user.update({ points: Math.max(currentPoints + delta, 0) });
}

function getPlainAttendance(attendance: Attendance) {
  return attendance.get({ plain: true }) as any;
}

// ------------------ CRUD Handlers ------------------
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const attendance = await Attendance.findByPk(id);
    if (!attendance) return errorResponse("Absensi tidak ditemukan", 404);
    return successResponse({ message: "Detail absensi berhasil diambil", data: attendance });
  } catch (error) {
    console.error(error);
    return errorResponse("Gagal mengambil detail absensi", 500);
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const attendance = await Attendance.findByPk(id);
    if (!attendance) return errorResponse("Absensi tidak ditemukan", 404);

    const oldAttendance = getPlainAttendance(attendance);
    const oldUserId = toNumberOrNull(oldAttendance.userId ?? oldAttendance.user_id);
    const oldPointPenalty = Number(oldAttendance.pointPenalty ?? oldAttendance.point_penalty ?? 0);

    const userId = toNumberOrNull(body.userId ?? body.user_id) ?? oldUserId;
    const fullName = String(body.fullName ?? body.full_name ?? oldAttendance.fullName ?? oldAttendance.full_name ?? "").trim();
    const role = String(body.role ?? oldAttendance.role ?? "").trim().toLowerCase();
    const attendanceDate = String(body.attendanceDate ?? body.attendance_date ?? oldAttendance.attendanceDate ?? oldAttendance.attendance_date ?? "").trim();
    const checkIn = body.checkIn ?? body.check_in ?? oldAttendance.checkIn ?? oldAttendance.check_in ?? null;
    const checkOut = body.checkOut ?? body.check_out ?? oldAttendance.checkOut ?? oldAttendance.check_out ?? null;
    const inputStatus = normalizeStatus(body.status ?? oldAttendance.status);

    if (!fullName) return errorResponse("Nama wajib diisi", 400);
    if (!role) return errorResponse("Role wajib diisi", 400);

    const attendanceResult = await resolveAttendanceResult({ role, checkIn, inputStatus });

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
    });

    if (oldUserId !== userId) {
      await applyUserPointDelta(oldUserId, -oldPointPenalty);
      await applyUserPointDelta(userId, attendanceResult.pointPenalty);
    } else {
      await applyUserPointDelta(userId, attendanceResult.pointPenalty - oldPointPenalty);
    }

    const updatedAttendance = await Attendance.findByPk(id);
    return successResponse({ message: "Absensi berhasil diupdate", data: updatedAttendance });
  } catch (error) {
    console.error(error);
    return errorResponse("Gagal update absensi", 500);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const attendance = await Attendance.findByPk(id);
    if (!attendance) return errorResponse("Absensi tidak ditemukan", 404);

    const oldAttendance = getPlainAttendance(attendance);
    const userId = toNumberOrNull(oldAttendance.userId ?? oldAttendance.user_id);
    const pointPenalty = Number(oldAttendance.pointPenalty ?? oldAttendance.point_penalty ?? 0);

    await attendance.destroy();
    await applyUserPointDelta(userId, -pointPenalty);

    return successResponse({ message: "Absensi berhasil dihapus", data: null });
  } catch (error) {
    console.error(error);
    return errorResponse("Gagal hapus absensi", 500);
  }
}

// Optional: POST untuk create baru
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = toNumberOrNull(body.userId ?? body.user_id);
    const fullName = String(body.fullName ?? body.full_name ?? "").trim();
    const role = String(body.role ?? "").trim().toLowerCase();
    const attendanceDate = String(body.attendanceDate ?? body.attendance_date ?? "").trim();
    const checkIn = body.checkIn ?? body.check_in ?? null;
    const checkOut = body.checkOut ?? body.check_out ?? null;
    const inputStatus = normalizeStatus(body.status ?? "hadir");

    if (!fullName) return errorResponse("Nama wajib diisi", 400);
    if (!role) return errorResponse("Role wajib diisi", 400);

    const attendanceResult = await resolveAttendanceResult({ role, checkIn, inputStatus });

    const newAttendance = await Attendance.create({
      userId,
      fullName,
      role,
      attendanceDate,
      checkIn,
      checkOut,
      status: attendanceResult.status,
      lateMinutes: attendanceResult.lateMinutes,
      pointPenalty: attendanceResult.pointPenalty,
    });

    await applyUserPointDelta(userId, attendanceResult.pointPenalty);

    return successResponse({ message: "Absensi berhasil dibuat", data: newAttendance });
  } catch (error) {
    console.error(error);
    return errorResponse("Gagal membuat absensi", 500);
  }
}