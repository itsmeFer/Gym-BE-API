import { User } from "@/database/models";
import { getTokenFromRequest, verifyToken } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/response";

export const runtime = "nodejs";

type MeUserData = {
  id: number;
  name: string;
  phone: string;
  email: string;
  role: string;

  points?: number | null;
  maxPoints?: number | null;
  max_points?: number | null;

  referralCode?: string | null;
  referral_code?: string | null;

  referredByCode?: string | null;
  referred_by_code?: string | null;

  referredByUserId?: number | null;
  referred_by_user_id?: number | null;

  isActive?: boolean | null;
  is_active?: boolean | null;

  emailVerifiedAt?: Date | string | null;
  email_verified_at?: Date | string | null;
};

function serializeMeUser(userData: MeUserData) {
  return {
    id: userData.id,
    name: userData.name,
    phone: userData.phone,
    email: userData.email,
    role: String(userData.role ?? "customer").toLowerCase(),

    points: Number(userData.points ?? 0),
    maxPoints: Number(userData.maxPoints ?? userData.max_points ?? 100),

    // Kode pribadi milik user ini.
    referralCode: userData.referralCode ?? userData.referral_code ?? "",

    // Kode aktif = kode teman yang dipakai saat register.
    referredByCode:
      userData.referredByCode ?? userData.referred_by_code ?? null,

    // ID pemilik kode aktif.
    referredByUserId:
      userData.referredByUserId ?? userData.referred_by_user_id ?? null,

    isActive: userData.isActive ?? userData.is_active ?? true,

    emailVerifiedAt:
      userData.emailVerifiedAt ?? userData.email_verified_at ?? null,
  };
}

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

    const userData = user.get({ plain: true }) as MeUserData;

    return successResponse({
      message: "Data user berhasil diambil",
      data: serializeMeUser(userData),
    });
  } catch (error) {
    console.error("GET ME ERROR:", error);
    return errorResponse("Gagal mengambil data user", 500, error);
  }
}