import { User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Op } from "sequelize";

export const runtime = "nodejs";

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

    const userData = user.get({ plain: true }) as {
      id: number;
      name: string;
      phone: string;
      email: string;
      password: string;
      role: string;
      referralCode: string;
      referredByCode: string | null;
      isActive: boolean;
    };

    if (userData.isActive === false) {
      return errorResponse("Akun kamu belum aktif atau sedang dinonaktifkan", 403);
    }

    if (!userData.password) {
      return errorResponse("Password di database tidak ditemukan untuk akun ini", 500);
    }

    const isPasswordValid = await bcrypt.compare(passwordInput, userData.password);

    if (!isPasswordValid) {
      return errorResponse("Password salah", 401);
    }

    const token = jwt.sign(
      {
        id: userData.id,
        role: userData.role,
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
        user: {
          id: userData.id,
          name: userData.name,
          phone: userData.phone,
          email: userData.email,
          role: userData.role,
          referralCode: userData.referralCode,
          referredByCode: userData.referredByCode,
          isActive: userData.isActive,
        },
      },
    });
  } catch (error) {
    return errorResponse("Login gagal", 500, error);
  }
}