import { NextRequest } from "next/server";
import { Op } from "sequelize";
import { AttendanceSetting } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { getTokenFromRequest, verifyToken } from "@/lib/auth";

export const runtime = "nodejs";

const ALLOWED_ADMIN_ROLES = ["admin", "owner", "direktur", "manager", "superadmin", "it"];

const ALL_ROLES = [
  "admin",
  "direktur",
  "manager",
  "kasir",
  "karyawan",
  "trainer",
  "sales",
  "customer",
];

function normalizeRole(value: unknown) {
  const role = String(value ?? "").trim().toLowerCase();
  if (role === "semua" || role === "semua_role") return "all";
  return role;
}

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

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    const userPayload = token ? verifyToken(token) : null;

    if (!userPayload) {
      return errorResponse("Autentikasi gagal. Silakan login kembali.", 401);
    }

    if (!ALLOWED_ADMIN_ROLES.includes(userPayload.role.toLowerCase())) {
      return errorResponse("Akses ditolak: Hanya admin yang berhak mengakses pengaturan absensi", 403);
    }

    const searchParams = request.nextUrl.searchParams;
    const role = searchParams.get("role");
    const where: Record<string, unknown> = {};

    if (role && role !== "semua" && role !== "all") {
      where.role = normalizeRole(role);
    }

    const settings = await AttendanceSetting.findAll({
      where,
      order: [["id", "ASC"]],
    });

    return successResponse({
      message: "Data pengaturan absensi berhasil diambil",
      data: settings.map(serializeSetting),
    });
  } catch (error) {
    console.error("GET /api/admin/attendance-settings ERROR:", error);
    return errorResponse("Gagal mengambil pengaturan absensi", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    const userPayload = token ? verifyToken(token) : null;

    if (!userPayload) {
      return errorResponse("Autentikasi gagal. Silakan login kembali.", 401);
    }

    if (!ALLOWED_ADMIN_ROLES.includes(userPayload.role.toLowerCase())) {
      return errorResponse("Akses ditolak: Hanya admin yang berhak membuat pengaturan absensi", 403);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const role = normalizeRole(body.role);

    if (!role) {
      return errorResponse("Role wajib diisi", 400);
    }

    const checkInTime = normalizeTime(body.checkInTime ?? body.check_in_time);
    const checkOutTime = normalizeTime(body.checkOutTime ?? body.check_out_time);
    const officeLatitude = toNumberOrNull(body.officeLatitude ?? body.office_latitude);
    const officeLongitude = toNumberOrNull(body.officeLongitude ?? body.office_longitude);
    const allowedRadiusMeters = Math.max(toNumber(body.allowedRadiusMeters ?? body.allowed_radius_meters, 100), 1);
    const isActive = toBoolean(body.isActive ?? body.is_active, true);
    const note = body.note ? String(body.note).trim() : null;

    const lateToleranceMinutes = Math.max(toNumber(body.lateToleranceMinutes ?? body.late_tolerance_minutes, 0), 0);
    const penaltyIntervalMinutes = Math.max(toNumber(body.penaltyIntervalMinutes ?? body.penalty_interval_minutes, 60), 1);
    const penaltyPointsPerInterval = Math.max(toNumber(body.penaltyPointsPerInterval ?? body.penalty_points_per_interval, 0), 0);
    const maxLatePenaltyPoints = Math.max(toNumber(body.maxLatePenaltyPoints ?? body.max_late_penalty_points, 0), 0);
    const absentPenaltyPoints = Math.max(toNumber(body.absentPenaltyPoints ?? body.absent_penalty_points, 0), 0);

    const setting = await AttendanceSetting.create({
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
      message: "Pengaturan absensi berhasil dibuat",
      data: serializeSetting(setting),
    });
  } catch (error) {
    console.error("POST /api/admin/attendance-settings ERROR:", error);
    return errorResponse("Gagal membuat pengaturan absensi", 500);
  }
}
