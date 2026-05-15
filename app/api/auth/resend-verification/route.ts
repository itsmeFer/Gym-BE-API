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

    const email = String(body.email || "").trim().toLowerCase();

    if (!email) {
      return errorResponse("Email wajib diisi", 400);
    }

    const user = await User.findOne({
      where: {
        email,
      },
    });

    if (!user) {
      return errorResponse("User tidak ditemukan", 404);
    }

    if (user.emailVerifiedAt) {
      return errorResponse("Email sudah terverifikasi", 400);
    }

    if (user.emailVerificationLastSentAt) {
      const remainingSeconds = getRemainingSeconds(
        user.emailVerificationLastSentAt,
        RESEND_COOLDOWN_MINUTES
      );

      if (remainingSeconds > 0) {
        return errorResponse(
          `Belum bisa kirim ulang kode. Tunggu ${remainingSeconds} detik lagi.`,
          429,
          {
            remainingSeconds,
          }
        );
      }
    }

    const otpCode = generateOtpCode();
    const otpHash = await bcrypt.hash(otpCode, 10);
    const now = new Date();

    user.emailVerificationCodeHash = otpHash;
    user.emailVerificationExpiresAt = addMinutes(now, OTP_EXPIRED_MINUTES);
    user.emailVerificationLastSentAt = now;

    await user.save();

    await sendEmailVerificationCode({
      to: user.email,
      name: user.name,
      code: otpCode,
    });

    return successResponse(
      {
        message:
          "Kode verifikasi berhasil dikirim ulang. Silakan cek inbox atau spam.",
        data: {
          email: user.email,
          expiresInSeconds: OTP_EXPIRED_MINUTES * 60,
          resendAfterSeconds: RESEND_COOLDOWN_MINUTES * 60,
        },
      },
      200
    );
  } catch (error) {
    return errorResponse("Kirim ulang kode verifikasi gagal", 500, error);
  }
}