import { User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { sendEmailVerificationCode } from "@/lib/mail/verification";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

const OTP_EXPIRED_MINUTES = 5;
const RESEND_COOLDOWN_MINUTES = 5;

function generateOtpCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function getRemainingSeconds(lastSentAt: Date, cooldownMinutes: number) {
  const now = Date.now();
  const allowedAt = lastSentAt.getTime() + cooldownMinutes * 60 * 1000;
  const remainingMs = allowedAt - now;

  return Math.max(0, Math.ceil(remainingMs / 1000));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const oldEmail = String(body.oldEmail || "").trim().toLowerCase();
    const newEmail = String(body.newEmail || "").trim().toLowerCase();

    if (!oldEmail || !newEmail) {
      return errorResponse("Email lama dan email baru wajib diisi", 400);
    }

    if (oldEmail === newEmail) {
      return errorResponse("Email baru tidak boleh sama dengan email lama", 400);
    }

    const user = await User.findOne({
      where: {
        email: oldEmail,
      },
    });

    if (!user) {
      return errorResponse("User dengan email lama tidak ditemukan", 404);
    }

    if (user.emailVerifiedAt) {
      return errorResponse("Email akun ini sudah terverifikasi", 400);
    }

    if (user.emailVerificationLastSentAt) {
      const remainingSeconds = getRemainingSeconds(
        user.emailVerificationLastSentAt,
        RESEND_COOLDOWN_MINUTES
      );

      if (remainingSeconds > 0) {
        return errorResponse(
          `Belum bisa ganti email. Tunggu ${remainingSeconds} detik lagi.`,
          429,
          {
            remainingSeconds,
          }
        );
      }
    }

    const existingNewEmail = await User.findOne({
      where: {
        email: newEmail,
      },
    });

    if (existingNewEmail) {
      return errorResponse("Email baru sudah terdaftar", 409);
    }

    const otpCode = generateOtpCode();
    const otpHash = await bcrypt.hash(otpCode, 10);
    const now = new Date();

    user.email = newEmail;
    user.emailVerificationCodeHash = otpHash;
    user.emailVerificationExpiresAt = addMinutes(now, OTP_EXPIRED_MINUTES);
    user.emailVerificationLastSentAt = now;

    await user.save();

    await sendEmailVerificationCode({
      to: newEmail,
      name: user.name,
      code: otpCode,
    });

    return successResponse(
      {
        message:
          "Email berhasil diganti. Kode verifikasi baru sudah dikirim ke email baru.",
        data: {
          email: newEmail,
          expiresInSeconds: OTP_EXPIRED_MINUTES * 60,
          resendAfterSeconds: RESEND_COOLDOWN_MINUTES * 60,
        },
      },
      200
    );
  } catch (error) {
    return errorResponse("Ganti email verifikasi gagal", 500, error);
  }
}