import { NextRequest } from "next/server";
import { Membership } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

// In-memory store for user class bookings
const inMemoryBookings: Map<number, any[]> = new Map();

export async function GET(request: NextRequest) {
  try {
    const userId = Number(request.nextUrl.searchParams.get("userId"));
    if (!userId) {
      return errorResponse("User ID wajib diisi", 400);
    }

    const bookings = inMemoryBookings.get(userId) || [];

    return successResponse({
      message: "Data booking kelas berhasil diambil",
      data: bookings,
    });
  } catch (error) {
    console.error("GET USER CLASS BOOKINGS ERROR:", error);
    return errorResponse("Gagal mengambil data booking", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, classId, className, ptName, date, time } = body;

    if (!userId || !classId || !date) {
      return errorResponse("User ID, Class ID, dan Tanggal wajib diisi", 400);
    }

    // 1. Validate Active Membership Status from Database
    const membership = await Membership.findOne({
      where: { userId, paymentStatus: "paid", memberStatus: "active" },
    });

    if (!membership) {
      return errorResponse(
        "Kamu tidak memiliki paket membership aktif yang lunas.",
        400,
      );
    }

    const now = new Date();
    const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const startedAt = membership.startedAt ? new Date(membership.startedAt) : null;
    const expiredAt = membership.expiredAt ? new Date(membership.expiredAt) : null;

    if (!startedAt || !expiredAt) {
      return errorResponse(
        "Tanggal mulai membership kamu belum diatur. Silakan pilih tanggal mulai terlebih dahulu.",
        400,
      );
    }

    const startOnly = new Date(startedAt.getFullYear(), startedAt.getMonth(), startedAt.getDate());
    const expiredOnly = new Date(expiredAt.getFullYear(), expiredAt.getMonth(), expiredAt.getDate());

    if (startOnly > todayOnly) {
      return errorResponse(
        "Membership kamu belum mulai. Belum dapat melakukan booking kelas.",
        400,
      );
    }

    if (todayOnly > expiredOnly) {
      return errorResponse(
        "Masa aktif membership kamu sudah habis (Expired).",
        400,
      );
    }

    // 2. Validate 1-Class-Per-Day Limit
    const userBookings = inMemoryBookings.get(userId) || [];
    const existingSameDayBooking = userBookings.find((b) => b.date === date);

    if (existingSameDayBooking) {
      return errorResponse(
        `Kamu sudah terdaftar di kelas "${existingSameDayBooking.className}" pada hari yang sama (${date}). Maksimal 1 kelas per hari!`,
        400,
      );
    }

    // 3. Save Booking
    const newBooking = {
      id: `bk-${Date.now()}`,
      userId,
      classId,
      className: className || "Gym Class",
      ptName: ptName || "Coach Duty",
      date,
      time: time || "07:00",
      bookedAt: new Date().toISOString(),
    };

    userBookings.push(newBooking);
    inMemoryBookings.set(userId, userBookings);

    return successResponse({
      message: `Berhasil mendaftar kelas ${className} dengan ${ptName} pada tanggal ${date}!`,
      data: newBooking,
    });
  } catch (error) {
    console.error("POST USER CLASS BOOKING ERROR:", error);
    return errorResponse("Gagal melakukan booking kelas", 500);
  }
}
