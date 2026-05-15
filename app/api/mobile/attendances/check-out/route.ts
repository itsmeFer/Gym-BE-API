import { NextRequest } from "next/server";
import { Op } from "sequelize";
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

function getJakartaMinutesNow() {
  const time = getJakartaTimeString();
  const [hour, minute] = time.slice(0, 5).split(":").map(Number);

  return hour * 60 + minute;
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
  return text ? text : null;
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

function calculateWorkDurationMinutes(
  checkIn: string | null | undefined,
  checkOut: string | null | undefined
) {
  const start = timeToMinutes(checkIn);
  const end = timeToMinutes(checkOut);

  if (start === null || end === null) {
    return 0;
  }

  let diff = end - start;

  if (diff < 0) {
    diff += 24 * 60;
  }

  return Math.max(diff, 0);
}

function formatWorkDuration(totalMinutes: number) {
  const safeMinutes = Math.max(Number(totalMinutes) || 0, 0);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  if (hours <= 0 && minutes <= 0) return "-";
  if (hours <= 0) return `${minutes} menit`;
  if (minutes <= 0) return `${hours} jam`;

  return `${hours} jam ${minutes} menit`;
}

function validateCheckOutTime(setting: AttendanceSettingRaw | null) {
  if (!setting) {
    return {
      ok: true,
      message: null,
    };
  }

  const checkOutMinutes = timeToMinutes(setting.checkOutTime);

  if (checkOutMinutes === null) {
    return {
      ok: true,
      message: null,
    };
  }

  const nowMinutes = getJakartaMinutesNow();

  if (nowMinutes < checkOutMinutes) {
    return {
      ok: false,
      message: `Belum waktunya absen keluar. Kamu bisa absen keluar jam ${setting.checkOutTime?.slice(
        0,
        5
      )} atau setelahnya.`,
    };
  }

  return {
    ok: true,
    message: null,
  };
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
  const normalizedRole = String(role ?? "").trim().toLowerCase();

  const exact = (await AttendanceSetting.findOne({
    where: {
      role: normalizedRole,
    },
    raw: true,
  })) as AttendanceSettingRaw | null;

  if (exact) return exact;

  const fallbackAll = (await AttendanceSetting.findOne({
    where: {
      role: {
        [Op.in]: ["all", "semua", "semua_role"],
      },
    },
    raw: true,
  })) as AttendanceSettingRaw | null;

  return fallbackAll;
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

  if (setting.isActive !== true) {
    return {
      ok: true,
      distanceMeters: null,
      allowedRadiusMeters: setting.allowedRadiusMeters ?? 100,
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

function serializeAttendance(attendance: any) {
  if (!attendance) return null;

  const plain =
    typeof attendance.get === "function"
      ? attendance.get({ plain: true })
      : attendance;

  const workDurationMinutes = calculateWorkDurationMinutes(
    plain.checkIn,
    plain.checkOut
  );

  return {
    ...plain,
    workDurationMinutes,
    workDurationText: formatWorkDuration(workDurationMinutes),
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

    const role = String(attendance.role ?? "").trim().toLowerCase();
    const setting = await getAttendanceSetting(role);

    const timeResult = validateCheckOutTime(setting);

    if (!timeResult.ok) {
      return errorResponse(timeResult.message ?? "Belum waktunya absen keluar", 400);
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
      status: "hadir",
      lateMinutes: 0,
      pointPenalty: 0,
      location: locationText || attendance.location,
      deviceMac: deviceMac || attendance.deviceMac,
      checkOutPhoto,
      note: note || attendance.note,
    });

    const updatedAttendance = await Attendance.findByPk(attendance.id);

    const serializedAttendance = serializeAttendance(updatedAttendance);

    return successResponse({
      message: `Absen keluar berhasil. Total kerja hari ini ${
        serializedAttendance?.workDurationText ?? "-"
      }.`,
      data: serializedAttendance,
    });
  } catch (error) {
    console.error("CHECK OUT ERROR:", error);

    return errorResponse(
      "Terjadi kesalahan saat absen keluar. Coba lagi sebentar ya.",
      500
    );
  }
}