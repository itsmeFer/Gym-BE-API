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
  note?: string | null;
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

function normalizeTime(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const text = String(value).trim();

  if (!text) return null;

  if (/^\d{2}:\d{2}$/.test(text)) {
    return `${text}:00`;
  }

  if (/^\d{2}:\d{2}:\d{2}$/.test(text)) {
    return text;
  }

  return text;
}

function normalizePhoto(value: unknown) {
  if (value === undefined || value === null) return null;

  const text = String(value).trim();

  return text ? text : null;
}

function timeToSeconds(value: string | null | undefined) {
  if (!value) return null;

  const cleanTime = String(value).trim();
  const match = cleanTime.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);

  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);

  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  return hour * 3600 + minute * 60 + second;
}

function calculateWorkDurationSeconds(
  checkIn: string | null | undefined,
  checkOut: string | null | undefined
) {
  const start = timeToSeconds(checkIn);
  const end = timeToSeconds(checkOut);

  if (start === null || end === null) {
    return 0;
  }

  let diff = end - start;

  if (diff < 0) {
    diff += 24 * 60 * 60;
  }

  return Math.max(diff, 0);
}

function formatWorkDuration(totalSeconds: number) {
  const safeSeconds = Math.max(Number(totalSeconds) || 0, 0);

  if (safeSeconds <= 0) return "-";

  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours} jam ${minutes} menit`;
  }

  if (hours > 0) {
    return `${hours} jam`;
  }

  if (minutes > 0 && seconds > 0) {
    return `${minutes} menit ${seconds} detik`;
  }

  if (minutes > 0) {
    return `${minutes} menit`;
  }

  return `${seconds} detik`;
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

  if (!setting || setting.isActive !== true) {
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
        "Lokasi belum terbaca. Aktifkan GPS/lokasi dulu supaya absensi bisa disimpan.",
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
      message: `Lokasi terlalu jauh dari titik kantor. Jarak sekitar ${distanceMeters} meter, batas maksimal ${allowedRadiusMeters} meter.`,
    };
  }

  return {
    ok: true,
    distanceMeters,
    allowedRadiusMeters,
    message: null,
  };
}

function buildLocationText(params: {
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceMeters: number | null;
}) {
  const { location, latitude, longitude, distanceMeters } = params;

  if (latitude === null || longitude === null) {
    return location;
  }

  return `${location ?? "Lokasi user"} (${latitude}, ${longitude})${
    distanceMeters !== null ? ` • jarak ${distanceMeters}m` : ""
  }`;
}

function serializeAttendance(attendance: any) {
  const plain =
    typeof attendance?.get === "function"
      ? attendance.get({ plain: true })
      : attendance;

  const workDurationSeconds = calculateWorkDurationSeconds(
    plain.checkIn,
    plain.checkOut
  );

  const workDurationMinutes = Math.floor(workDurationSeconds / 60);

  return {
    ...plain,
    lateMinutes: 0,
    pointPenalty: 0,
    workDurationSeconds,
    workDurationMinutes,
    workDurationText: formatWorkDuration(workDurationSeconds),
  };
}

function makeSummary(attendances: any[]) {
  const totalWorkSeconds = attendances.reduce((total, attendance) => {
    return total + Number(attendance.workDurationSeconds ?? 0);
  }, 0);

  const totalWorkMinutes = Math.floor(totalWorkSeconds / 60);

  const completedCount = attendances.filter(
    (attendance) => attendance.checkIn && attendance.checkOut
  ).length;

  const activeCount = attendances.filter(
    (attendance) => attendance.checkIn && !attendance.checkOut
  ).length;

  const incompleteCount = attendances.filter(
    (attendance) => !attendance.checkIn || !attendance.checkOut
  ).length;

  return {
    totalAttendance: attendances.length,
    completedCount,
    activeCount,
    incompleteCount,
    totalWorkSeconds,
    totalWorkMinutes,
    totalWorkText: formatWorkDuration(totalWorkSeconds),
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const userId = toNumberOrNull(searchParams.get("userId"));
    const role = searchParams.get("role");
    const status = searchParams.get("status");
    const date = searchParams.get("date");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Record<string, unknown> = {};

    if (userId) {
      where.userId = userId;
    }

    if (role) {
      where.role = role.toLowerCase();
    }

    if (status) {
      where.status = status.toLowerCase();
    }

    if (date) {
      where.attendanceDate = date;
    } else if (startDate && endDate) {
      where.attendanceDate = {
        [Op.between]: [startDate, endDate],
      };
    } else if (startDate) {
      where.attendanceDate = {
        [Op.gte]: startDate,
      };
    } else if (endDate) {
      where.attendanceDate = {
        [Op.lte]: endDate,
      };
    }

    const attendances = await Attendance.findAll({
      where,
      order: [
        ["attendanceDate", "DESC"],
        ["createdAt", "DESC"],
      ],
    });

    const serializedAttendances = attendances.map(serializeAttendance);

    return successResponse({
      message: "Data absensi berhasil diambil",
      summary: makeSummary(serializedAttendances),
      data: serializedAttendances,
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
      body.fullName ?? body.full_name ?? body.name ?? ""
    ).trim();

    const role = String(body.role ?? "").trim().toLowerCase();

    const attendanceDate = body.attendanceDate
      ? String(body.attendanceDate).trim()
      : todayDate();

    const checkIn = normalizeTime(body.checkIn ?? body.check_in);
    const checkOut = normalizeTime(body.checkOut ?? body.check_out);

    const inputStatus = normalizeStatus(body.status);

    const latitude = toNumberOrNull(body.latitude ?? body.lat);
    const longitude = toNumberOrNull(body.longitude ?? body.lng ?? body.long);

    const location = body.location ? String(body.location).trim() : null;

    const deviceMac = body.deviceMac
      ? String(body.deviceMac).trim()
      : body.device_mac
        ? String(body.device_mac).trim()
        : null;

    const checkInPhoto = normalizePhoto(
      body.checkInPhoto ??
        body.check_in_photo ??
        body.photoIn ??
        body.photo_in
    );

    const checkOutPhoto = normalizePhoto(
      body.checkOutPhoto ??
        body.check_out_photo ??
        body.photoOut ??
        body.photo_out
    );

    const note = body.note ? String(body.note).trim() : null;

    const isManual =
      typeof body.isManual === "boolean"
        ? body.isManual
        : typeof body.is_manual === "boolean"
          ? body.is_manual
          : true;

    if (!fullName) {
      return errorResponse("Nama wajib diisi", 400);
    }

    if (!role) {
      return errorResponse("Role wajib diisi", 400);
    }

    if (!attendanceDate) {
      return errorResponse("Tanggal absensi wajib diisi", 400);
    }

    const setting = await getAttendanceSetting(role);

    const distanceResult = validateDistance({
      userLatitude: latitude,
      userLongitude: longitude,
      setting,
    });

    if (!distanceResult.ok) {
      return errorResponse(distanceResult.message ?? "Lokasi tidak valid", 400);
    }

    const finalStatus =
      inputStatus === "alpha" ||
      inputStatus === "izin" ||
      inputStatus === "sakit" ||
      inputStatus === "cuti"
        ? inputStatus
        : "hadir";

    const locationText = buildLocationText({
      location,
      latitude,
      longitude,
      distanceMeters: distanceResult.distanceMeters,
    });

    const attendance = await Attendance.create({
      userId,
      fullName,
      role,
      attendanceDate,
      checkIn,
      checkOut,
      status: finalStatus,
      lateMinutes: 0,
      pointPenalty: 0,
      location: locationText,
      deviceMac,
      checkInPhoto,
      checkOutPhoto,
      note,
      isManual,
    });

    return successResponse({
      message: "Absensi berhasil dibuat",
      data: serializeAttendance(attendance),
    });
  } catch (error) {
    console.error("CREATE MANAGER ATTENDANCE ERROR:", error);
    return errorResponse("Gagal membuat absensi", 500);
  }
}