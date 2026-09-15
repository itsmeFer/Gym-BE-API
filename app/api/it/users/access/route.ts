import { NextRequest } from "next/server";

import { User, UserPermission } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { getAdminFromRequest } from "@/lib/admin-auth";
import { FEATURES, ROLE_DEFAULT_FEATURES } from "@/lib/feature-registry";
import { getEffectivePermissions } from "@/lib/feature-permission";

async function serializeStaff(user: User) {
  const plain = user.get({ plain: true }) as {
    id: number;
    name: string;
    email: string;
    phone: string;
    role: string;
    isActive: boolean;
    createdAt?: Date;
  };

  const effectivePermissions = await getEffectivePermissions(
    plain.role ?? "",
    plain.id
  );

  const customRows = await UserPermission.findAll({
    where: { userId: plain.id },
    attributes: ["featureKey", "methods"],
    raw: true,
  });
  const permissions = customRows.map((r) => ({
    featureKey: r.featureKey,
    methods:
      typeof r.methods === "string" && r.methods.length > 0 ? r.methods : "CRUD",
  }));

  return {
    id: plain.id,
    name: plain.name,
    email: plain.email,
    phone: plain.phone,
    role: String(plain.role ?? "").toLowerCase(),
    isActive: plain.isActive ?? true,
    effectivePermissions,
    permissions,
    createdAt: plain.createdAt ?? null,
  };
}

/**
 * GET /api/it/users/access
 * IT only. Mendapatkan daftar semua staf + permissions efektif mereka.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAdminFromRequest(request);
    if (!auth.success || !auth.user) {
      return errorResponse(auth.message, 403);
    }

    const actorRole = String(auth.user.role ?? "").toLowerCase();
    if (actorRole !== "it" && actorRole !== "superadmin") {
      return errorResponse("Akses ditolak: Hanya IT Superadmin", 403);
    }

    const users = await User.findAll({
      order: [["id", "DESC"]],
    });

    const data = [];
    for (const user of users) {
      data.push(await serializeStaff(user));
    }

    return successResponse({
      message: "Data akses user berhasil diambil",
      data,
      meta: {
        features: FEATURES,
        roleDefaults: ROLE_DEFAULT_FEATURES,
      },
    });
  } catch (error) {
    console.error("GET IT USERS ACCESS ERROR:", error);
    return errorResponse("Gagal mengambil data akses user", 500);
  }
}
