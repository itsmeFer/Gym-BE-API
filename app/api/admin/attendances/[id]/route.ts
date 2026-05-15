import { NextRequest } from "next/server";
import { Attendance } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

function toNumberOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeText(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text ? text : null;
}

function normalizeStatus(value: unknown) {
  return String(value ?? "hadir").trim().toLowerCase();
}

function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.toISOString().slice(0, 10) === value;
}

function isProtectedDynamicId(id: string) {
  return [
    "check-in",
    "check-out",
    "me",
    "today",
  ].includes(id.trim().toLowerCase());
}

function getPlainAttendance(attendance: any) {
  if (!attendance) return null;

  if (typeof attendance.get === "function") {
    return attendance.get({ plain: true });
  }

  return attendance;
}

function calculateWorkDurationSeconds(checkIn: unknown, checkOut: unknown) {
  const start = normalizeText(checkIn);
  const end = normalizeText(checkOut);

  if (!start || !end) {
    return 0;
  }

  const startMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(start);
  const endMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(end);

  if (!startMatch || !endMatch) {
    return 0;
  }

  const startHour = Number(startMatch[1]);
  const startMinute = Number(startMatch[2]);
  const startSecond = Number(startMatch[3] ?? 0);

  const endHour = Number(endMatch[1]);
  const endMinute = Number(endMatch[2]);
  const endSecond = Number(endMatch[3] ?? 0);

  const startTotal = startHour * 3600 + startMinute * 60 + startSecond;
  const endTotal = endHour * 3600 + endMinute * 60 + endSecond;

  if (!Number.isFinite(startTotal) || !Number.isFinite(endTotal)) {
    return 0;
  }

  if (endTotal < startTotal) {
    return 0;
  }

  return endTotal - startTotal;
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(Number(seconds) || 0, 0);

  if (safeSeconds <= 0) {
    return "-";
  }

  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (hours <= 0) {
    return `${minutes} menit`;
  }

  if (minutes <= 0) {
    return `${hours} jam`;
  }

  return `${hours} jam ${minutes} menit`;
}

function serializeAttendance(attendance: any) {
  const plain = getPlainAttendance(attendance);

  if (!plain) {
    return null;
  }

  const checkIn = plain.checkIn ?? plain.check_in ?? null;
  const checkOut = plain.checkOut ?? plain.check_out ?? null;

  const workDurationSeconds = calculateWorkDurationSeconds(checkIn, checkOut);
  const workDurationMinutes = Math.floor(workDurationSeconds / 60);

  return {
    id: plain.id,
    userId: plain.userId ?? plain.user_id ?? null,
    fullName: plain.fullName ?? plain.full_name ?? "",
    role: plain.role ?? "",
    attendanceDate: plain.attendanceDate ?? plain.attendance_date ?? "",
    checkIn,
    checkOut,
    status: plain.status ?? "hadir",
    location: plain.location ?? "",
    deviceMac: plain.deviceMac ?? plain.device_mac ?? "",
    checkInPhoto: plain.checkInPhoto ?? plain.check_in_photo ?? "",
    checkOutPhoto: plain.checkOutPhoto ?? plain.check_out_photo ?? "",
    note: plain.note ?? "",
    isManual: Boolean(plain.isManual ?? plain.is_manual ?? false),
    createdAt: plain.createdAt ?? plain.created_at ?? null,
    updatedAt: plain.updatedAt ?? plain.updated_at ?? null,
    workDurationSeconds,
    workDurationMinutes,
    workDurationText: formatDuration(workDurationSeconds),

    // Tetap dikirim 0/null agar FE lama tidak error,
    // tapi UI baru tidak perlu menampilkan ini.
    lateMinutes: null,
    pointPenalty: 0,
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (isProtectedDynamicId(id)) {
      return errorResponse(
        "Route absensi tidak valid. Gunakan endpoint khusus yang sesuai.",
        400
      );
    }

    const attendanceId = toNumberOrNull(id);

    if (!attendanceId) {
      return errorResponse("ID absensi tidak valid", 400);
    }

    const attendance = await Attendance.findByPk(attendanceId);

    if (!attendance) {
      return errorResponse("Absensi tidak ditemukan", 404);
    }

    return successResponse({
      message: "Detail absensi berhasil diambil",
      data: serializeAttendance(attendance),
    });
  } catch (error) {
    console.error("GET /api/admin/attendances/[id] ERROR:", error);
    return errorResponse("Gagal mengambil detail absensi", 500);
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (isProtectedDynamicId(id)) {
      return errorResponse(
        "Route absensi tidak valid. Gunakan endpoint khusus yang sesuai.",
        400
      );
    }

    const attendanceId = toNumberOrNull(id);

    if (!attendanceId) {
      return errorResponse("ID absensi tidak valid", 400);
    }

    const body = (await request.json()) as Record<string, unknown>;

    const attendance = await Attendance.findByPk(attendanceId);

    if (!attendance) {
      return errorResponse("Absensi tidak ditemukan", 404);
    }

    const oldAttendance = getPlainAttendance(attendance);

    const userId =
      toNumberOrNull(body.userId ?? body.user_id) ??
      toNumberOrNull(oldAttendance.userId ?? oldAttendance.user_id);

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

    const checkIn = normalizeText(
      body.checkIn ?? body.check_in ?? oldAttendance.checkIn ?? oldAttendance.check_in
    );

    const checkOut = normalizeText(
      body.checkOut ??
        body.check_out ??
        oldAttendance.checkOut ??
        oldAttendance.check_out
    );

    const status = normalizeStatus(body.status ?? oldAttendance.status);

    const location = normalizeText(
      body.location ?? oldAttendance.location ?? null
    );

    const deviceMac = normalizeText(
      body.deviceMac ?? body.device_mac ?? oldAttendance.deviceMac ?? oldAttendance.device_mac
    );

    const checkInPhoto = normalizeText(
      body.checkInPhoto ??
        body.check_in_photo ??
        oldAttendance.checkInPhoto ??
        oldAttendance.check_in_photo
    );

    const checkOutPhoto = normalizeText(
      body.checkOutPhoto ??
        body.check_out_photo ??
        oldAttendance.checkOutPhoto ??
        oldAttendance.check_out_photo
    );

    const note = normalizeText(body.note ?? oldAttendance.note ?? null);

    const isManual =
      body.isManual === undefined && body.is_manual === undefined
        ? Boolean(oldAttendance.isManual ?? oldAttendance.is_manual ?? true)
        : body.isManual === true ||
          body.is_manual === true ||
          String(body.isManual ?? body.is_manual).toLowerCase() === "true";

    if (!fullName) {
      return errorResponse("Nama wajib diisi", 400);
    }

    if (!role) {
      return errorResponse("Role wajib diisi", 400);
    }

    if (!attendanceDate || !isValidDateOnly(attendanceDate)) {
      return errorResponse("Tanggal absensi wajib format YYYY-MM-DD", 400);
    }

    await attendance.update({
      userId,
      fullName,
      role,
      attendanceDate,
      checkIn,
      checkOut,
      status,
      location,
      deviceMac,
      checkInPhoto,
      checkOutPhoto,
      note,
      isManual,

      // Konsep baru: tidak pakai telat, penalty, point.
      lateMinutes: null,
      pointPenalty: 0,
    });

    const updatedAttendance = await Attendance.findByPk(attendanceId);

    return successResponse({
      message: "Absensi berhasil diupdate",
      data: serializeAttendance(updatedAttendance),
    });
  } catch (error) {
    console.error("PUT /api/admin/attendances/[id] ERROR:", error);
    return errorResponse("Gagal update absensi", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (isProtectedDynamicId(id)) {
      return errorResponse(
        "Route absensi tidak valid. Gunakan endpoint khusus yang sesuai.",
        400
      );
    }

    const attendanceId = toNumberOrNull(id);

    if (!attendanceId) {
      return errorResponse("ID absensi tidak valid", 400);
    }

    const attendance = await Attendance.findByPk(attendanceId);

    if (!attendance) {
      return errorResponse("Absensi tidak ditemukan", 404);
    }

    await attendance.destroy();

    return successResponse({
      message: "Absensi berhasil dihapus",
      data: null,
    });
  } catch (error) {
    console.error("DELETE /api/admin/attendances/[id] ERROR:", error);
    return errorResponse("Gagal hapus absensi", 500);
  }
}