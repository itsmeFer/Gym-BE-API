import { NextRequest } from "next/server";

import { User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { getAdminFromRequest } from "@/lib/admin-auth";
import { logActivity, extractClientIp } from "@/lib/activity-logger";
import { ROLE_DEFAULT_FEATURES } from "@/lib/feature-registry";

/**
 * PUT /api/it/users/[id]/role
 * IT only. Mengubah role akun staff (bukan akun super).
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAdminFromRequest(request);
    if (!auth.success || !auth.user) {
      return errorResponse(auth.message, 403);
    }

    const actorRole = String(auth.user.role ?? "").toLowerCase();
    if (actorRole !== "it" && actorRole !== "superadmin") {
      return errorResponse("Akses ditolak: Hanya IT Superadmin", 403);
    }

    const { id } = await context.params;
    const userId = Number(id);
    if (!Number.isFinite(userId)) {
      return errorResponse("ID user tidak valid", 400);
    }

    const target = await User.findByPk(userId);
    if (!target) {
      return errorResponse("User tidak ditemukan", 404);
    }

    const targetRole = String(target.role ?? "").toLowerCase();
    const isSuper =
      targetRole === "it" ||
      targetRole === "owner" ||
      targetRole === "direktur" ||
      targetRole === "superadmin";

    if (isSuper) {
      return errorResponse(
        "Tidak dapat mengubah role akun super (it/owner/direktur)",
        403
      );
    }

    const body = await request.json();
    const newRole = String(body.role ?? "").trim().toLowerCase();

    const ALLOWED_ROLES = [
      "admin",
      "manager",
      "karyawan",
      "trainer",
      "sales",
      "kasir",
      "customer",
    ];

    if (!ALLOWED_ROLES.includes(newRole)) {
      return errorResponse(
        "Role tidak valid. Pilih: admin, manager, karyawan, trainer, sales, kasir, atau customer",
        400
      );
    }

    const oldRole = target.role;
    const oldDefaultCount = ROLE_DEFAULT_FEATURES[oldRole as string]?.length ?? 0;
    const newDefaultCount = ROLE_DEFAULT_FEATURES[newRole]?.length ?? 0;

    await target.update({ role: newRole as User["role"] });

    await logActivity({
      actorId: Number(auth.user.id),
      action: "ROLE_UPDATED",
      targetType: "user",
      targetId: target.id,
      description: `Mengubah role ${target.name} (ID: ${target.id}) dari ${oldRole} menjadi ${newRole}. Menu default berubah dari ${oldDefaultCount} menjadi ${newDefaultCount} menu${oldDefaultCount !== newDefaultCount ? " — hak akses efektif user ikut berubah" : ""}.`,
      ipAddress: extractClientIp(request),
    });

    return successResponse({
      message: `Role ${target.name} berhasil diubah menjadi ${newRole}`,
      data: {
        id: target.id,
        role: newRole,
      },
    });
  } catch (error) {
    console.error("PUT IT USER ROLE ERROR:", error);
    return errorResponse("Gagal mengubah role user", 500);
  }
}
