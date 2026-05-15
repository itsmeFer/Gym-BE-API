import { NextRequest } from "next/server";
import { Op } from "sequelize";
import { AttendanceSetting } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

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

function isAllRole(role: string) {
  return role === "all" || role === "semua" || role === "semua_role";
}

function isAllowedRole(role: string) {
  return ALL_ROLES.includes(role);
}

function normalizeRolesFromBody(body: Record<string, unknown>) {
  const rawRoles = body.roles;

  if (Array.isArray(rawRoles)) {
    return rawRoles
      .map((item) => normalizeRole(item))
      .filter((item) => item.length > 0);
  }

  const role = normalizeRole(body.role);

  return role ? [role] : [];
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

  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const text = String(value).trim().toLowerCase();

  if (["true", "1", "yes", "ya", "aktif", "active"].includes(text)) {
    return true;
  }

  if (["false", "0", "no", "tidak", "nonaktif", "inactive"].includes(text)) {
    return false;
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

function buildSettingPayload(body: Record<string, unknown>, role: string) {
  const checkInTime = normalizeTime(body.checkInTime ?? body.check_in_time);
  const checkOutTime = normalizeTime(body.checkOutTime ?? body.check_out_time);

  const rawCheckIn = body.checkInTime ?? body.check_in_time;
  const rawCheckOut = body.checkOutTime ?? body.check_out_time;

  if (rawCheckIn && !checkInTime) {
    return {
      error: "Format jam masuk tidak valid. Gunakan HH:mm, contoh 08:00",
      data: null,
    };
  }

  if (rawCheckOut && !checkOutTime) {
    return {
      error: "Format jam keluar tidak valid. Gunakan HH:mm, contoh 17:00",
      data: null,
    };
  }

  const officeLatitude = toNumberOrNull(
    body.officeLatitude ?? body.office_latitude
  );

  const officeLongitude = toNumberOrNull(
    body.officeLongitude ?? body.office_longitude
  );

  const allowedRadiusMeters = Math.max(
    toNumber(body.allowedRadiusMeters ?? body.allowed_radius_meters, 100),
    1
  );

  const locationEnabled = toBoolean(
    body.locationEnabled ??
      body.location_enabled ??
      body.geofenceEnabled ??
      body.geofence_enabled ??
      body.isActive ??
      body.is_active,
    true
  );

  if (
    officeLatitude !== null &&
    (officeLatitude < -90 || officeLatitude > 90)
  ) {
    return {
      error: "Latitude kantor tidak valid",
      data: null,
    };
  }

  if (
    officeLongitude !== null &&
    (officeLongitude < -180 || officeLongitude > 180)
  ) {
    return {
      error: "Longitude kantor tidak valid",
      data: null,
    };
  }

  if (locationEnabled && (officeLatitude === null || officeLongitude === null)) {
    return {
      error:
        "Latitude dan longitude kantor wajib diisi jika validasi lokasi aktif",
      data: null,
    };
  }

  const note =
    body.note === undefined || body.note === null || body.note === ""
      ? null
      : String(body.note).trim();

  return {
    error: null,
    data: {
      role,
      checkInTime,
      checkOutTime,
      officeLatitude,
      officeLongitude,
      allowedRadiusMeters,

      lateToleranceMinutes: 0,
      penaltyIntervalMinutes: 60,
      penaltyPointsPerInterval: 0,
      maxLatePenaltyPoints: 0,
      absentPenaltyPoints: 0,

      isActive: locationEnabled,
      note,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const role = normalizeRole(searchParams.get("role"));

    if (role && !isAllRole(role) && !isAllowedRole(role)) {
      return errorResponse(
        `Role tidak valid. Role yang tersedia: ${ALL_ROLES.join(", ")}`,
        400
      );
    }

    if (role && !isAllRole(role)) {
      const settings = await AttendanceSetting.findAll({
        where: {
          role: {
            [Op.in]: [role, "all"],
          },
        },
        order: [
          ["role", "ASC"],
          ["id", "ASC"],
        ],
      });

      const exact = settings.find((item: any) => {
        const plain =
          typeof item.get === "function" ? item.get({ plain: true }) : item;

        return normalizeRole(plain.role) === role;
      });

      const fallbackAll = settings.find((item: any) => {
        const plain =
          typeof item.get === "function" ? item.get({ plain: true }) : item;

        return normalizeRole(plain.role) === "all";
      });

      const selected = exact ?? fallbackAll ?? null;

      return successResponse({
        message: selected
          ? "Setting absensi berhasil diambil"
          : "Setting absensi belum dibuat",
        data: serializeSetting(selected),
      });
    }

    const settings = await AttendanceSetting.findAll({
      order: [
        ["role", "ASC"],
        ["id", "ASC"],
      ],
    });

    return successResponse({
      message: "Setting absensi berhasil diambil",
      data: settings.map(serializeSetting),
    });
  } catch (error) {
    console.error("GET MANAGER ATTENDANCE SETTINGS ERROR:", error);
    return errorResponse("Gagal mengambil setting absensi", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    const requestedRoles = normalizeRolesFromBody(body);

    if (requestedRoles.length === 0) {
      return errorResponse(
        "Role wajib diisi. Bisa pakai role: 'admin', role: 'all', atau roles: ['admin', 'kasir']",
        400
      );
    }

    const uniqueRequestedRoles = Array.from(new Set(requestedRoles));

    for (const role of uniqueRequestedRoles) {
      if (!isAllRole(role) && !isAllowedRole(role)) {
        return errorResponse(
          `Role ${role} tidak valid. Role yang tersedia: all, ${ALL_ROLES.join(
            ", "
          )}`,
          400
        );
      }
    }

    const targetRoles = uniqueRequestedRoles.includes("all")
      ? ["all"]
      : uniqueRequestedRoles;

    const savedSettings = [];

    for (const targetRole of targetRoles) {
      const built = buildSettingPayload(body, targetRole);

      if (built.error || !built.data) {
        return errorResponse(built.error ?? "Payload setting tidak valid", 400);
      }

      const [setting, created] = await AttendanceSetting.findOrCreate({
        where: { role: targetRole },
        defaults: built.data,
      });

      if (!created) {
        await setting.update(built.data);
      }

      const latestSetting = await AttendanceSetting.findOne({
        where: { role: targetRole },
      });

      savedSettings.push(serializeSetting(latestSetting));
    }

    return successResponse({
      message: targetRoles.includes("all")
        ? "Setting default semua role berhasil disimpan"
        : targetRoles.length > 1
          ? "Setting beberapa role berhasil disimpan"
          : "Setting absensi role berhasil disimpan",
      data: savedSettings,
    });
  } catch (error) {
    console.error("CREATE MANAGER ATTENDANCE SETTING ERROR:", error);
    return errorResponse("Gagal menyimpan setting absensi", 500);
  }
}

export async function PUT(request: NextRequest) {
  return POST(request);
}