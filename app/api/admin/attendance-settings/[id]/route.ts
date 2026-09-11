import { NextRequest } from "next/server";
import { AttendanceSetting } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { getTokenFromRequest, verifyToken } from "@/lib/auth";

export const runtime = "nodejs";

const ALLOWED_ADMIN_ROLES = ["admin", "owner", "direktur", "manager", "superadmin", "it"];

function toNumber(value: unknown, defaultValue = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

function toNumberOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toBoolean(value: unknown, defaultValue = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (text === "true" || text === "1") return true;
    if (text === "false" || text === "0") return false;
  }
  return defaultValue;
}

function normalizeTime(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  const match = text.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) return null;
  return `${match[1]}:${match[2]}:00`;
}

function serializeSetting(setting: any) {
  if (!setting) return null;
  const plain =
    typeof setting.get === "function" ? setting.get({ plain: true }) : setting;

  return {
    id: plain.id,
    role: plain.role,
    checkInTime: plain.checkInTime ?? plain.check_in_time ?? null,
    checkOutTime: plain.checkOutTime ?? plain.check_out_time ?? null,
    officeLatitude: plain.officeLatitude ?? plain.office_latitude ?? null,
    officeLongitude: plain.officeLongitude ?? plain.office_longitude ?? null,
    allowedRadiusMeters:
      plain.allowedRadiusMeters ?? plain.allowed_radius_meters ?? 100,
    locationEnabled:
      plain.isActive === true || plain.is_active === true ? true : false,
    geofenceEnabled:
      plain.isActive === true || plain.is_active === true ? true : false,
    isActive: plain.isActive ?? plain.is_active ?? false,
    note: plain.note ?? null,
    lateToleranceMinutes: plain.lateToleranceMinutes ?? 0,
    penaltyIntervalMinutes: plain.penaltyIntervalMinutes ?? 60,
    penaltyPointsPerInterval: plain.penaltyPointsPerInterval ?? 0,
    maxLatePenaltyPoints: plain.maxLatePenaltyPoints ?? 0,
    absentPenaltyPoints: plain.absentPenaltyPoints ?? 0,
    createdAt: plain.createdAt ?? plain.created_at ?? null,
    updatedAt: plain.updatedAt ?? plain.updated_at ?? null,
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromRequest(request);
    const userPayload = token ? verifyToken(token) : null;

    if (!userPayload) {
      return errorResponse("Autentikasi gagal. Silakan login kembali.", 401);
    }

    if (!ALLOWED_ADMIN_ROLES.includes(userPayload.role.toLowerCase())) {
      return errorResponse("Akses ditolak: Hanya admin yang berhak mengakses pengaturan absensi", 403);
    }

    const { id } = await context.params;
    const settingId = toNumberOrNull(id);

    if (!settingId) {
      return errorResponse("ID pengaturan absensi tidak valid", 400);
    }

    const setting = await AttendanceSetting.findByPk(settingId);
    if (!setting) {
      return errorResponse("Pengaturan absensi tidak ditemukan", 404);
    }

    return successResponse({
      message: "Detail pengaturan absensi berhasil diambil",
      data: serializeSetting(setting),
    });
  } catch (error) {
    console.error("GET /api/admin/attendance-settings/[id] ERROR:", error);
    return errorResponse("Gagal mengambil detail pengaturan absensi", 500);
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromRequest(request);
    const userPayload = token ? verifyToken(token) : null;

    if (!userPayload) {
      return errorResponse("Autentikasi gagal. Silakan login kembali.", 401);
    }

    if (!ALLOWED_ADMIN_ROLES.includes(userPayload.role.toLowerCase())) {
      return errorResponse("Akses ditolak: Hanya admin yang berhak mengubah pengaturan absensi", 403);
    }

    const { id } = await context.params;
    const settingId = toNumberOrNull(id);

    if (!settingId) {
      return errorResponse("ID pengaturan absensi tidak valid", 400);
    }

    const setting = await AttendanceSetting.findByPk(settingId);
    if (!setting) {
      return errorResponse("Pengaturan absensi tidak ditemukan", 404);
    }

    const body = (await request.json()) as Record<string, unknown>;

    const role = body.role !== undefined ? String(body.role).trim().toLowerCase() : setting.role;
    const checkInTime = body.checkInTime !== undefined || body.check_in_time !== undefined
      ? normalizeTime(body.checkInTime ?? body.check_in_time)
      : setting.checkInTime;
    const checkOutTime = body.checkOutTime !== undefined || body.check_out_time !== undefined
      ? normalizeTime(body.checkOutTime ?? body.check_out_time)
      : setting.checkOutTime;

    const officeLatitude = body.officeLatitude !== undefined || body.office_latitude !== undefined
      ? toNumberOrNull(body.officeLatitude ?? body.office_latitude)
      : setting.officeLatitude;
    const officeLongitude = body.officeLongitude !== undefined || body.office_longitude !== undefined
      ? toNumberOrNull(body.officeLongitude ?? body.office_longitude)
      : setting.officeLongitude;
    const allowedRadiusMeters = body.allowedRadiusMeters !== undefined || body.allowed_radius_meters !== undefined
      ? Math.max(toNumber(body.allowedRadiusMeters ?? body.allowed_radius_meters, 100), 1)
      : setting.allowedRadiusMeters;

    const isActive = body.isActive !== undefined || body.is_active !== undefined
      ? toBoolean(body.isActive ?? body.is_active, true)
      : setting.isActive;

    const note = body.note !== undefined ? (body.note ? String(body.note).trim() : null) : setting.note;

    const lateToleranceMinutes = body.lateToleranceMinutes !== undefined || body.late_tolerance_minutes !== undefined
      ? Math.max(toNumber(body.lateToleranceMinutes ?? body.late_tolerance_minutes, 0), 0)
      : setting.lateToleranceMinutes;
    const penaltyIntervalMinutes = body.penaltyIntervalMinutes !== undefined || body.penalty_interval_minutes !== undefined
      ? Math.max(toNumber(body.penaltyIntervalMinutes ?? body.penalty_interval_minutes, 60), 1)
      : setting.penaltyIntervalMinutes;
    const penaltyPointsPerInterval = body.penaltyPointsPerInterval !== undefined || body.penalty_points_per_interval !== undefined
      ? Math.max(toNumber(body.penaltyPointsPerInterval ?? body.penalty_points_per_interval, 0), 0)
      : setting.penaltyPointsPerInterval;
    const maxLatePenaltyPoints = body.maxLatePenaltyPoints !== undefined || body.max_late_penalty_points !== undefined
      ? Math.max(toNumber(body.maxLatePenaltyPoints ?? body.max_late_penalty_points, 0), 0)
      : setting.maxLatePenaltyPoints;
    const absentPenaltyPoints = body.absentPenaltyPoints !== undefined || body.absent_penalty_points !== undefined
      ? Math.max(toNumber(body.absentPenaltyPoints ?? body.absent_penalty_points, 0), 0)
      : setting.absentPenaltyPoints;

    await setting.update({
      role,
      checkInTime,
      checkOutTime,
      officeLatitude,
      officeLongitude,
      allowedRadiusMeters,
      isActive,
      note,
      lateToleranceMinutes,
      penaltyIntervalMinutes,
      penaltyPointsPerInterval,
      maxLatePenaltyPoints,
      absentPenaltyPoints,
    });

    return successResponse({
      message: "Pengaturan absensi berhasil diperbarui",
      data: serializeSetting(setting),
    });
  } catch (error) {
    console.error("PUT /api/admin/attendance-settings/[id] ERROR:", error);
    return errorResponse("Gagal memperbarui pengaturan absensi", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromRequest(request);
    const userPayload = token ? verifyToken(token) : null;

    if (!userPayload) {
      return errorResponse("Autentikasi gagal. Silakan login kembali.", 401);
    }

    if (!ALLOWED_ADMIN_ROLES.includes(userPayload.role.toLowerCase())) {
      return errorResponse("Akses ditolak: Hanya admin yang berhak menghapus pengaturan absensi", 403);
    }

    const { id } = await context.params;
    const settingId = toNumberOrNull(id);

    if (!settingId) {
      return errorResponse("ID pengaturan absensi tidak valid", 400);
    }

    const setting = await AttendanceSetting.findByPk(settingId);
    if (!setting) {
      return errorResponse("Pengaturan absensi tidak ditemukan", 404);
    }

    await setting.destroy();

    return successResponse({
      message: "Pengaturan absensi berhasil dihapus",
      data: null,
    });
  } catch (error) {
    console.error("DELETE /api/admin/attendance-settings/[id] ERROR:", error);
    return errorResponse("Gagal menghapus pengaturan absensi", 500);
  }
}
