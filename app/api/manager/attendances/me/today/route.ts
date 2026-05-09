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

function toNumberOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const userId = toNumberOrNull(searchParams.get("userId"));
    const role = String(searchParams.get("role") ?? "").trim().toLowerCase();
    const date = searchParams.get("date") || getJakartaDateString();

    if (!userId && !role) {
      return errorResponse("User atau role wajib dikirim", 400);
    }

    const where: Record<string, unknown> = {
      attendanceDate: date,
    };

    if (userId) {
      where.userId = userId;
    } else if (role) {
      where.role = role;
    }

    const attendance = await Attendance.findOne({
      where,
      order: [["createdAt", "DESC"]],
    });

    return successResponse({
      message: attendance
        ? "Absensi hari ini ditemukan"
        : "Belum ada absensi hari ini",
      data: attendance,
    });
  } catch (error) {
    console.error("GET MANAGER MY TODAY ATTENDANCE ERROR:", error);
    return errorResponse("Gagal mengambil absensi hari ini", 500);
  }
}
