import { NextRequest } from "next/server";
import { Attendance, AttendanceSetting } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

type AttendanceSettingRaw = {
  id: number;
  role: string;
  checkInTime: string | null;
  checkOutTime?: string | null;
  lateToleranceMinutes: number;
  penaltyIntervalMinutes: number;
  penaltyPointsPerInterval: number;
  maxLatePenaltyPoints: number;
  absentPenaltyPoints: number;
  isActive: boolean;
  note: string | null;
};

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

function normalizeStatus(value: unknown) {
  return String(value ?? "hadir").trim().toLowerCase();
}

function timeToMinutes(time: string) {
  const cleanTime = time.trim();

  if (!/^\d{2}:\d{2}$/.test(cleanTime)) {
    return null;
  }

  const [hour, minute] = cleanTime.split(":").map(Number);

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

  return hour * 60 + minute;
}

function isAbsentStatus(status: string) {
  const cleanStatus = status.trim().toLowerCase();

  return (
    cleanStatus === "alpha" ||
    cleanStatus === "absen" ||
    cleanStatus === "tidak_masuk" ||
    cleanStatus === "tidak masuk"
  );
}

function isLateStatus(status: string) {
  const cleanStatus = status.trim().toLowerCase();

  return cleanStatus === "telat" || cleanStatus === "terlambat";
}

function isFreeStatus(status: string) {
  const cleanStatus = status.trim().toLowerCase();

  return (
    cleanStatus === "izin" ||
    cleanStatus === "sakit" ||
    cleanStatus === "pulang"
  );
}

async function getAttendanceSetting(role: string) {
  const setting = (await AttendanceSetting.findOne({
    where: {
      role,
      isActive: true,
    },
    raw: true,
  })) as AttendanceSettingRaw | null;

  return setting;
}

function calculatePenalty(params: {
  lateMinutes: number;
  penaltyIntervalMinutes: number;
  penaltyPointsPerInterval: number;
  maxLatePenaltyPoints: number;
}) {
  const lateMinutes = Math.max(params.lateMinutes, 0);

  if (lateMinutes <= 0) {
    return 0;
  }

  const penaltyIntervalMinutes = Math.max(
    Number(params.penaltyIntervalMinutes ?? 60),
    1
  );

  const penaltyPointsPerInterval = Math.max(
    Number(params.penaltyPointsPerInterval ?? 1),
    0
  );

  const maxLatePenaltyPoints = Math.max(
    Number(params.maxLatePenaltyPoints ?? 8),
    0
  );

  const intervalCount = Math.ceil(lateMinutes / penaltyIntervalMinutes);

  const rawPenaltyPoints = intervalCount * penaltyPointsPerInterval;

  const cappedPenaltyPoints = Math.min(
    rawPenaltyPoints,
    maxLatePenaltyPoints
  );

  return -Math.abs(cappedPenaltyPoints);
}

async function resolveAttendanceResult(params: {
  role: string;
  checkIn: string | null;
  inputStatus: string;
}) {
  const { role, checkIn } = params;
  const inputStatus = normalizeStatus(params.inputStatus);

  const setting = await getAttendanceSetting(role);

  if (!setting) {
    return {
      status: inputStatus,
      lateMinutes: null,
      pointPenalty: 0,
    };
  }

  if (isAbsentStatus(inputStatus)) {
    const absentPenaltyPoints = Number(setting.absentPenaltyPoints ?? 8);

    return {
      status: "alpha",
      lateMinutes: null,
      pointPenalty: -Math.abs(absentPenaltyPoints),
    };
  }

  if (isFreeStatus(inputStatus)) {
    return {
      status: inputStatus,
      lateMinutes: 0,
      pointPenalty: 0,
    };
  }

  if (!checkIn || !setting.checkInTime) {
    return {
      status: inputStatus,
      lateMinutes: null,
      pointPenalty: 0,
    };
  }

  const expectedMinutes = timeToMinutes(setting.checkInTime);
  const actualMinutes = timeToMinutes(checkIn);

  if (expectedMinutes === null || actualMinutes === null) {
    return {
      status: inputStatus,
      lateMinutes: null,
      pointPenalty: 0,
    };
  }

  const rawLateMinutes = actualMinutes - expectedMinutes;
  const lateMinutes = rawLateMinutes > 0 ? rawLateMinutes : 0;

  const lateToleranceMinutes = Number(setting.lateToleranceMinutes ?? 0);
  const isLateByRule = actualMinutes > expectedMinutes + lateToleranceMinutes;

  /*
    Alur:
    1. Kalau admin pilih TELAT:
       - Tetap hitung menit telat dari jam masuk aturan.
       - Walaupun masih dalam toleransi, lateMinutes tetap tampil.
    2. Kalau admin pilih HADIR:
       - Sistem cek otomatis. Kalau lewat toleransi, status jadi TELAT.
       - Kalau belum lewat toleransi, tetap HADIR.
  */

  if (isLateStatus(inputStatus)) {
    const pointPenalty = calculatePenalty({
      lateMinutes,
      penaltyIntervalMinutes: setting.penaltyIntervalMinutes,
      penaltyPointsPerInterval: setting.penaltyPointsPerInterval,
      maxLatePenaltyPoints: setting.maxLatePenaltyPoints,
    });

    return {
      status: "telat",
      lateMinutes,
      pointPenalty,
    };
  }

  if (!isLateByRule) {
    return {
      status: "hadir",
      lateMinutes: 0,
      pointPenalty: 0,
    };
  }

  const pointPenalty = calculatePenalty({
    lateMinutes,
    penaltyIntervalMinutes: setting.penaltyIntervalMinutes,
    penaltyPointsPerInterval: setting.penaltyPointsPerInterval,
    maxLatePenaltyPoints: setting.maxLatePenaltyPoints,
  });

  return {
    status: "telat",
    lateMinutes,
    pointPenalty,
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const role = searchParams.get("role");
    const status = searchParams.get("status");
    const date = searchParams.get("date");

    const where: Record<string, unknown> = {};

    if (role) {
      where.role = role.toLowerCase();
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
    const inputStatus = normalizeStatus(body.status);
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

    const attendanceResult = await resolveAttendanceResult({
      role,
      checkIn,
      inputStatus,
    });

    const attendance = await Attendance.create({
      userId,
      fullName,
      role,
      attendanceDate,
      checkIn,
      checkOut,
      status: attendanceResult.status,
      lateMinutes: attendanceResult.lateMinutes,
      pointPenalty: attendanceResult.pointPenalty,
      location,
      deviceMac,
      note,
      isManual,
    });

    return successResponse({
      message:
        attendanceResult.status === "telat"
          ? "Absensi berhasil dibuat, telat dan point sudah dihitung"
          : "Absensi berhasil dibuat",
      data: attendance,
    });
  } catch (error) {
    console.error("CREATE ATTENDANCE ERROR:", error);

    return errorResponse("Gagal membuat absensi", 500);
  }
}