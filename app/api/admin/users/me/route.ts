import { NextRequest } from "next/server";
import { User } from "@/database/models";
import { successResponse, errorResponse } from "@/lib/response";
import { getTokenFromRequest, verifyToken } from "@/lib/auth";

function toNumberOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return errorResponse("Unauthorized: Sesi tidak ditemukan", 401);
    }

    const decoded = verifyToken(token);
    if (!decoded || !decoded.id) {
      return errorResponse("Unauthorized: Token tidak valid atau kedaluwarsa", 401);
    }

    const allowedRoles = ["admin", "owner", "direktur", "manager", "kasir"];
    const requesterRole = String(decoded.role ?? "").toLowerCase();

    const searchParams = request.nextUrl.searchParams;
    const requestedUserId = toNumberOrNull(searchParams.get("userId"));

    let targetUserId = decoded.id;
    if (requestedUserId && requestedUserId !== decoded.id) {
      if (!allowedRoles.includes(requesterRole)) {
        return errorResponse("Forbidden: Akses ditolak", 403);
      }
      targetUserId = requestedUserId;
    }

    const user = await User.findByPk(targetUserId, {
      attributes: [
        "id",
        "name",
        "email",
        "phone",
        "role",
        "points",
        "maxPoints",
        "isActive",
        "createdAt",
      ],
    });

    if (!user) {
      return errorResponse("User tidak ditemukan", 404);
    }

    const userData = user.get({ plain: true });

    return successResponse({
      message: "Data user berhasil diambil",
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        phone: userData.phone,
        role: String(userData.role ?? "").toLowerCase(),
        points: Number(userData.points ?? 0),
        maxPoints: Number(userData.maxPoints ?? 100),
        isActive: Boolean(userData.isActive),
        createdAt: userData.createdAt,
      },
    });
  } catch (error) {
    console.error("GET /api/admin/users/me ERROR:", error);
    return errorResponse("Gagal mengambil user", 500);
  }
}