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
      data: attendance,
    });
  } catch (error) {
    console.error("GET ATTENDANCE DETAIL ERROR:", error);

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

    const userId =
      body.userId !== undefined ? toNumberOrNull(body.userId) : undefined;

    const fullName =
      body.fullName !== undefined
        ? String(body.fullName).trim()
        : undefined;

    const role =
      body.role !== undefined
        ? String(body.role).trim().toLowerCase()
        : undefined;

    const attendanceDate =
      body.attendanceDate !== undefined
        ? String(body.attendanceDate).trim()
        : undefined;

    const checkIn =
      body.checkIn !== undefined ? String(body.checkIn).trim() : undefined;

    const checkOut =
      body.checkOut !== undefined ? String(body.checkOut).trim() : undefined;

    const status =
      body.status !== undefined ? String(body.status).trim() : undefined;

    const location =
      body.location !== undefined ? String(body.location).trim() : undefined;

    const deviceMac =
      body.deviceMac !== undefined ? String(body.deviceMac).trim() : undefined;

    const note =
      body.note !== undefined ? String(body.note).trim() : undefined;

    const isManual =
      body.isManual !== undefined && typeof body.isManual === "boolean"
        ? body.isManual
        : undefined;

    if (fullName !== undefined && !fullName) {
      return errorResponse("Nama wajib diisi", 400);
    }

    if (role !== undefined && !role) {
      return errorResponse("Role wajib diisi", 400);
    }

    await attendance.update({
      ...(userId !== undefined && { userId }),
      ...(fullName !== undefined && { fullName }),
      ...(role !== undefined && { role }),
      ...(attendanceDate !== undefined && { attendanceDate }),
      ...(checkIn !== undefined && { checkIn }),
      ...(checkOut !== undefined && { checkOut }),
      ...(status !== undefined && { status }),
      ...(location !== undefined && { location }),
      ...(deviceMac !== undefined && { deviceMac }),
      ...(note !== undefined && { note }),
      ...(isManual !== undefined && { isManual }),
    });

    return successResponse({
      message: "Absensi berhasil diupdate",
      data: attendance,
    });
  } catch (error) {
    console.error("UPDATE ATTENDANCE ERROR:", error);

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
    console.error("DELETE ATTENDANCE ERROR:", error);

    return errorResponse("Gagal hapus absensi", 500);
  }
}