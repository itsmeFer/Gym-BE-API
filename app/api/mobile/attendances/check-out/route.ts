import { NextRequest } from "next/server";
import { Attendance, AttendanceSetting } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

type AttendanceSettingRaw = {
  id: number;
  role: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  officeLatitude?: number | null;
  officeLongitude?: number | null;
  allowedRadiusMeters?: number | null;
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

function getRequiredCheckOutPhoto(body: Record<string, unknown>) {
  return normalizePhoto(
    body.checkOutPhoto ??
      body.check_out_photo ??
      body.photoUrl ??
      body.photo_url ??
      body.photoBase64 ??
      body.photo_base64 ??
      body.photo
  );
}

function timeToMinutes(value: string | null | undefined) {
  if (!value) return null;

  const cleanTime = String(value).trim().slice(0, 5);

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
  const setting = (await AttendanceSetting.findOne({
    where: {
      role,
      isActive: true,
    },
    raw: true,
  })) as AttendanceSettingRaw | null;

  return setting;
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
    1
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
        "Lokasi kamu belum terbaca. Aktifkan GPS/lokasi dulu supaya bisa absen keluar.",
    };
  }

  const distanceMeters = Math.round(
    calculateDistanceMeters({
      fromLatitude: officeLatitude,
      fromLongitude: officeLongitude,
      toLatitude: userLatitude,
      toLongitude: userLongitude,
    })
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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    const userId = toNumberOrNull(body.userId ?? body.user_id);

    const userLatitude = toNumberOrNull(body.latitude ?? body.lat);

    const userLongitude = toNumberOrNull(
      body.longitude ?? body.lng ?? body.long
    );

    const location = body.location ? String(body.location).trim() : null;

    const deviceMac = body.deviceMac
      ? String(body.deviceMac).trim()
      : body.device_mac
        ? String(body.device_mac).trim()
        : null;

    const checkOutPhoto = getRequiredCheckOutPhoto(body);

    const note = body.note ? String(body.note).trim() : null;

    if (!userId) {
      return errorResponse("User belum dikenali. Silakan login ulang.", 400);
    }

    if (!checkOutPhoto) {
      return errorResponse("Foto absen keluar wajib dikirim.", 400);
    }

    const today = getJakartaDateString();
    const nowTime = getJakartaTimeString();

    const attendance = await Attendance.findOne({
      where: {
        userId,
        attendanceDate: today,
      },
    });

    if (!attendance) {
      return errorResponse(
        "Kamu belum absen masuk hari ini, jadi belum bisa absen keluar.",
        404
      );
    }

    if (!attendance.checkIn) {
      return errorResponse(
        "Data absen masuk belum ada. Absen keluar belum bisa diproses.",
        400
      );
    }

    if (attendance.checkOut) {
      return errorResponse("Kamu sudah absen keluar hari ini.", 409);
    }

    if (attendance.status === "alpha") {
      return errorResponse(
        "Status hari ini sudah alpha, jadi absen keluar tidak bisa dilakukan.",
        400
      );
    }

    const role = String(attendance.role ?? "").trim().toLowerCase();

    const setting = await getAttendanceSetting(role);

    const expectedCheckOutTime = setting?.checkOutTime ?? null;
    const expectedCheckOutMinutes = timeToMinutes(expectedCheckOutTime);
    const nowMinutes = timeToMinutes(nowTime);

    if (
      expectedCheckOutTime &&
      expectedCheckOutMinutes !== null &&
      nowMinutes !== null &&
      nowMinutes < expectedCheckOutMinutes
    ) {
      return errorResponse(
        `Belum waktunya absen keluar. Jam keluar role ${role.toUpperCase()} adalah ${expectedCheckOutTime}. Kamu bisa absen keluar jam ${expectedCheckOutTime} atau setelahnya.`,
        400
      );
    }

    const distanceResult = validateDistance({
      userLatitude,
      userLongitude,
      setting,
    });

    if (!distanceResult.ok) {
      return errorResponse(distanceResult.message ?? "Lokasi tidak valid", 400);
    }

    const locationText =
      userLatitude !== null && userLongitude !== null
        ? `${location ?? "Lokasi user"} (${userLatitude}, ${userLongitude})${
            distanceResult.distanceMeters !== null
              ? ` • jarak ${distanceResult.distanceMeters}m`
              : ""
          }`
        : location;

    await attendance.update({
      checkOut: nowTime,
      location: locationText || attendance.location,
      deviceMac: deviceMac || attendance.deviceMac,
      checkOutPhoto,
      note: note || attendance.note,
    });

    const updatedAttendance = await Attendance.findByPk(attendance.id);

    return successResponse({
      message: "Absen keluar berhasil. Mantap, kerja hari ini selesai.",
      data: updatedAttendance,
    });
  } catch (error) {
    console.error("CHECK OUT ERROR:", error);

    return errorResponse(
      "Terjadi kesalahan saat absen keluar. Coba lagi sebentar ya.",
      500
    );
  }
}