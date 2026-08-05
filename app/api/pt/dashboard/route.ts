import { getTokenFromRequest, verifyToken } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/response";
import { User, PtSession, PointHistory, Attendance } from "@/database/models";
import { Op } from "sequelize";

import { initializeClassesFromPlans } from "@/lib/classes-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) return errorResponse("Unauthorized", 401);

    const payload = verifyToken(token);
    if (!payload || payload.role !== "trainer") {
      return errorResponse("Forbidden: Only trainers can access this", 403);
    }

    // Get basic user info
    const user = await User.findByPk(payload.id);
    if (!user) return errorResponse("User not found", 404);

    const trainerName = user.name.split(" ")[0];

    // Get today's start and end dates
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    // Calculate Active Clients (distinct customer_id in completed sessions)
    const completedSessions = await PtSession.findAll({
      where: {
        trainerId: payload.id,
        status: "completed",
      },
    });

    const totalHrs = completedSessions.length; // Assume 1 hour per session

    // Fetch today's scheduled sessions
    const todaysSessions = await PtSession.findAll({
      where: {
        trainerId: payload.id,
        sessionDate: {
          [Op.between]: [startOfToday, endOfToday],
        },
      },
      include: [
        {
          model: User,
          as: "customer",
          attributes: ["id", "name"],
        },
      ],
      order: [["sessionDate", "ASC"]],
    });

    // Formatting sessions for the frontend
    const sessionsList = todaysSessions.map(session => {
       const customer = (session as any).customer;
       const clientName = customer ? customer.name : `Client ${session.customerId}`;
       
       const d = new Date(session.sessionDate);
       const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
       const endHour = d.getHours() + 1;
       const endTimeStr = `${endHour.toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

       return {
         id: session.id,
         client: clientName,
         initial: clientName.substring(0, 2).toUpperCase(),
         time: `${timeStr} — ${endTimeStr}`,
         focus: "General Training",
         duration: "60 min",
         status: session.status,
         rawDate: session.sessionDate,
       };
    });

    // Fetch available class schedules assigned to PT / Gym
    const allStoreClasses = await initializeClassesFromPlans();
    const availableClasses = allStoreClasses.filter(c => {
      if (c.trainerId && Number(c.trainerId) === Number(payload.id)) return true;
      if (Array.isArray(c.assignedPtNames) && (c.assignedPtNames.includes(user.name) || c.assignedPtNames.includes(trainerName))) return true;
      if (Array.isArray(c.assignedPtNames) && c.assignedPtNames.includes("Personal Trainer")) return true;
      return true; // Return all classes so trainer can view available gym schedules
    });

    // Fetch unique clients / members in trainer's classes or checked-in
    const pointHistories = await PointHistory.findAll({
      where: {
        userId: payload.id,
        relatedUserId: { [Op.ne]: null },
      },
      include: [
        {
          model: User,
          as: "relatedUser",
          attributes: ["id", "name", "email", "phone", "createdAt"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const ptSessions = await PtSession.findAll({
      where: { trainerId: payload.id },
      include: [
        {
          model: User,
          as: "customer",
          attributes: ["id", "name", "email", "phone", "createdAt"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const clientMap = new Map();

function getJakartaDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

    // Fetch today's attendances to attach proof & photos for trainer verification
    const todayStr = getJakartaDateString();
    const todayAttendances = await Attendance.findAll({
      where: {
        attendanceDate: todayStr,
      },
      order: [["id", "DESC"]],
    });

    const attendanceByUserId = new Map();
    for (const att of todayAttendances) {
      const plain = typeof (att as any).get === "function" ? (att as any).get({ plain: true }) : att;
      attendanceByUserId.set(plain.userId, plain);
    }

    // From Point History (Check-ins to PT)
    for (const ph of pointHistories) {
      const u = (ph as any).relatedUser;
      if (u && !clientMap.has(u.id)) {
        let pkgName = "Kelas Gym VIP";
        if (ph.description && ph.description.includes('kelas "')) {
          const match = ph.description.match(/kelas "(.*?)"/);
          if (match && match[1]) pkgName = match[1];
        } else if (ph.description) {
          pkgName = ph.description;
        }

        clientMap.set(u.id, {
          id: u.id,
          name: u.name,
          email: u.email || u.phone || "Member Active",
          phone: u.phone || "-",
          initial: u.name.substring(0, 2).toUpperCase(),
          status: "Member VIP",
          package: pkgName,
          lastCheckIn: ph.createdAt,
          totalSessions: 1,
        });
      } else if (u && clientMap.has(u.id)) {
        const existing = clientMap.get(u.id);
        existing.totalSessions += 1;
      }
    }

    // From PT Sessions
    for (const s of ptSessions) {
      const u = (s as any).customer;
      if (u && !clientMap.has(u.id)) {
        clientMap.set(u.id, {
          id: u.id,
          name: u.name,
          email: u.email || u.phone || "Member PT",
          phone: u.phone || "-",
          initial: u.name.substring(0, 2).toUpperCase(),
          status: "Client Personal Trainer",
          package: "Paket PT 10 Sesi",
          lastCheckIn: s.sessionDate || s.createdAt,
          totalSessions: 1,
        });
      }
    }

    // Include members who checked in today
    for (const att of todayAttendances) {
      const plain = typeof (att as any).get === "function" ? (att as any).get({ plain: true }) : att;
      if (!clientMap.has(plain.userId)) {
        clientMap.set(plain.userId, {
          id: plain.userId,
          name: plain.fullName || `Member #${plain.userId}`,
          email: plain.note || "Sudah Absen",
          phone: "-",
          initial: (plain.fullName || "M").substring(0, 2).toUpperCase(),
          status: plain.checkOut ? "Checked Out" : "Checked In",
          package: plain.classTitle || "Pilates VIP Class",
          lastCheckIn: plain.checkIn,
          totalSessions: 1,
          todayAttendance: plain,
        });
      } else {
        const existing = clientMap.get(plain.userId);
        existing.todayAttendance = plain;
      }
    }

    // Attach todayAttendance to all client entries
    for (const client of clientMap.values()) {
      if (!client.todayAttendance && attendanceByUserId.has(client.id)) {
        client.todayAttendance = attendanceByUserId.get(client.id);
      }
    }

    // If clientMap is still empty, include registered customers as active gym members
    if (clientMap.size === 0) {
      const customers = await User.findAll({
        where: { role: "customer", isActive: true },
        limit: 10,
        order: [["id", "DESC"]],
      });
      for (const u of customers) {
        clientMap.set(u.id, {
          id: u.id,
          name: u.name,
          email: u.email || u.phone || "Customer Active",
          phone: u.phone || "-",
          initial: u.name.substring(0, 2).toUpperCase(),
          status: "Member Active",
          package: "Gym Basic 1 Bulan",
          lastCheckIn: u.createdAt,
          totalSessions: 1,
          todayAttendance: attendanceByUserId.get(u.id) || null,
        });
      }
    }

    // Fetch all attendances for these clients where PT name matches this PT
    const clientIds = Array.from(clientMap.keys());
    const allPtAttendances = await Attendance.findAll({
      where: {
        userId: { [Op.in]: clientIds },
        note: {
          [Op.or]: [
            { [Op.like]: `%PT: ${user.name}%` },
            { [Op.like]: `%PT: ${trainerName}%` },
          ],
        },
      },
      order: [["attendanceDate", "DESC"], ["id", "DESC"]],
    });

    const attendancesByClient = new Map();
    for (const att of allPtAttendances) {
      const plain = typeof (att as any).get === "function" ? (att as any).get({ plain: true }) : att;
      if (!attendancesByClient.has(plain.userId)) {
        attendancesByClient.set(plain.userId, []);
      }
      attendancesByClient.get(plain.userId).push(plain);
    }

    // Attach history to clientMap
    for (const [id, client] of clientMap.entries()) {
      client.attendanceHistory = attendancesByClient.get(id) || [];
      if (client.attendanceHistory.length > 0) {
        client.totalSessions = client.attendanceHistory.length;
      }
    }

    const clientsList = Array.from(clientMap.values());
    const activeClientsCount = clientsList.length;

    return successResponse({
      trainerName,
      activeClients: activeClientsCount,
      totalHrs,
      rating: "4.9",
      sessions: sessionsList,
      availableClasses,
      clients: clientsList,
    });
  } catch (error: any) {
    console.error("PT Dashboard Error:", error);
    return errorResponse(error.message, 500);
  }
}
