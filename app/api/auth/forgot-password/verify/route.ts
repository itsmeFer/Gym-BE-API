import { User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { logActivity, extractClientIp } from "@/lib/activity-logger";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";

const RESET_TOKEN_EXPIRED_MINUTES = 10;

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const email = String(body.email || "").trim().toLowerCase();
    const code = String(body.code || "").trim();

    if (!email || !code) {
      return errorResponse("Email dan kode verifikasi wajib diisi", 400);
    }

    if (!/^\d{6}$/.test(code)) {
      return errorResponse("Kode verifikasi harus 6 digit angka", 400);
    }

    const user = await User.findOne({ where: { email } });

    if (!user) {
      return errorResponse("User tidak ditemukan", 404);
    }

    if (!user.emailVerificationCodeHash || !user.emailVerificationExpiresAt) {
      return errorResponse(
        "Kode verifikasi tidak ditemukan atau sudah digunakan. Silakan minta kode baru.",
        400
      );
    }

    const now = new Date();

    if (user.emailVerificationExpiresAt.getTime() < now.getTime()) {
      return errorResponse(
        "Kode verifikasi sudah kadaluarsa. Silakan minta kode baru.",
        400,
        { expired: true }
      );
    }

    const isCodeValid = await bcrypt.compare(
      code,
      user.emailVerificationCodeHash
    );

    if (!isCodeValid) {
      return errorResponse("Kode verifikasi salah. Silakan periksa kembali.", 400);
    }

    // Clear verification code so it cannot be reused
    user.emailVerificationCodeHash = null;
    user.emailVerificationExpiresAt = null;
    user.emailVerificationLastSentAt = null;
    await user.save();

    // Issue short-lived cryptographic reset token bound to this user
    const secret = process.env.JWT_SECRET || "default_secret";
    const resetToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        purpose: "password_reset",
      },
      secret,
      {
        expiresIn: `${RESET_TOKEN_EXPIRED_MINUTES}m`,
      }
    );

    void logActivity({
      actorId: user.id,
      action: "PASSWORD_RESET_OTP_VERIFIED",
      targetType: "user",
      targetId: user.id,
      description: `Kode OTP verifikasi reset password cocok untuk email: ${user.email}`,
      ipAddress: extractClientIp(request),
    }).catch(() => {});

    return successResponse(
      {
        message: "Kode verifikasi valid. Silakan buat kata sandi baru.",
        data: {
          resetToken,
          email: user.email,
          expiresInSeconds: RESET_TOKEN_EXPIRED_MINUTES * 60,
        },
      },
      200
    );
  } catch (error) {
    return errorResponse("Verifikasi kode reset password gagal", 500, error);
  }
}
