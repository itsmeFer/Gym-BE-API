import { getTokenFromRequest, verifyToken, type JwtUserPayload } from "./auth";

import { User } from "@/database/models";

export type AuthResult =
  | { success: true; user: JwtUserPayload }
  | { success: false; message: string; statusCode: number };

export async function requireAuth(request: Request): Promise<AuthResult> {
  const token = getTokenFromRequest(request);
  if (!token) {
    return {
      success: false,
      message: "Token autentikasi tidak ditemukan. Silakan login terlebih dahulu.",
      statusCode: 401,
    };
  }

  const payload = verifyToken(token);
  if (!payload || !payload.id) {
    return {
      success: false,
      message: "Sesi login tidak valid atau sudah kedaluwarsa. Silakan login kembali.",
      statusCode: 401,
    };
  }

  const dbUser = await User.findByPk(payload.id);
  if (!dbUser) {
    return {
      success: false,
      message: "Akun tidak ditemukan.",
      statusCode: 401,
    };
  }

  const userData = dbUser.get({ plain: true }) as { role: string; isActive: boolean };

  if (userData.isActive === false) {
    return {
      success: false,
      message: "Akun kamu tidak aktif.",
      statusCode: 403,
    };
  }

  const freshUser: JwtUserPayload = {
    ...payload,
    role: String(userData.role ?? payload.role).toLowerCase(),
  };

  return { success: true, user: freshUser };
}

export async function requireRole(
  request: Request,
  allowedRoles: string[]
): Promise<AuthResult> {
  const auth = await requireAuth(request);
  if (!auth.success) {
    return auth;
  }

  const userRole = String(auth.user.role || "").toLowerCase();
  const normalizedAllowed = allowedRoles.map((r) => r.toLowerCase());

  if (!normalizedAllowed.includes(userRole)) {
    return {
      success: false,
      message: "Akses ditolak: Peran Anda tidak memiliki hak akses untuk endpoint ini.",
      statusCode: 403,
    };
  }

  return auth;
}
