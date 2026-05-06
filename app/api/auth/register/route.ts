import { User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { generateReferralCode } from "@/lib/referral";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const referralCodeInput = body.referralCode
      ? String(body.referralCode).trim().toUpperCase()
      : null;

    if (!name || !phone || !email || !password) {
      return errorResponse("Nama, no HP, email, dan password wajib diisi", 400);
    }

    if (password.length < 6) {
      return errorResponse("Password minimal 6 karakter", 400);
    }

    const existingUser = await User.findOne({
      where: {
        email,
      },
    });

    if (existingUser) {
      return errorResponse("Email sudah terdaftar", 409);
    }

    const existingPhone = await User.findOne({
      where: {
        phone,
      },
    });

    if (existingPhone) {
      return errorResponse("No HP sudah terdaftar", 409);
    }

    let referredByUserId: number | null = null;
    let referredByCode: string | null = null;

    if (referralCodeInput) {
      const referrer = await User.findOne({
        where: {
          referralCode: referralCodeInput,
        },
      });

      if (!referrer) {
        return errorResponse("Kode referral tidak ditemukan", 404);
      }

      referredByUserId = referrer.id;
      referredByCode = referrer.referralCode;
    }

    let myReferralCode = generateReferralCode();

    while (
      await User.findOne({
        where: {
          referralCode: myReferralCode,
        },
      })
    ) {
      myReferralCode = generateReferralCode();
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      phone,
      email,
      password: hashedPassword,
      role: "customer",
      referralCode: myReferralCode,
      referredByCode,
      referredByUserId,
      isActive: true,
    });

    return successResponse(
      {
        message: "Register berhasil",
        data: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          role: user.role,
          referralCode: user.referralCode,
          referredByCode: user.referredByCode,
        },
      },
      201
    );
  } catch (error) {
    return errorResponse("Register gagal", 500, error);
  }
}