import { getTokenFromRequest, verifyToken, type JwtUserPayload } from "./auth";
import { User, UserPermission } from "@/database/models";
import { ROLE_DEFAULT_FEATURES } from "./feature-registry";
import { Op } from "sequelize";

export type FeatureAuthResult =
  | { success: true; user: JwtUserPayload }
  | { success: false; message: string; statusCode: number };

async function getAuthUser(
  request: Request
): Promise<
  | { success: true; user: JwtUserPayload; dbUser: User }
  | { success: false; message: string; statusCode: number }
> {
  const token = getTokenFromRequest(request);
  if (!token) {
    return {
      success: false,
      message: "Token autentikasi tidak ditemukan.",
      statusCode: 401,
    };
  }

  const payload = verifyToken(token);
  if (!payload || !payload.id) {
    return {
      success: false,
      message: "Sesi login tidak valid atau sudah kedaluwarsa.",
      statusCode: 401,
    };
  }

  const dbUser = await User.findByPk(payload.id);
  if (!dbUser) {
    return {
      success: false,
      message: "User tidak ditemukan.",
      statusCode: 401,
    };
  }

  return { success: true, user: payload, dbUser };
}

/**
 * Ambil custom permissions user dari pivot table beserta method-nya.
 */
export async function fetchUserPermissionEntries(
  userId: number
): Promise<{ featureKey: string; methods: string }[]> {
  const rows = await UserPermission.findAll({
    where: { userId },
    attributes: ["featureKey", "methods"],
    raw: true,
  });
  return rows.map((r) => ({
    featureKey: r.featureKey,
    methods:
      typeof r.methods === "string" && r.methods.length > 0 ? r.methods : "CRUD",
  }));
}

export async function fetchUserPermissionKeys(userId: number): Promise<string[]> {
  const entries = await fetchUserPermissionEntries(userId);
  return entries.map((e) => e.featureKey);
}

const METHOD_LABELS: Record<string, string> = {
  C: "Create",
  R: "Read",
  U: "Update",
  D: "Delete",
};

export const FEATURE_ALIASES: Record<string, string[]> = {
  "admin.kelola_karyawan": ["admin.users", "manager.users"],
  "admin.users": ["admin.kelola_karyawan", "manager.users"],
  "manager.users": ["admin.kelola_karyawan", "admin.users"],

  "admin.absensi": ["manager.absensi"],
  "manager.absensi": ["admin.absensi"],

  "admin.kasir": ["kasir.verifikasi", "kasir.pembayaran", "manager.pembayaran"],
  "kasir.verifikasi": ["admin.kasir", "manager.pembayaran"],
  "kasir.pembayaran": ["admin.kasir"],
  "manager.pembayaran": ["admin.kasir", "kasir.verifikasi"],

  "admin.member": ["manager.member"],
  "manager.member": ["admin.member"],

  "admin.membership": ["manager.membership"],
  "manager.membership": ["admin.membership"],

  "admin.laporan": ["manager.laporan"],
  "manager.laporan": ["admin.laporan"],

  "admin.referral": ["manager.referral"],
  "manager.referral": ["admin.referral"],
};

export function resolveEffectivePermissions(
  role: string,
  customPermissions: string[]
): string[] {
  const defaults = ROLE_DEFAULT_FEATURES[role?.toLowerCase()] ?? [];

  const customFiltered = Array.isArray(customPermissions)
    ? customPermissions.filter((p): p is string => typeof p === "string" && p.length > 0)
    : [];

  const combined = new Set([...defaults, ...customFiltered]);

  for (const perm of [...combined]) {
    const aliases = FEATURE_ALIASES[perm];
    if (aliases) {
      for (const alias of aliases) {
        combined.add(alias);
      }
    }
  }

  return [...combined];
}

/**
 * Zero Trust: memastikan user punya akses fitur.
 * Mendukung key tunggal, daftar key alternatif (multi-key), role tambahan eksplisit,
 * serta method-level check ('C' | 'R' | 'U' | 'D') untuk custom permission.
 */
export async function requireFeature(
  request: Request,
  featureKey: string | string[],
  additionalRoles: string[] = [],
  method?: string
): Promise<FeatureAuthResult> {
  const auth = await getAuthUser(request);
  if (!auth.success) return auth;

  const actorRole = auth.dbUser.role.toLowerCase();

  // Role IT / superadmin / owner / direktur selalu full access (Superuser Bypass)
  const superRoles = ["it", "superadmin", "owner", "direktur"];
  if (superRoles.includes(actorRole)) {
    return { success: true, user: auth.user };
  }

  // Jika role pengguna masuk dalam role tambahan yang diizinkan secara eksplisit
  if (additionalRoles.map((r) => r.toLowerCase()).includes(actorRole)) {
    return { success: true, user: auth.user };
  }

  const entries = await fetchUserPermissionEntries(auth.dbUser.id);
  const effective = resolveEffectivePermissions(
    auth.dbUser.role,
    entries.map((e) => e.featureKey)
  );

  const keysToCheck = Array.isArray(featureKey) ? featureKey : [featureKey];
  const hasFeature = keysToCheck.some((k) => effective.includes(k));

  if (!hasFeature) {
    return {
      success: false,
      message: "Akses ditolak: Anda tidak memiliki izin fitur ini.",
      statusCode: 403,
    };
  }

  const methodSafe = method?.toUpperCase() ?? {
    GET: "R",
    HEAD: "R",
    OPTIONS: "R",
    POST: "C",
    PUT: "U",
    PATCH: "U",
    DELETE: "D",
  }[request.method?.toUpperCase() ?? ""];

  if (methodSafe) {
    const fromDefault = resolveEffectivePermissions(auth.dbUser.role, []).some(
      (k) => keysToCheck.includes(k)
    );
    const fromCustom = entries.some((e) => {
      const expanded = new Set([
        e.featureKey,
        ...(FEATURE_ALIASES[e.featureKey] ?? []),
      ]);
      return (
        keysToCheck.some((k) => expanded.has(k)) &&
        e.methods.includes(methodSafe)
      );
    });

    if (!fromDefault && !fromCustom) {
      const label = METHOD_LABELS[methodSafe] ?? methodSafe;
      return {
        success: false,
        message: `Akses ditolak: Anda tidak memiliki izin ${label} pada fitur ini.`,
        statusCode: 403,
      };
    }
  }

  return { success: true, user: auth.user };
}

export async function getEffectivePermissions(
  role: string,
  userId: number
): Promise<string[]> {
  const custom = await fetchUserPermissionKeys(userId);
  return resolveEffectivePermissions(role, custom);
}
