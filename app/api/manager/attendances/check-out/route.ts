import { NextRequest } from "next/server";

import { Attendance } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

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
  if (value === undefined || value === null || value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const userId = toNumberOrNull(body.userId ?? body.user_id);
    const role = String(body.role ?? "manager").trim().toLowerCase();
    const attendanceDate = String(
      body.attendanceDate ?? body.attendance_date ?? getJakartaDateString(),
    ).trim();

    const checkOut = String(
      body.checkOut ?? body.check_out ?? getJakartaTimeString(),
    ).trim();

    const location = body.location ? String(body.location).trim() : null;
    const deviceMac = body.deviceMac ? String(body.deviceMac).trim() : null;
    const note = body.note ? String(body.note).trim() : undefined;

    const checkOutPhoto =
      body.checkOutPhoto ?? body.check_out_photo
        ? String(body.checkOutPhoto ?? body.check_out_photo).trim()
        : null;

    if (!userId && !role) {
      return errorResponse("User atau role wajib dikirim", 400);
    }

    const where: Record<string, unknown> = {
      attendanceDate,
    };

    if (userId) {
      where.userId = userId;
    } else {
      where.role = role;
    }

    const attendance = await Attendance.findOne({
      where,
      order: [["createdAt", "DESC"]],
    });

    if (!attendance) {
      return errorResponse("Kamu belum absen masuk hari ini.", 404);
    }

    if (attendance.get("checkOut")) {
      return errorResponse("Kamu sudah absen keluar hari ini.", 409);
    }

    await attendance.update({
      checkOut,
      ...(location !== null && { location }),
      ...(deviceMac !== null && { deviceMac }),
      ...(checkOutPhoto !== null && { checkOutPhoto }),
      ...(note !== undefined && { note }),
    });

    const updatedAttendance = await Attendance.findByPk(attendance.get("id"));

    return successResponse({
      message: "Absen keluar berhasil",
      data: updatedAttendance,
    });
  } catch (error) {
    console.error("MANAGER CHECK OUT ERROR:", error);
    return errorResponse("Gagal absen keluar", 500);
  }
}
