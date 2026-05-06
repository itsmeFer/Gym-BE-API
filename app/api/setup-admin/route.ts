import { User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

export async function GET() {
  try {
    const email = "admin@primagym.com";
    const phone = "080000000001";
    const password = "admin123";

    const existingAdmin = await User.findOne({
      where: { email },
    });

    if (existingAdmin) {
      return successResponse({
        message: "Akun admin sudah ada",
        data: {
          email,
          phone,
          password,
        },
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await User.create({
      name: "Admin Prima Gym",
      phone,
      email,
      password: hashedPassword,
      role: "admin",
      referralCode: "ADMIN-PRIMA",
      referredByCode: null,
      referredByUserId: null,
      isActive: true,
    });

    return successResponse({
      message: "Akun admin berhasil dibuat",
      data: {
        id: admin.id,
        name: admin.name,
        email,
        phone,
        password,
        role: admin.role,
      },
    });
  } catch (error) {
    return errorResponse("Gagal membuat akun admin", 500, error);
  }
}