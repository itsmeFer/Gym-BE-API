import { NextRequest } from "next/server";
import { AttendanceSetting } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

function toNumber(value: unknown, defaultValue = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

function toNumberOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeTime(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const text = String(value).trim();

  if (!/^\d{2}:\d{2}$/.test(text)) {
    return null;
  }

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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const setting = await AttendanceSetting.findByPk(id);

    if (!setting) {
      return errorResponse("Setting absensi tidak ditemukan", 404);
    }

    return successResponse({
      message: "Detail setting absensi berhasil diambil",
      data: setting,
    });
  } catch (error) {
    console.error("GET ATTENDANCE SETTING DETAIL ERROR:", error);

    return errorResponse("Gagal mengambil detail setting absensi", 500);
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const setting = await AttendanceSetting.findByPk(id);

    if (!setting) {
      return errorResponse("Setting absensi tidak ditemukan", 404);
    }

    const role =
      body.role !== undefined
        ? String(body.role).trim().toLowerCase()
        : undefined;

    const checkInTime =
      body.checkInTime !== undefined
        ? normalizeTime(body.checkInTime)
        : undefined;

    const checkOutTime =
      body.checkOutTime !== undefined
        ? normalizeTime(body.checkOutTime)
        : undefined;

    const officeLatitude =
      body.officeLatitude !== undefined || body.office_latitude !== undefined
        ? toNumberOrNull(body.officeLatitude ?? body.office_latitude)
        : undefined;

    const officeLongitude =
      body.officeLongitude !== undefined || body.office_longitude !== undefined
        ? toNumberOrNull(body.officeLongitude ?? body.office_longitude)
        : undefined;

    const allowedRadiusMeters =
      body.allowedRadiusMeters !== undefined ||
      body.allowed_radius_meters !== undefined
        ? Math.max(
            toNumber(
              body.allowedRadiusMeters ?? body.allowed_radius_meters,
              100
            ),
            1
          )
        : undefined;

    const lateToleranceMinutes =
      body.lateToleranceMinutes !== undefined
        ? toNumber(body.lateToleranceMinutes, 0)
        : undefined;

    const penaltyIntervalMinutes =
      body.penaltyIntervalMinutes !== undefined
        ? toNumber(body.penaltyIntervalMinutes, 60)
        : undefined;

    const penaltyPointsPerInterval =
      body.penaltyPointsPerInterval !== undefined
        ? toNumber(body.penaltyPointsPerInterval, 1)
        : undefined;

    const maxLatePenaltyPoints =
      body.maxLatePenaltyPoints !== undefined
        ? toNumber(body.maxLatePenaltyPoints, 8)
        : undefined;

    const absentPenaltyPoints =
      body.absentPenaltyPoints !== undefined
        ? toNumber(body.absentPenaltyPoints, 8)
        : undefined;

    const isActive =
      body.isActive !== undefined && typeof body.isActive === "boolean"
        ? body.isActive
        : undefined;

    const note =
      body.note !== undefined ? String(body.note).trim() : undefined;

    if (role !== undefined && !role) {
      return errorResponse("Role wajib diisi", 400);
    }

    if (
      officeLatitude !== undefined &&
      officeLatitude !== null &&
      (officeLatitude < -90 || officeLatitude > 90)
    ) {
      return errorResponse("Latitude kantor tidak valid", 400);
    }

    if (
      officeLongitude !== undefined &&
      officeLongitude !== null &&
      (officeLongitude < -180 || officeLongitude > 180)
    ) {
      return errorResponse("Longitude kantor tidak valid", 400);
    }

    await setting.update({
      ...(role !== undefined && { role }),
      ...(checkInTime !== undefined && { checkInTime }),
      ...(checkOutTime !== undefined && { checkOutTime }),
      ...(officeLatitude !== undefined && { officeLatitude }),
      ...(officeLongitude !== undefined && { officeLongitude }),
      ...(allowedRadiusMeters !== undefined && { allowedRadiusMeters }),
      ...(lateToleranceMinutes !== undefined && { lateToleranceMinutes }),
      ...(penaltyIntervalMinutes !== undefined && {
        penaltyIntervalMinutes,
      }),
      ...(penaltyPointsPerInterval !== undefined && {
        penaltyPointsPerInterval,
      }),
      ...(maxLatePenaltyPoints !== undefined && {
        maxLatePenaltyPoints,
      }),
      ...(absentPenaltyPoints !== undefined && {
        absentPenaltyPoints,
      }),
      ...(isActive !== undefined && { isActive }),
      ...(note !== undefined && { note }),
    });

    const updatedSetting = await AttendanceSetting.findByPk(id);

    return successResponse({
      message: "Setting absensi berhasil diupdate",
      data: updatedSetting,
    });
  } catch (error) {
    console.error("UPDATE ATTENDANCE SETTING ERROR:", error);

    return errorResponse("Gagal update setting absensi", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const setting = await AttendanceSetting.findByPk(id);

    if (!setting) {
      return errorResponse("Setting absensi tidak ditemukan", 404);
    }

    await setting.destroy();

    return successResponse({
      message: "Setting absensi berhasil dihapus",
      data: null,
    });
  } catch (error) {
    console.error("DELETE ATTENDANCE SETTING ERROR:", error);

    return errorResponse("Gagal hapus setting absensi", 500);
  }
}