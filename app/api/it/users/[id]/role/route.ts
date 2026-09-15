import { NextRequest } from "next/server";

import { User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { getAdminFromRequest } from "@/lib/admin-auth";

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

    await target.update({ role: newRole as User["role"] });

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
