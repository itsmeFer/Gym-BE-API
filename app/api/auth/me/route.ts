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
  photoUrl?: string | null;
  photo_url?: string | null;
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
    referralCode: userData.referralCode ?? userData.referral_code ?? "",
    referredByCode: userData.referredByCode ?? userData.referred_by_code ?? null,
    referredByUserId: userData.referredByUserId ?? userData.referred_by_user_id ?? null,
    isActive: userData.isActive ?? userData.is_active ?? true,
    emailVerifiedAt: userData.emailVerifiedAt ?? userData.email_verified_at ?? null,
    photoUrl: userData.photoUrl ?? userData.photo_url ?? null,
  };
}

export async function GET(request: Request) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) return errorResponse("Token tidak ditemukan", 401);

    const payload = verifyToken(token);
    if (!payload) return errorResponse("Token tidak valid atau sudah expired", 401);

    const user = await User.findByPk(payload.id);
    if (!user) return errorResponse("User tidak ditemukan", 404);

    const userData = user.get({ plain: true }) as MeUserData;
    if ((userData.isActive ?? userData.is_active ?? true) === false) {
      return errorResponse("Akun kamu belum aktif atau sedang dinonaktifkan", 403);
    }

    return successResponse({ message: "Data user berhasil diambil", data: serializeMeUser(userData) });
  } catch (error) {
    console.error("GET ME ERROR:", error);
    return errorResponse("Gagal mengambil data user", 500, error);
  }
}

export async function PUT(request: Request) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) return errorResponse("Token tidak ditemukan", 401);

    const payload = verifyToken(token);
    if (!payload) return errorResponse("Token tidak valid atau sudah expired", 401);

    const body = await request.json();
    const name = body.name?.toString().trim();
    const phone = body.phone?.toString().trim();

    if (!name && !phone) {
      return errorResponse("Tidak ada data yang diperbarui", 400);
    }

    const user = await User.findByPk(payload.id);
    if (!user) return errorResponse("User tidak ditemukan", 404);

    if (name) {
      if (name.length < 2) return errorResponse("Nama minimal 2 karakter", 400);
      user.name = name;
    }

    if (phone) {
      const cleaned = phone.replace(/[^0-9]/g, "");
      if (cleaned.length < 9 || cleaned.length > 15) {
        return errorResponse("Nomor telepon harus antara 9 - 15 digit", 400);
      }
      if (!cleaned.startsWith("08") && !cleaned.startsWith("628")) {
        return errorResponse("Nomor telepon harus diawali 08 atau 628", 400);
      }

      const existing = await User.findOne({ where: { phone: cleaned } });
      if (existing && existing.id !== payload.id) {
        return errorResponse("Nomor telepon sudah digunakan akun lain", 409);
      }

      user.phone = cleaned;
    }

    await user.save();

    const updated = user.get({ plain: true }) as MeUserData;
    return successResponse({ message: "Profil berhasil diperbarui", data: serializeMeUser(updated) });
  } catch (error) {
    console.error("PUT ME ERROR:", error);
    return errorResponse("Gagal memperbarui profil", 500, error);
  }
}