import { User } from "@/database/models";
import { getTokenFromRequest, verifyToken } from "@/lib/auth";

export async function getAdminFromRequest(request: Request) {
  const token = getTokenFromRequest(request);

  if (!token) {
    return {
      success: false,
      message: "Token tidak ditemukan",
      user: null,
    };
  }

  const payload = verifyToken(token);

  if (!payload) {
    return {
      success: false,
      message: "Token tidak valid atau sudah expired",
      user: null,
    };
  }

  const user = await User.findByPk(payload.id);

  if (!user) {
    return {
      success: false,
      message: "User tidak ditemukan",
      user: null,
    };
  }

  const userData = user.get({ plain: true }) as {
    id: number;
    role: string;
    isActive: boolean;
  };

  if (userData.isActive === false) {
    return {
      success: false,
      message: "Akun tidak aktif",
      user: null,
    };
  }

  if (userData.role !== "admin") {
    return {
      success: false,
      message: "Akses hanya untuk admin",
      user: null,
    };
  }

  return {
    success: true,
    message: "OK",
    user,
  };
}