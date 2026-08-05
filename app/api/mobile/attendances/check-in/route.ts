import { NextRequest } from "next/server";
import { Op } from "sequelize";
import { Attendance, AttendanceSetting, Membership, User, PointHistory, MembershipPlan } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

type AttendanceSettingRaw = {
  id: number;
  role: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  officeLatitude?: number | null;
  officeLongitude?: number | null;
  allowedRadiusMeters?: number | null;
  isActive: boolean;
};

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

function getJakartaMinutesNow() {
  const time = getJakartaTimeString();
  const [hour, minute] = time.slice(0, 5).split(":").map(Number);

  return hour * 60 + minute;
}

function timeToMinutes(value: string | null | undefined) {
  if (!value) return null;

  const clean = String(value).trim().slice(0, 5);

  if (!/^\d{2}:\d{2}$/.test(clean)) return null;

  const [hour, minute] = clean.split(":").map(Number);

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

function toNumberOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizePhoto(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text ? text : null;
}

function getRequiredCheckInPhoto(body: Record<string, unknown>) {
  return normalizePhoto(
    body.checkInPhoto ??
      body.check_in_photo ??
      body.photoUrl ??
      body.photo_url ??
      body.photoBase64 ??
      body.photo_base64 ??
      body.photo
  );
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function calculateDistanceMeters(params: {
  fromLatitude: number;
  fromLongitude: number;
  toLatitude: number;
  toLongitude: number;
}) {
  const earthRadiusMeters = 6371000;
  const fromLatRad = toRadians(params.fromLatitude);
  const toLatRad = toRadians(params.toLatitude);
  const deltaLatRad = toRadians(params.toLatitude - params.fromLatitude);
  const deltaLonRad = toRadians(params.toLongitude - params.fromLongitude);

  const a =
    Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
    Math.cos(fromLatRad) *
      Math.cos(toLatRad) *
      Math.sin(deltaLonRad / 2) *
      Math.sin(deltaLonRad / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}

async function getAttendanceSetting(role: string) {
  const normalizedRole = String(role ?? "").trim().toLowerCase();

  const exact = (await AttendanceSetting.findOne({
    where: {
      role: normalizedRole,
    },
    raw: true,
  })) as AttendanceSettingRaw | null;

  if (exact) return exact;

  const fallbackAll = (await AttendanceSetting.findOne({
    where: {
      role: {
        [Op.in]: ["all", "semua", "semua_role"],
      },
    },
    raw: true,
  })) as AttendanceSettingRaw | null;

  return fallbackAll;
}

function validateCheckInTime(setting: AttendanceSettingRaw | null) {
  if (!setting) {
    return {
      ok: true,
      message: null,
    };
  }

  const checkInMinutes = timeToMinutes(setting.checkInTime);
  const checkOutMinutes = timeToMinutes(setting.checkOutTime);

  const nowMinutes = getJakartaMinutesNow();

  if (checkInMinutes !== null) {
    const openAt = checkInMinutes - 10;

    if (nowMinutes < openAt) {
      return {
        ok: false,
        message: `Absen masuk belum dibuka. Tombol aktif mulai 10 menit sebelum jam ${setting.checkInTime?.slice(
          0,
          5
        )}.`,
      };
    }
  }

  if (checkOutMinutes !== null && nowMinutes >= checkOutMinutes) {
    return {
      ok: false,
      message:
        "Jam absen masuk sudah lewat. Kalau ada kendala, hubungi manager.",
    };
  }

  return {
    ok: true,
    message: null,
  };
}

function validateDistance(params: {
  userLatitude: number | null;
  userLongitude: number | null;
  setting: AttendanceSettingRaw | null;
}) {
  const { userLatitude, userLongitude, setting } = params;

  if (!setting) {
    return {
      ok: true,
      distanceMeters: null,
      allowedRadiusMeters: null,
      message: null,
    };
  }

  if (setting.isActive !== true) {
    return {
      ok: true,
      distanceMeters: null,
      allowedRadiusMeters: setting.allowedRadiusMeters ?? 100,
      message: null,
    };
  }

  const officeLatitude = toNumberOrNull(setting.officeLatitude);
  const officeLongitude = toNumberOrNull(setting.officeLongitude);
  const allowedRadiusMeters = Math.max(
    Number(setting.allowedRadiusMeters ?? 100),
    1
  );

  const geofenceIsEnabled =
    officeLatitude !== null && officeLongitude !== null;

  if (!geofenceIsEnabled) {
    return {
      ok: true,
      distanceMeters: null,
      allowedRadiusMeters,
      message: null,
    };
  }

  if (userLatitude === null || userLongitude === null) {
    return {
      ok: false,
      distanceMeters: null,
      allowedRadiusMeters,
      message:
        "Lokasi kamu belum terbaca. Aktifkan GPS/lokasi dulu supaya bisa absen masuk.",
    };
  }

  const distanceMeters = Math.round(
    calculateDistanceMeters({
      fromLatitude: officeLatitude,
      fromLongitude: officeLongitude,
      toLatitude: userLatitude,
      toLongitude: userLongitude,
    })
  );

  if (distanceMeters > allowedRadiusMeters) {
    return {
      ok: false,
      distanceMeters,
      allowedRadiusMeters,
      message: `Kamu terlalu jauh dari lokasi kantor. Jarak kamu sekitar ${distanceMeters} meter, batas maksimal ${allowedRadiusMeters} meter.`,
    };
  }

  return {
    ok: true,
    distanceMeters,
    allowedRadiusMeters,
    message: null,
  };
}

function serializeAttendance(attendance: any) {
  if (!attendance) return null;

  const plain =
    typeof attendance.get === "function"
      ? attendance.get({ plain: true })
      : attendance;

  return {
    ...plain,
    workDurationMinutes: 0,
    workDurationText: "-",
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    const userId = toNumberOrNull(body.userId ?? body.user_id);
    const fullName = String(
      body.fullName ?? body.full_name ?? body.name ?? ""
    ).trim();
    const role = String(body.role ?? "").trim().toLowerCase();

    const userLatitude = toNumberOrNull(body.latitude ?? body.lat);
    const userLongitude = toNumberOrNull(
      body.longitude ?? body.lng ?? body.long
    );

    const location = body.location ? String(body.location).trim() : null;

    const deviceMac = body.deviceMac
      ? String(body.deviceMac).trim()
      : body.device_mac
        ? String(body.device_mac).trim()
        : null;

    const checkInPhoto = getRequiredCheckInPhoto(body);
    const note = body.note ? String(body.note).trim() : null;

    if (!userId) {
      return errorResponse("User belum dikenali. Silakan login ulang.", 400);
    }

    if (!fullName) {
      return errorResponse("Nama user tidak ditemukan", 400);
    }

    if (!role) {
      return errorResponse("Role user tidak ditemukan", 400);
    }

    if (!checkInPhoto) {
      return errorResponse("Foto absen masuk wajib dikirim.", 400);
    }

    // Key Security Check: Members must have an active paid membership
    const isEmployee = ["trainer", "karyawan", "admin", "manager"].includes(role);
    if (!isEmployee) {
      const activeMem = await Membership.findOne({
        where: {
          userId,
          paymentStatus: "paid",
          memberStatus: {
            [Op.in]: ["active", "pending"],
          },
        },
      });

      if (!activeMem) {
        return errorResponse(
          "Kamu belum memiliki paket membership aktif yang sudah dibayar.",
          403
        );
      }

      if (activeMem.planId) {
        const plan = await MembershipPlan.findByPk(activeMem.planId);
        if (plan) {
          const totalSessions = Number(plan.dataValues.personalTrainerSessions ?? (plan.dataValues as any).personal_trainer_sessions ?? 0) +
                                Number(plan.dataValues.pilatesSessions ?? (plan.dataValues as any).pilates_sessions ?? 0);
          if (totalSessions > 0) {
            const attendanceCount = await Attendance.count({
              where: {
                userId,
                createdAt: {
                  [Op.gte]: activeMem.startedAt || activeMem.createdAt,
                },
              },
            });

            if (attendanceCount >= totalSessions) {
              return errorResponse(
                `Check-in ditolak! Sisa sesi pertemuan kamu sudah habis (0/${totalSessions} sesi). Silakan beli paket baru.`,
                403
              );
            }
          }
        }
      }

      // Key Security Check 2: Check if class shift time has ended (CLOSED)
      let classEndTime: string | null =
        body.classEndTime || body.endTime
          ? String(body.classEndTime || body.endTime)
          : null;

      if (!classEndTime && note) {
        const match = note.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
        if (match) {
          classEndTime = match[2];
        }
      }

      if (classEndTime) {
        const endMinutes = timeToMinutes(classEndTime);
        const nowMinutes = getJakartaMinutesNow();

        if (endMinutes !== null && nowMinutes > endMinutes + 15) {
          return errorResponse(
            `Check-in ditolak! Sesi kelas ini (selesai jam ${classEndTime.slice(0, 5)}) sudah berakhir (CLOSED). Kamu tidak bisa lagi check-in untuk sesi yang sudah lewat.`,
            400
          );
        }
      }
    }

    const today = getJakartaDateString();
    const nowTime = getJakartaTimeString();

    const existingAttendance = await Attendance.findOne({
      where: {
        userId,
        attendanceDate: today,
      },
    });

    if (existingAttendance) {
      return errorResponse("Kamu sudah absen masuk hari ini.", 409);
    }

    const setting = await getAttendanceSetting(role);

    const timeResult = validateCheckInTime(setting);

    if (!timeResult.ok) {
      return errorResponse(timeResult.message ?? "Jam absen belum sesuai", 400);
    }

    const distanceResult = validateDistance({
      userLatitude,
      userLongitude,
      setting,
    });

    if (!distanceResult.ok) {
      return errorResponse(distanceResult.message ?? "Lokasi tidak valid", 400);
    }

    const locationText =
      userLatitude !== null && userLongitude !== null
        ? `${location ?? "Lokasi user"} (${userLatitude}, ${userLongitude})${
            distanceResult.distanceMeters !== null
              ? ` - jarak ${distanceResult.distanceMeters}m`
              : ""
          }`
        : location;

    const attendance = await Attendance.create({
      userId,
      fullName,
      role,
      attendanceDate: today,
      checkIn: nowTime,
      checkOut: null,
      status: "hadir",
      lateMinutes: 0,
      pointPenalty: 0,
      location: locationText,
      deviceMac,
      checkInPhoto,
      checkOutPhoto: null,
      note,
      isManual: false,
    });

    // Reward +1 point to assigned PT if this check-in is for a PT/Class session
    try {
      let targetPtName: string | null = (typeof (body as any).ptName === "string" ? (body as any).ptName : typeof (body as any).assignedPtName === "string" ? (body as any).assignedPtName : null);
      let classTitle: string = typeof (body as any).classTitle === "string" ? (body as any).classTitle : "Kelas Gym";

      if (!targetPtName && note) {
        const ptMatch = note.match(/PT:\s*([^•\n]+)/);
        if (ptMatch) {
          targetPtName = ptMatch[1].trim();
        }
        const classMatch = note.match(/Kelas:\s*([^•\n]+)/);
        if (classMatch) {
          classTitle = classMatch[1].trim();
        }
      }

      if (targetPtName && targetPtName !== "Coach Duty") {
        const ptUser = await User.findOne({
          where: {
            name: targetPtName,
          },
        });

        if (ptUser) {
          await User.increment("points", { by: 1, where: { id: ptUser.id } });

          await PointHistory.create({
            userId: ptUser.id,
            relatedUserId: userId,
            amount: 1,
            transactionType: "MEMBER_ATTENDANCE",
            description: `Member ${fullName || "Member"} (ID: ${userId}) absen di kelas "${classTitle}" bersama PT ${ptUser.name}`,
          });
        }
      }
    } catch (ptError) {
      console.error("Failed to add PT point for check-in:", ptError);
    }

    return successResponse({
      message:
        "Absen masuk berhasil. Jangan lupa absen keluar setelah selesai kerja.",
      data: serializeAttendance(attendance),
    });
  } catch (error) {
    console.error("CHECK IN ERROR:", error);

    return errorResponse(
      "Terjadi kesalahan saat absen masuk. Coba lagi sebentar ya.",
      500
    );
  }
}