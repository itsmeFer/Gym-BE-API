import { NextRequest } from "next/server";

import { User, UserPermission } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { getAdminFromRequest } from "@/lib/admin-auth";
import { isValidFeatureKey } from "@/lib/feature-registry";
import { getEffectivePermissions } from "@/lib/feature-permission";
import { Op } from "sequelize";

const SUPER_ROLES = ["it", "superadmin", "owner", "direktur"];

/**
 * PUT /api/it/users/access/[id]
 * IT only. Mengganti hak akses fitur user via pivot table (full replace).
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
    if (SUPER_ROLES.includes(targetRole)) {
      return errorResponse(
        "Tidak dapat mengubah permission akun super (it/owner/direktur)",
        403
      );
    }

    const body = await request.json();
    const raw = (body?.permissions ?? body?.custom_permissions) as unknown;

    if (!Array.isArray(raw)) {
      return errorResponse(
        "Format permissions tidak valid. Harus array string fitur terdaftar.",
        400
      );
    }

    const rawEntries = [...new Set(raw)] as (
      | string
      | { featureKey?: unknown; methods?: unknown }
    )[];

    const permissions: { featureKey: string; methods: string }[] = [];
    for (const entry of rawEntries) {
      if (typeof entry === "string") {
        if (!isValidFeatureKey(entry)) {
          return errorResponse(`Fitur tidak dikenal: ${entry}`, 400);
        }
        permissions.push({ featureKey: entry, methods: "CRUD" });
        continue;
      }

      if (!entry || typeof entry !== "object") {
        return errorResponse(
          "Format permissions tidak valid. Gunakan string key atau {featureKey, methods}.",
          400
        );
      }

      const key =
        typeof entry.featureKey === "string" ? entry.featureKey : "";
      const methods =
        typeof entry.methods === "string" ? entry.methods.trim().toUpperCase() : "";

      if (!isValidFeatureKey(key)) {
        return errorResponse(`Fitur tidak dikenal: ${key}`, 400);
      }
      if (
        !methods ||
        methods.length > 4 ||
        [...methods].some((c) => !["C", "R", "U", "D"].includes(c))
      ) {
        return errorResponse(
          `Methods tidak valid untuk ${key}. Gunakan kombinasi C/R/U/D.`,
          400
        );
      }

      permissions.push({ featureKey: key, methods });
    }

    // Full replace dalam satu transaksi atomik
    await User.sequelize!.transaction(async (t) => {
      await UserPermission.destroy({
        where: { userId },
        transaction: t,
      });

      if (permissions.length > 0) {
        await UserPermission.bulkCreate(
          permissions.map((p) => ({
            userId,
            featureKey: p.featureKey,
            methods: p.methods,
          })),
          { transaction: t }
        );
      }
    });

    const effective = await getEffectivePermissions(targetRole, userId);

    return successResponse({
      message: "Hak akses fitur user berhasil diperbarui",
      data: {
        id: userId,
        permissions: permissions.map((p) => p.featureKey),
        permissionMethods: permissions,
        effectivePermissions: effective,
      },
    });
  } catch (error) {
    console.error("PUT IT USER ACCESS ERROR:", error);
    return errorResponse("Gagal memperbarui permissions user", 500);
  }
}
