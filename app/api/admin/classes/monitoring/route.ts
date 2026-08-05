import { NextRequest } from "next/server";
import { Op } from "sequelize";
import {
  MembershipPlan,
  MembershipPlanSchedule,
  User,
  Attendance,
  PointHistory,
} from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { initializeClassesFromPlans } from "@/lib/classes-store";

function getJakartaDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const startDate = searchParams.get("startDate") || searchParams.get("date") || getJakartaDateString();
    const endDate = searchParams.get("endDate") || searchParams.get("date") || getJakartaDateString();

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return errorResponse("Format tanggal harus YYYY-MM-DD", 400);
    }

    // 1. Initialize and get all classes/schedules
    const classes = await initializeClassesFromPlans();

    // 2. Fetch all user (member) attendances in the date range
    const attendances = await Attendance.findAll({
      where: {
        attendanceDate: {
          [Op.between]: [startDate, endDate],
        },
        role: {
          [Op.notIn]: ["trainer", "karyawan", "admin", "manager"],
        },
      },
      order: [["createdAt", "ASC"]],
    });

    // 3. Fetch point histories for PT points calculation in the date range
    const startOfDay = new Date(`${startDate}T00:00:00+07:00`);
    const endOfDay = new Date(`${endDate}T23:59:59+07:00`);
    const pointHistories = await PointHistory.findAll({
      where: {
        transactionType: "MEMBER_ATTENDANCE",
        createdAt: {
          [Op.between]: [startOfDay, endOfDay],
        },
      },
    });

    // 4. Fetch user details for members to get avatar and details
    const userIds = [
      ...new Set(attendances.map((a) => a.userId).filter(Boolean)),
    ] as number[];

    const users = await User.findAll({
      where: { id: userIds },
      attributes: ["id", "name", "email", "phone", "photoUrl", "role"],
    });

    const userMap = new Map(users.map((u) => [u.id, u.toJSON()]));

    // Helper to match attendance with class
    const isAttendanceForClass = (attendance: any, cls: any) => {
      if (!attendance.note) return false;
      const noteStr = String(attendance.note);

      const titleMatch = noteStr.includes(cls.title);
      const timeSegment = `${cls.time} - ${cls.endTime}`;
      const timeMatch = noteStr.includes(cls.time) || noteStr.includes(timeSegment);

      if (noteStr.includes(" - ") && (noteStr.includes(":") || noteStr.includes("Sesi:"))) {
        return titleMatch && timeMatch;
      }

      return titleMatch;
    };

    // Helper to generate dates in range (newest first)
    const getDatesInRange = (startStr: string, endStr: string) => {
      const dates = [];
      let current = new Date(`${startStr}T12:00:00`);
      const end = new Date(`${endStr}T12:00:00`);
      while (current <= end) {
        dates.push(current.toISOString().split("T")[0]);
        current.setDate(current.getDate() + 1);
      }
      return dates.reverse();
    };

    const dates = getDatesInRange(startDate, endDate);
    const isSmallRange = dates.length <= 7;
    const daysData = [];

    // 5. Group classes and member attendance by date
    for (const date of dates) {
      const dateAttendances = attendances.filter((a) => a.attendanceDate === date);

      // Filter point histories created on this local date in Jakarta
      const datePoints = pointHistories.filter((p) => {
        const pDateObj = new Date(p.createdAt);
        // Adjust to Jakarta time (+7 hours) for checking date boundary
        const jakartaTime = new Date(pDateObj.getTime() + 7 * 60 * 60 * 1000);
        const pDateStr = jakartaTime.toISOString().split("T")[0];
        return pDateStr === date;
      });

      const hasActivity = dateAttendances.length > 0 || datePoints.length > 0;
      const isToday = date === getJakartaDateString();

      // Only show days with activity, or today, or all days if the range is small (<= 7 days)
      if (hasActivity || isToday || isSmallRange) {
        const dayClasses = classes.map((cls) => {
          // Find members checked in to this class on this date
          const classMembers = dateAttendances
            .filter((att) => isAttendanceForClass(att, cls))
            .map((att) => {
              const u: any = att.userId ? userMap.get(att.userId) : null;
              return {
                id: att.id,
                userId: att.userId,
                fullName: att.fullName,
                checkIn: att.checkIn,
                checkOut: att.checkOut,
                status: att.status,
                checkInPhoto: att.checkInPhoto,
                checkOutPhoto: att.checkOutPhoto,
                email: u?.email || "",
                phone: u?.phone || "",
                photoUrl: u?.photoUrl || null,
              };
            });

          // Calculate PT points earned in this class today
          let ptPointsToday = 0;
          if (cls.trainerId) {
            const classPoints = datePoints.filter(
              (p) =>
                p.userId === cls.trainerId &&
                (p.description || "").includes(cls.title)
            );
            ptPointsToday = classPoints.reduce((sum, p) => sum + p.amount, 0);
          }

          return {
            ...cls,
            joined: classMembers.length,
            members: classMembers,
            ptPointsToday,
          };
        });

        daysData.push({
          date,
          classes: dayClasses,
        });
      }
    }

    return successResponse({
      message: `Monitoring kelas dari tanggal ${startDate} sampai ${endDate} berhasil diambil`,
      data: {
        startDate,
        endDate,
        days: daysData,
      },
    });
  } catch (error) {
    console.error("GET CLASSES MONITORING ERROR:", error);
    return errorResponse("Gagal mengambil data monitoring kelas", 500);
  }
}
