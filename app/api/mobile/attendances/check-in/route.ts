import { NextRequest } from "next/server";

import { Attendance, AttendanceSetting, User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

type AttendanceSettingRaw = {
  id: number;
  role: string;
  checkInTime: string | null;
  checkOutTime?: string | null;
  officeLatitude?: number | null;
  officeLongitude?: number | null;
  allowedRadiusMeters?: number | null;
  lateToleranceMinutes: number;
  penaltyIntervalMinutes: number;
  penaltyPointsPerInterval: number;
  maxLatePenaltyPoints: number;
  absentPenaltyPoints: number;
  isActive: boolean;
  note: string | null;
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
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizePhoto(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();

  if (!text) {
    return null;
  }

  return text;
}

function getRequiredCheckInPhoto(body: Record<string, unknown>) {
  return normalizePhoto(
    body.checkInPhoto ??
      body.check_in_photo ??
      body.photoUrl ??
      body.photo_url ??
      body.photoBase64 ??
      body.photo_base64 ??
      body.photo,
  );
}

function timeToMinutes(time: string) {
  const cleanTime = time.trim().slice(0, 5);

  if (!/^\d{2}:\d{2}$/.test(cleanTime)) {
    return null;
  }

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

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function calculateDistanceMeters(params: {
  fromLatitude: number;
  fromLongitude: number;
  toLatitude: number;
  toLongitude: number;
}) {
  const earthRadiusMeters = 6371000;
  const fromLatRad = toRadians(params.fromLatitude);
  const toLatRad = toRadians(params.toLatitude);
  const deltaLatRad = toRadians(params.toLatitude - params.fromLatitude);
  const deltaLonRad = toRadians(params.toLongitude - params.fromLongitude);

  const a =
    Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
    Math.cos(fromLatRad) *
      Math.cos(toLatRad) *
      Math.sin(deltaLonRad / 2) *
      Math.sin(deltaLonRad / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
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

function validateDistance(params: {
  userLatitude: number | null;
  userLongitude: number | null;
  setting: AttendanceSettingRaw | null;
}) {
  const { userLatitude, userLongitude, setting } = params;

  if (!setting) {
    return {
      ok: true,
      distanceMeters: null,
      allowedRadiusMeters: null,
      message: null,
    };
  }

  const officeLatitude = toNumberOrNull(setting.officeLatitude);
  const officeLongitude = toNumberOrNull(setting.officeLongitude);
  const allowedRadiusMeters = Math.max(
    Number(setting.allowedRadiusMeters ?? 100),
    1,
  );
  const geofenceIsEnabled =
    officeLatitude !== null && officeLongitude !== null;

  if (!geofenceIsEnabled) {
    return {
      ok: true,
      distanceMeters: null,
      allowedRadiusMeters,
      message: null,
    };
  }

  if (userLatitude === null || userLongitude === null) {
    return {
      ok: false,
      distanceMeters: null,
      allowedRadiusMeters,
      message:
        "Lokasi kamu belum terbaca. Aktifkan GPS/lokasi dulu supaya bisa absen.",
    };
  }

  const distanceMeters = Math.round(
    calculateDistanceMeters({
      fromLatitude: officeLatitude,
      fromLongitude: officeLongitude,
      toLatitude: userLatitude,
      toLongitude: userLongitude,
    }),
  );

  if (distanceMeters > allowedRadiusMeters) {
    return {
      ok: false,
      distanceMeters,
      allowedRadiusMeters,
      message: `Kamu terlalu jauh dari lokasi kantor. Jarak kamu sekitar ${distanceMeters} meter, batas maksimal ${allowedRadiusMeters} meter.`,
    };
  }

  return {
    ok: true,
    distanceMeters,
    allowedRadiusMeters,
    message: null,
  };
}

function calculateLateResult(params: {
  checkIn: string;
  setting: AttendanceSettingRaw | null;
}) {
  const { checkIn, setting } = params;

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

  const rawLateMinutes = actualMinutes - expectedMinutes;
  const lateMinutes = rawLateMinutes > 0 ? rawLateMinutes : 0;
  const lateToleranceMinutes = Number(setting.lateToleranceMinutes ?? 0);
  const isLate = actualMinutes > expectedMinutes + lateToleranceMinutes;

  if (!isLate) {
    return {
      status: "hadir",
      lateMinutes: 0,
      pointPenalty: 0,
    };
  }

  const penaltyIntervalMinutes = Math.max(
    Number(setting.penaltyIntervalMinutes ?? 60),
    1,
  );
  const penaltyPointsPerInterval = Math.max(
    Number(setting.penaltyPointsPerInterval ?? 1),
    0,
  );
  const maxLatePenaltyPoints = Math.max(
    Number(setting.maxLatePenaltyPoints ?? 8),
    0,
  );
  const intervalCount = Math.ceil(lateMinutes / penaltyIntervalMinutes);
  const rawPenaltyPoints = intervalCount * penaltyPointsPerInterval;
  const cappedPenaltyPoints = Math.min(rawPenaltyPoints, maxLatePenaltyPoints);

  return {
    status: "telat",
    lateMinutes,
    pointPenalty: -Math.abs(cappedPenaltyPoints),
  };
}

async function applyUserPointDelta(userId: number, delta: number) {
  if (delta === 0) return;

  const user = await User.findByPk(userId);
  if (!user) return;

  const currentPoints = Number(user.get("points") ?? 100);
  const nextPoints = Math.max(currentPoints + delta, 0);

  await user.update({ points: nextPoints });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    const userId = toNumberOrNull(body.userId ?? body.user_id);
    const fullName = String(
      body.fullName ?? body.full_name ?? body.name ?? "",
    ).trim();
    const role = String(body.role ?? "").trim().toLowerCase();
    const userLatitude = toNumberOrNull(body.latitude ?? body.lat);
    const userLongitude = toNumberOrNull(
      body.longitude ?? body.lng ?? body.long,
    );
    const location = body.location ? String(body.location).trim() : null;
    const deviceMac = body.deviceMac
      ? String(body.deviceMac).trim()
      : body.device_mac
        ? String(body.device_mac).trim()
        : null;
    const checkInPhoto = getRequiredCheckInPhoto(body);
    const note = body.note ? String(body.note).trim() : null;

    if (!userId) {
      return errorResponse("User belum dikenali. Silakan login ulang.", 400);
    }

    if (!fullName) {
      return errorResponse("Nama user tidak ditemukan", 400);
    }

    if (!role) {
      return errorResponse("Role user tidak ditemukan", 400);
    }

    if (!checkInPhoto) {
      return errorResponse("Foto absen masuk wajib dikirim.", 400);
    }

    const today = getJakartaDateString();
    const nowTime = getJakartaTimeString();

    const existingAttendance = await Attendance.findOne({
      where: {
        userId,
        attendanceDate: today,
      },
    });

    if (existingAttendance) {
      return errorResponse("Kamu sudah absen masuk hari ini.", 409);
    }

    const setting = await getAttendanceSetting(role);
    const distanceResult = validateDistance({
      userLatitude,
      userLongitude,
      setting,
    });

    if (!distanceResult.ok) {
      return errorResponse(distanceResult.message ?? "Lokasi tidak valid", 400);
    }

    const attendanceResult = calculateLateResult({
      checkIn: nowTime.slice(0, 5),
      setting,
    });
    const locationText =
      userLatitude !== null && userLongitude !== null
        ? `${location ?? "Lokasi user"} (${userLatitude}, ${userLongitude})${
            distanceResult.distanceMeters !== null
              ? ` - jarak ${distanceResult.distanceMeters}m`
              : ""
          }`
        : location;

    const attendance = await Attendance.create({
      userId,
      fullName,
      role,
      attendanceDate: today,
      checkIn: nowTime,
      checkOut: null,
      status: attendanceResult.status,
      lateMinutes: attendanceResult.lateMinutes,
      pointPenalty: attendanceResult.pointPenalty,
      location: locationText,
      deviceMac,
      checkInPhoto,
      checkOutPhoto: null,
      note,
      isManual: false,
    });

    await applyUserPointDelta(userId, attendanceResult.pointPenalty);

    return successResponse({
      message:
        attendanceResult.pointPenalty < 0
          ? "Absen masuk berhasil, telat, dan point kamu sudah dikurangi."
          : "Absen masuk berhasil. Semangat kerja hari ini!",
      data: attendance,
    });
  } catch (error) {
    console.error("CHECK IN ERROR:", error);

    return errorResponse(
      "Terjadi kesalahan saat absen masuk. Coba lagi sebentar ya.",
      500,
    );
  }
}
