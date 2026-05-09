import { NextRequest } from "next/server";
import { AttendanceSetting } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

const ALL_ROLES = [
  "admin",
  "direktur",
  "manager",
  "karyawan",
  "trainer",
  "sales",
  "customer",
];

function toNumber(value: unknown, defaultValue = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

function toNumberOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeTime(value: unknown) {
  if (value === undefined || value === null || value === "") return null;

  const text = String(value).trim();

  if (!/^\d{2}:\d{2}$/.test(text)) return null;

  const [hour, minute] = text.split(":").map(Number);

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

  return text;
}

function normalizeRole(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isAllRole(role: string) {
  return role === "semua" || role === "all" || role === "semua_role";
}

function isAllowedRole(role: string) {
  return ALL_ROLES.includes(role);
}

export async function GET() {
  try {
    const settings = await AttendanceSetting.findAll({
      order: [["role", "ASC"]],
    });

    return successResponse({
      message: "Setting absensi berhasil diambil",
      data: settings,
    });
  } catch (error) {
    console.error("GET MANAGER ATTENDANCE SETTINGS ERROR:", error);
    return errorResponse("Gagal mengambil setting absensi", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const role = normalizeRole(body.role);

    const checkInTime = normalizeTime(body.checkInTime ?? body.check_in_time);
    const checkOutTime = normalizeTime(body.checkOutTime ?? body.check_out_time);

    const officeLatitude = toNumberOrNull(
      body.officeLatitude ?? body.office_latitude,
    );

    const officeLongitude = toNumberOrNull(
      body.officeLongitude ?? body.office_longitude,
    );

    const allowedRadiusMeters = Math.max(
      toNumber(body.allowedRadiusMeters ?? body.allowed_radius_meters, 100),
      1,
    );

    const lateToleranceMinutes = Math.max(
      toNumber(body.lateToleranceMinutes ?? body.late_tolerance_minutes, 0),
      0,
    );

    const penaltyIntervalMinutes = Math.max(
      toNumber(body.penaltyIntervalMinutes ?? body.penalty_interval_minutes, 60),
      1,
    );

    const penaltyPointsPerInterval = Math.max(
      toNumber(
        body.penaltyPointsPerInterval ?? body.penalty_points_per_interval,
        1,
      ),
      0,
    );

    const maxLatePenaltyPoints = Math.max(
      toNumber(body.maxLatePenaltyPoints ?? body.max_late_penalty_points, 8),
      0,
    );

    const absentPenaltyPoints = Math.max(
      toNumber(body.absentPenaltyPoints ?? body.absent_penalty_points, 8),
      0,
    );

    const isActive =
      typeof body.isActive === "boolean"
        ? body.isActive
        : typeof body.is_active === "boolean"
          ? body.is_active
          : true;

    const note =
      body.note === undefined || body.note === null || body.note === ""
        ? null
        : String(body.note).trim();

    if (!role) {
      return errorResponse("Role wajib diisi", 400);
    }

    if (!isAllRole(role) && !isAllowedRole(role)) {
      return errorResponse(
        `Role tidak valid. Role yang tersedia: ${ALL_ROLES.join(", ")}`,
        400,
      );
    }

    if (
      officeLatitude !== null &&
      (officeLatitude < -90 || officeLatitude > 90)
    ) {
      return errorResponse("Latitude kantor tidak valid", 400);
    }

    if (
      officeLongitude !== null &&
      (officeLongitude < -180 || officeLongitude > 180)
    ) {
      return errorResponse("Longitude kantor tidak valid", 400);
    }

    const targetRoles = isAllRole(role) ? ALL_ROLES : [role];
    const savedSettings = [];

    for (const targetRole of targetRoles) {
      const [setting, created] = await AttendanceSetting.findOrCreate({
        where: { role: targetRole },
        defaults: {
          role: targetRole,
          checkInTime,
          checkOutTime,
          officeLatitude,
          officeLongitude,
          allowedRadiusMeters,
          lateToleranceMinutes,
          penaltyIntervalMinutes,
          penaltyPointsPerInterval,
          maxLatePenaltyPoints,
          absentPenaltyPoints,
          isActive,
          note,
        },
      });

      if (!created) {
        await setting.update({
          checkInTime,
          checkOutTime,
          officeLatitude,
          officeLongitude,
          allowedRadiusMeters,
          lateToleranceMinutes,
          penaltyIntervalMinutes,
          penaltyPointsPerInterval,
          maxLatePenaltyPoints,
          absentPenaltyPoints,
          isActive,
          note,
        });
      }

      const latestSetting = await AttendanceSetting.findOne({
        where: { role: targetRole },
      });

      savedSettings.push(latestSetting);
    }

    return successResponse({
      message: isAllRole(role)
        ? "Setting absensi semua role berhasil disimpan"
        : "Setting absensi berhasil disimpan",
      data: savedSettings,
    });
  } catch (error) {
    console.error("CREATE MANAGER ATTENDANCE SETTING ERROR:", error);
    return errorResponse("Gagal menyimpan setting absensi", 500);
  }
}
