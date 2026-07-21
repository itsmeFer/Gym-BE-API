import { getTokenFromRequest, verifyToken } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/response";
import { User, PointHistory, PtSession } from "@/database/models";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) return errorResponse("Unauthorized", 401);

    const payload = verifyToken(token);
    if (!payload || payload.role !== "trainer") {
      return errorResponse("Forbidden: Only trainers can access this", 403);
    }

    const user = await User.findByPk(payload.id, {
      include: [
        {
          model: PointHistory,
          as: "pointHistories",
          order: [["createdAt", "DESC"]],
          limit: 20,
          include: [
            {
              model: User,
              as: "user",
              attributes: ["id", "name"],
            }
          ]
        },
      ],
    });

    if (!user) {
      return errorResponse("User not found", 404);
    }

    // Include recent PT Sessions for extra details if needed
    const recentSessions = await PtSession.findAll({
      where: { trainerId: payload.id },
      order: [["sessionDate", "DESC"]],
      limit: 5,
      include: [
        {
          model: User,
          as: "customer",
          attributes: ["id", "name"],
        },
      ],
    });

    return successResponse({
      points: user.points,
      maxPoints: user.maxPoints,
      history: user.get("pointHistories") || [],
      recentSessions: recentSessions || [],
    });
  } catch (error: any) {
    console.error("GET /api/pt/points Error:", error);
    return errorResponse("Internal server error", 500);
  }
}
