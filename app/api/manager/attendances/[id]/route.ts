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
  note?: string | null;
};

function toNumberOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
        "Lokasi belum terbaca. Aktifkan GPS/lokasi dulu supaya absensi bisa diupdate.",
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
  oldLocation: string | null;
}) {
  const { location, latitude, longitude, distanceMeters, oldLocation } = params;

  if (latitude === null || longitude === null) {
    return location ?? oldLocation;
  }

  return `${location ?? "Lokasi user"} (${latitude}, ${longitude})${
    distanceMeters !== null ? ` • jarak ${distanceMeters}m` : ""
  }`;
}

function getPlainAttendance(attendance: any) {
  return attendance.get({ plain: true }) as any;
}

function serializeAttendance(attendance: any) {
  if (!attendance) return null;

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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const attendance = await Attendance.findByPk(id);

    if (!attendance) {
      return errorResponse("Absensi tidak ditemukan", 404);
    }

    return successResponse({
      message: "Detail absensi berhasil diambil",
      data: serializeAttendance(attendance),
    });
  } catch (error) {
    console.error("GET MANAGER ATTENDANCE DETAIL ERROR:", error);
    return errorResponse("Gagal mengambil detail absensi", 500);
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const attendance = await Attendance.findByPk(id);

    if (!attendance) {
      return errorResponse("Absensi tidak ditemukan", 404);
    }

    const oldAttendance = getPlainAttendance(attendance);

    const oldUserId = toNumberOrNull(
      oldAttendance.userId ?? oldAttendance.user_id
    );

    const userId = toNumberOrNull(body.userId ?? body.user_id) ?? oldUserId;

    const fullName = String(
      body.fullName ??
        body.full_name ??
        oldAttendance.fullName ??
        oldAttendance.full_name ??
        ""
    ).trim();

    const role = String(body.role ?? oldAttendance.role ?? "")
      .trim()
      .toLowerCase();

    const attendanceDate = String(
      body.attendanceDate ??
        body.attendance_date ??
        oldAttendance.attendanceDate ??
        oldAttendance.attendance_date ??
        ""
    ).trim();

    const checkIn = normalizeTime(
      body.checkIn ??
        body.check_in ??
        oldAttendance.checkIn ??
        oldAttendance.check_in
    );

    const checkOut = normalizeTime(
      body.checkOut ??
        body.check_out ??
        oldAttendance.checkOut ??
        oldAttendance.check_out
    );

    const inputStatus = normalizeStatus(body.status ?? oldAttendance.status);

    const latitude = toNumberOrNull(body.latitude ?? body.lat);
    const longitude = toNumberOrNull(body.longitude ?? body.lng ?? body.long);

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
      body.checkInPhoto !== undefined ||
      body.check_in_photo !== undefined ||
      body.photoIn !== undefined ||
      body.photo_in !== undefined
        ? normalizePhoto(
            body.checkInPhoto ??
              body.check_in_photo ??
              body.photoIn ??
              body.photo_in
          )
        : oldAttendance.checkInPhoto ?? oldAttendance.check_in_photo ?? null;

    const checkOutPhoto =
      body.checkOutPhoto !== undefined ||
      body.check_out_photo !== undefined ||
      body.photoOut !== undefined ||
      body.photo_out !== undefined
        ? normalizePhoto(
            body.checkOutPhoto ??
              body.check_out_photo ??
              body.photoOut ??
              body.photo_out
          )
        : oldAttendance.checkOutPhoto ?? oldAttendance.check_out_photo ?? null;

    if (!fullName) return errorResponse("Nama wajib diisi", 400);
    if (!role) return errorResponse("Role wajib diisi", 400);
    if (!attendanceDate) return errorResponse("Tanggal absensi wajib diisi", 400);

    const setting = await getAttendanceSetting(role);

    const shouldValidateLocation =
      latitude !== null ||
      longitude !== null ||
      body.location !== undefined ||
      body.checkInPhoto !== undefined ||
      body.checkOutPhoto !== undefined ||
      body.check_in_photo !== undefined ||
      body.check_out_photo !== undefined;

    let distanceResult = {
      ok: true,
      distanceMeters: null as number | null,
      allowedRadiusMeters: null as number | null,
      message: null as string | null,
    };

    if (shouldValidateLocation) {
      distanceResult = validateDistance({
        userLatitude: latitude,
        userLongitude: longitude,
        setting,
      });

      if (!distanceResult.ok) {
        return errorResponse(
          distanceResult.message ?? "Lokasi tidak valid",
          400
        );
      }
    }

    const finalStatus =
      inputStatus === "alpha" ||
      inputStatus === "izin" ||
      inputStatus === "sakit" ||
      inputStatus === "cuti"
        ? inputStatus
        : "hadir";

    const locationText = shouldValidateLocation
      ? buildLocationText({
          location,
          latitude,
          longitude,
          distanceMeters: distanceResult.distanceMeters,
          oldLocation: oldAttendance.location ?? null,
        })
      : location;

    await attendance.update({
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
    });

    const updatedAttendance = await Attendance.findByPk(id);

    return successResponse({
      message: "Absensi berhasil diupdate",
      data: serializeAttendance(updatedAttendance),
    });
  } catch (error) {
    console.error("UPDATE MANAGER ATTENDANCE ERROR:", error);
    return errorResponse("Gagal update absensi", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const attendance = await Attendance.findByPk(id);

    if (!attendance) {
      return errorResponse("Absensi tidak ditemukan", 404);
    }

    await attendance.destroy();

    return successResponse({
      message: "Absensi berhasil dihapus",
      data: null,
    });
  } catch (error) {
    console.error("DELETE MANAGER ATTENDANCE ERROR:", error);
    return errorResponse("Gagal hapus absensi", 500);
  }
}