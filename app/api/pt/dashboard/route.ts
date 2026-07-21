import { getTokenFromRequest, verifyToken } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/response";
import { User, PtSession } from "@/database/models";
import { Op } from "sequelize";

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

    const activeClients = new Set(completedSessions.map(s => s.customerId)).size;
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
         focus: "General Training", // Hardcoded for MVP
         duration: "60 min", // Hardcoded for MVP
         status: session.status,
         rawDate: session.sessionDate,
       };
    });

    return successResponse({
      trainerName,
      activeClients,
      totalHrs,
      rating: "4.9",
      sessions: sessionsList,
    });
  } catch (error: any) {
    console.error("PT Dashboard Error:", error);
    return errorResponse(error.message, 500);
  }
}
