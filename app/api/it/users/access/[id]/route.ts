import { NextRequest } from "next/server";

import { User, UserPermission } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { getAdminFromRequest } from "@/lib/admin-auth";
import { FEATURES, isValidFeatureKey } from "@/lib/feature-registry";
import { getEffectivePermissions } from "@/lib/feature-permission";
import { logActivity, extractClientIp } from "@/lib/activity-logger";
import { Op } from "sequelize";

const SUPER_ROLES = ["it", "superadmin", "owner", "direktur"];

const FEATURE_LABELS: Record<string, string> = Object.fromEntries(
  FEATURES.map((f) => [f.key, f.label])
);

function formatMethodWord(methods: string): string {
  const map: Record<string, string> = { C: "Tambah", R: "Lihat", U: "Ubah", D: "Hapus" };
  const words = [...methods].map((c) => map[c]).filter(Boolean);
  if (words.length === 0) return "CRUD";
  if (words.length === 4) return "CRUD (Tambah/Lihat/Ubah/Hapus)";
  return words.join("/");
}

function formatPermissionDescription(
  userName: string,
  userId: number,
  previous: { featureKey: string; methods: string }[],
  next: { featureKey: string; methods: string }[]
): { action: string; description: string } {
  const prevMap = new Map(previous.map((p) => [p.featureKey, p.methods]));
  const nextMap = new Map(next.map((p) => [p.featureKey, p.methods]));

  const allKeys = [...new Set([...prevMap.keys(), ...nextMap.keys()])];
  const labelOf = (key: string) => FEATURE_LABELS[key] ?? key;

  const changes: string[] = [];
  let revokedCount = 0;
  let grantedCount = 0;

  for (const key of allKeys) {
    const before = prevMap.get(key);
    const after = nextMap.get(key);

    if (before && !after) {
      revokedCount++;
      changes.push(`Mencabut "${labelOf(key)}" (sebelumnya ${formatMethodWord(before)})`);
    } else if (!before && after) {
      grantedCount++;
      changes.push(`Memberikan "${labelOf(key)}" → ${formatMethodWord(after)}`);
    } else if (before && after && before !== after) {
      changes.push(
        `"${labelOf(key)}": ${formatMethodWord(before)} → ${formatMethodWord(after)}`
      );
    }
  }

  const actor = `Update hak akses ${userName} (ID: ${userId})`;

  if (changes.length === 0) {
    return {
      action: "ACCESS_UPDATED",
      description: `${actor} — tidak ada perubahan efektif (${next.length} fitur aktif)`,
    };
  }

  const verb =
    revokedCount > 0 && grantedCount === 0
      ? "ACCESS_REVOKED"
      : grantedCount > 0 && revokedCount === 0
      ? "ACCESS_GRANTED"
      : "ACCESS_UPDATED";

  const detail = changes.slice(0, 12).join("; ");
  const more = changes.length > 12 ? `; +${changes.length - 12} perubahan lain` : "";

  return {
    action: verb,
    description: `${actor} (${changes.length} perubahan): ${detail}${more}`,
  };
}

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

    // Snapshot permission lama untuk audit trail granular
    const previousPermissions = await UserPermission.findAll({
      where: { userId },
      attributes: ["featureKey", "methods"],
      raw: true,
    });

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

    const logInfo = formatPermissionDescription(
      target.name,
      userId,
      previousPermissions,
      permissions
    );

    await logActivity({
      actorId: Number(auth.user.id),
      action: logInfo.action,
      targetType: "user_permission",
      targetId: userId,
      description: logInfo.description,
      ipAddress: extractClientIp(request),
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
