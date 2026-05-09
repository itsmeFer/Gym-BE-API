import { NextRequest } from "next/server";
import { User } from "@/database/models";
import { successResponse, errorResponse } from "@/lib/response";

function toNumberOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    /**
     * Sementara ambil userId dari query/header.
     * Nanti kalau JWT/session sudah siap, ganti ini dengan user dari token login.
     *
     * Contoh:
     * /api/admin/users/me?userId=2
     */
    const userId =
      toNumberOrNull(searchParams.get("userId")) ??
      toNumberOrNull(request.headers.get("x-user-id"));

    if (!userId) {
      return errorResponse("User login tidak valid", 401);
    }

    const user = await User.findByPk(userId, {
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

        /**
         * points = poin aktual sekarang.
         * maxPoints = poin awal/maksimal untuk angka kanan.
         */
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