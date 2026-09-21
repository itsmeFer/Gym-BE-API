import { NextRequest } from "next/server";
import { SystemChange, UserSystemChangeRead } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { requireAuth } from "@/lib/rbac";

export const runtime = "nodejs";

const ALL_STAFF_ROLES = [
  "admin",
  "manager",
  "owner",
  "direktur",
  "kasir",
  "sales",
  "trainer",
  "it",
  "karyawan",
];

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.success) {
      return errorResponse(auth.message, auth.statusCode);
    }

    const userRole = String(auth.user.role).toLowerCase();
    if (!ALL_STAFF_ROLES.includes(userRole)) {
      return errorResponse("Akses ditolak. Khusus staf internal.", 403);
    }

    const params = await props.params;
    const changeId = parseInt(params.id, 10);
    if (isNaN(changeId) || changeId <= 0) {
      return errorResponse("ID perubahan sistem tidak valid", 400);
    }

    await UserSystemChangeRead.sync();

    const change = await SystemChange.findByPk(changeId);
    if (!change) {
      return errorResponse("Catatan perubahan sistem tidak ditemukan", 404);
    }

    await UserSystemChangeRead.findOrCreate({
      where: {
        userId: auth.user.id,
        systemChangeId: changeId,
      },
      defaults: {
        userId: auth.user.id,
        systemChangeId: changeId,
        readAt: new Date(),
      },
    });

    return successResponse({
      message: "Perubahan sistem telah ditandai sebagai sudah dibaca",
      data: {
        systemChangeId: changeId,
        isRead: true,
      },
    });
  } catch (error) {
    console.error("MARK SYSTEM CHANGE READ ERROR:", error);
    return errorResponse("Gagal menandai perubahan sistem sebagai sudah dibaca", 500);
  }
}
