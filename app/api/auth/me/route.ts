import { User } from "@/database/models";
import { getTokenFromRequest, verifyToken } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/response";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const token = getTokenFromRequest(request);

    if (!token) {
      return errorResponse("Token tidak ditemukan", 401);
    }

    const payload = verifyToken(token);

    if (!payload) {
      return errorResponse("Token tidak valid atau sudah expired", 401);
    }

    const user = await User.findByPk(payload.id);

    if (!user) {
      return errorResponse("User tidak ditemukan", 404);
    }

    const userData = user.get({ plain: true }) as {
      id: number;
      name: string;
      phone: string;
      email: string;
      role: string;
      referralCode: string;
      referredByCode: string | null;
      isActive: boolean;
    };

    return successResponse({
      message: "Data user berhasil diambil",
      data: {
        id: userData.id,
        name: userData.name,
        phone: userData.phone,
        email: userData.email,
        role: userData.role,
        referralCode: userData.referralCode,
        referredByCode: userData.referredByCode,
        isActive: userData.isActive,
      },
    });
  } catch (error) {
    return errorResponse("Gagal mengambil data user", 500, error);
  }
}