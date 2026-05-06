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

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const role = searchParams.get("role");
    const status = searchParams.get("status");
    const date = searchParams.get("date");

    const where: Record<string, unknown> = {};

    if (role) {
      where.role = role;
    }

    if (status) {
      where.status = status;
    }

    if (date) {
      where.attendanceDate = date;
    }

    const attendances = await Attendance.findAll({
      where,
      order: [
        ["attendanceDate", "DESC"],
        ["createdAt", "DESC"],
      ],
    });

    return successResponse({
      message: "Data absensi berhasil diambil",
      data: attendances,
    });
  } catch (error) {
    console.error("GET ATTENDANCES ERROR:", error);

    return errorResponse("Gagal mengambil data absensi", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const userId = toNumberOrNull(body.userId);
    const fullName = String(body.fullName ?? "").trim();
    const role = String(body.role ?? "").trim().toLowerCase();

    const attendanceDate = body.attendanceDate
      ? String(body.attendanceDate).trim()
      : todayDate();

    const checkIn = body.checkIn ? String(body.checkIn).trim() : null;
    const checkOut = body.checkOut ? String(body.checkOut).trim() : null;
    const status = body.status ? String(body.status).trim() : "hadir";
    const location = body.location ? String(body.location).trim() : null;
    const deviceMac = body.deviceMac ? String(body.deviceMac).trim() : null;
    const note = body.note ? String(body.note).trim() : null;

    const isManual =
      typeof body.isManual === "boolean" ? body.isManual : true;

    if (!fullName) {
      return errorResponse("Nama wajib diisi", 400);
    }

    if (!role) {
      return errorResponse("Role wajib diisi", 400);
    }

    if (!attendanceDate) {
      return errorResponse("Tanggal absensi wajib diisi", 400);
    }

    const attendance = await Attendance.create({
      userId,
      fullName,
      role,
      attendanceDate,
      checkIn,
      checkOut,
      status,
      location,
      deviceMac,
      note,
      isManual,
    });

    return successResponse({
      message: "Absensi berhasil dibuat",
      data: attendance,
    });
  } catch (error) {
    console.error("CREATE ATTENDANCE ERROR:", error);

    return errorResponse("Gagal membuat absensi", 500);
  }
}