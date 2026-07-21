import { User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Op } from "sequelize";

export const runtime = "nodejs";

type LoginUserData = {
  id: number;
  name: string;
  phone: string;
  email: string;
  password: string;
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

function serializeLoginUser(userData: LoginUserData) {
  const role = String(userData.role ?? "customer").toLowerCase();

  return {
    id: userData.id,
    name: userData.name,
    phone: userData.phone,
    email: userData.email,
    role,

    points: Number(userData.points ?? 0),
    maxPoints: Number(userData.maxPoints ?? userData.max_points ?? 100),

    // Kode pribadi user ini.
    referralCode: userData.referralCode ?? userData.referral_code ?? "",

    // Kode aktif = kode teman yang dipakai waktu register.
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

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const identifier = String(body.identifier || "").trim().toLowerCase();
    const passwordInput = String(body.password || "");

    if (!identifier || !passwordInput) {
      return errorResponse("Email/no HP dan password wajib diisi", 400);
    }

    const user = await User.findOne({
      where: {
        [Op.or]: [{ email: identifier }, { phone: identifier }],
      },
    });

    if (!user) {
      return errorResponse("Akun tidak ditemukan", 404);
    }

    const userData = user.get({ plain: true }) as LoginUserData;

    const isActive = userData.isActive ?? userData.is_active ?? true;

    if (isActive === false) {
      return errorResponse(
        "Akun kamu belum aktif atau sedang dinonaktifkan",
        403
      );
    }

    if (!userData.password) {
      return errorResponse(
        "Password di database tidak ditemukan untuk akun ini",
        500
      );
    }

    const isPasswordValid = await bcrypt.compare(
      passwordInput,
      userData.password
    );

    if (!isPasswordValid) {
      return errorResponse("Password salah", 401);
    }

    const role = String(userData.role ?? "").toLowerCase();

    const emailVerifiedAt =
      userData.emailVerifiedAt ?? userData.email_verified_at ?? null;

    // Hanya customer yang wajib verifikasi email.
    // Admin, manager, sales, kasir, trainer, karyawan, direktur, owner tetap bisa login biasa.
    if (role === "customer" && !emailVerifiedAt) {
      return errorResponse(
        "Email belum diverifikasi. Silakan verifikasi email terlebih dahulu.",
        403,
        {
          needEmailVerification: true,
          email: userData.email,
          role,
        }
      );
    }

    const token = jwt.sign(
      {
        id: userData.id,
        role,
        email: userData.email,
      },
      process.env.JWT_SECRET || "default_secret",
      {
        expiresIn: "7d",
      }
    );

    return successResponse({
      message: "Login berhasil",
      data: {
        token,
        user: serializeLoginUser(userData),
      },
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);
    return errorResponse("Login gagal", 500, error);
  }
}

export async function GET() {
  return Response.json({
    success: true,
    message: "Login route aktif",
    path: "/api/auth/login",
  });
}