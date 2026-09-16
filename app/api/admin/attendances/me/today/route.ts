import { NextRequest } from "next/server";
import { Attendance } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { requireFeature } from "@/lib/feature-permission";

/**
 * Format tanggal hari ini di timezone Jakarta (YYYY-MM-DD)
 */
function getJakartaDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Convert ke number atau null jika invalid
 */
function toNumberOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * GET /api/admin/attendances/me/today
 * Ambil absensi hari ini berdasarkan userId atau role
 */
export async function GET(request: NextRequest) {
  try {

    const auth = await requireFeature(request, "admin.absensi", ["admin"]);
    if (!auth.success) {
      return errorResponse(auth.message, auth.statusCode);
    }
    const searchParams = request.nextUrl.searchParams;

    // Ambil parameter query
    const userId = toNumberOrNull(searchParams.get("userId"));
    const role = String(searchParams.get("role") ?? "").trim().toLowerCase();
    const date = searchParams.get("date") || getJakartaDateString();

    // Validasi wajib minimal userId atau role
    if (!userId && !role) {
      return errorResponse("User atau role wajib dikirim", 400);
    }

    // Buat kondisi where untuk query
    const where: Record<string, unknown> = {
      attendanceDate: date,
    };

    if (userId) {
      where.userId = userId;
    } else if (role) {
      where.role = role;
    }

    // Cari absensi hari ini (latest)
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
    console.error("GET MY TODAY ATTENDANCE ERROR:", error);

    return errorResponse("Gagal mengambil absensi hari ini", 500);
  }
}