import { User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { logActivity, extractClientIp } from "@/lib/activity-logger";
import { sendPasswordResetOtpEmail } from "@/lib/mail/passwordReset";
import bcrypt from "bcryptjs";
import { Op } from "sequelize";

export const runtime = "nodejs";

const OTP_EXPIRED_MINUTES = 5;
const RESEND_COOLDOWN_MINUTES = 1;

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
    const identifier = String(body.identifier || body.email || "").trim().toLowerCase();

    if (!identifier) {
      return errorResponse("Email atau nomor HP wajib diisi", 400);
    }

    const user = await User.findOne({
      where: {
        [Op.or]: [
          { email: identifier },
          { phone: identifier },
        ],
      },
    });

    if (!user) {
      return errorResponse("Email atau nomor HP tidak terdaftar dalam sistem.", 404);
    }

    if (user.emailVerificationLastSentAt) {
      const remainingSeconds = getRemainingSeconds(
        user.emailVerificationLastSentAt,
        RESEND_COOLDOWN_MINUTES
      );

      if (remainingSeconds > 0) {
        return errorResponse(
          `Mohon tunggu ${remainingSeconds} detik sebelum meminta kode baru.`,
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

    await sendPasswordResetOtpEmail({
      to: user.email,
      name: user.name,
      code: otpCode,
    });

    user.emailVerificationCodeHash = otpHash;
    user.emailVerificationExpiresAt = addMinutes(now, OTP_EXPIRED_MINUTES);
    user.emailVerificationLastSentAt = now;

    await user.save();

    void logActivity({
      actorId: user.id,
      action: "PASSWORD_RESET_OTP_REQUESTED",
      targetType: "user",
      targetId: user.id,
      description: `Kode OTP reset password diminta untuk email: ${user.email}`,
      ipAddress: extractClientIp(request),
    }).catch(() => {});

    // Masked email for security display in UI, e.g. j***@gmail.com
    const parts = user.email.split("@");
    const namePart = parts[0];
    const domainPart = parts[1] || "";
    const maskedName = namePart.length > 2 
      ? namePart[0] + "***" + namePart[namePart.length - 1] 
      : namePart[0] + "***";
    const maskedEmail = `${maskedName}@${domainPart}`;

    return successResponse(
      {
        message: `Kode verifikasi telah dikirim ke email ${maskedEmail}.`,
        data: {
          email: user.email,
          maskedEmail,
          expiresInSeconds: OTP_EXPIRED_MINUTES * 60,
          resendAfterSeconds: RESEND_COOLDOWN_MINUTES * 60,
        },
      },
      200
    );
  } catch (error) {
    return errorResponse("Gagal memproses permintaan reset password", 500, error);
  }
}
