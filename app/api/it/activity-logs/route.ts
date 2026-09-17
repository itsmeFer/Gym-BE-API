import { NextRequest } from "next/server";
import { ActivityLog, User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { requireFeature } from "@/lib/feature-permission";
import { logActivity, extractClientIp } from "@/lib/activity-logger";
import { Op } from "sequelize";

export const runtime = "nodejs";

/**
 * GET /api/it/activity-logs
 * Endpoint Audit Trail Enterprise untuk IT / Superadmin / Owner.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireFeature(
      request,
      ["admin.laporan", "manager.laporan"],
      ["it", "superadmin", "owner", "direktur", "manager"]
    );
    if (!auth.success) {
      return errorResponse(auth.message, auth.statusCode);
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 50), 1), 200);
    const page = Math.max(Number(searchParams.get("page") ?? 1), 1);
    const offset = (page - 1) * limit;
    const action = searchParams.get("action");
    const targetType = searchParams.get("targetType");

    const whereClause: Record<string, any> = {};
    if (action) {
      whereClause.action = action.trim().toUpperCase();
    }
    if (targetType) {
      whereClause.targetType = targetType.trim().toLowerCase();
    }

    await ActivityLog.sync();

    const { count, rows } = await ActivityLog.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: "actor",
          attributes: ["id", "name", "email", "role", "phone"],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    await logActivity({
      actorId: Number(auth.user.id),
      action: "AUDIT_TRAIL_VIEWED",
      targetType: "activity_log",
      targetId: null,
      description: `Membuka audit trail (filter: ${action || "semua action"} / ${targetType || "semua tipe"}, halaman ${page}, ${count} entri)`,
      ipAddress: extractClientIp(request),
    });

    return successResponse({
      message: "Data activity logs berhasil diambil",
      data: rows,
      meta: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("GET IT ACTIVITY LOGS ERROR:", error);
    return errorResponse("Gagal mengambil data activity logs", 500);
  }
}
