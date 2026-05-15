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
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

  // Aman kalau nanti ada shift lewat tengah malam
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

function serializeAttendance(attendance: any) {
  if (!attendance) return null;

  const plain =
    typeof attendance.get === "function"
      ? attendance.get({ plain: true })
      : attendance;

  const workDurationSeconds = calculateWorkDurationSeconds(
    plain.checkIn,
    plain.checkOut
  );

  const workDurationMinutes = Math.floor(workDurationSeconds / 60);

  return {
    ...plain,
    lateMinutes: plain.lateMinutes ?? 0,
    pointPenalty: 0,
    workDurationSeconds,
    workDurationMinutes,
    workDurationText: formatWorkDuration(workDurationSeconds),
  };
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
      data: serializeAttendance(attendance),
    });
  } catch (error) {
    console.error("GET MY TODAY ATTENDANCE ERROR:", error);
    return errorResponse("Gagal mengambil absensi hari ini", 500);
  }
}