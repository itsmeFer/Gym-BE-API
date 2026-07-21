import { User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { generateReferralCode } from "@/lib/referral";
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

    let existingUser = await User.findOne({
      where: { email },
    });

    if (existingUser?.emailVerifiedAt) {
      return errorResponse("Email sudah terdaftar", 409);
    }

    const existingPhone = await User.findOne({
      where: { phone },
    });

    if (existingPhone && existingPhone.id !== existingUser?.id) {
      if (existingPhone.emailVerifiedAt) {
        return errorResponse("No HP sudah terdaftar", 409);
      } else {
        // The phone is attached to a DIFFERENT unverified account.
        // We can safely delete this ghost account so the phone can be reused.
        await existingPhone.destroy();
      }
    }

    if (existingUser && !existingUser.emailVerifiedAt) {
      if (existingUser.emailVerificationLastSentAt) {
        const remainingSeconds = getRemainingSeconds(
          existingUser.emailVerificationLastSentAt,
          RESEND_COOLDOWN_MINUTES
        );

        if (remainingSeconds > 0) {
          return errorResponse(
            `Kode verifikasi sudah dikirim. Tunggu ${remainingSeconds} detik untuk kirim ulang.`,
            429,
            { remainingSeconds }
          );
        }
      }

      const otpCode = generateOtpCode();
      const otpHash = await bcrypt.hash(otpCode, 10);
      const now = new Date();

      existingUser.name = name;
      existingUser.phone = phone;
      existingUser.password = await bcrypt.hash(password, 10);
      existingUser.emailVerificationCodeHash = otpHash;
      existingUser.emailVerificationExpiresAt = addMinutes(
        now,
        OTP_EXPIRED_MINUTES
      );
      existingUser.emailVerificationLastSentAt = now;

      await existingUser.save();

      await sendEmailVerificationCode({
        to: email,
        name,
        code: otpCode,
      });

      return successResponse(
        {
          message:
            "Kode verifikasi baru berhasil dikirim ke email. Silakan cek inbox atau spam.",
          data: {
            email,
            expiresInSeconds: OTP_EXPIRED_MINUTES * 60,
            resendAfterSeconds: RESEND_COOLDOWN_MINUTES * 60,
            needEmailVerification: true,
          },
        },
        200
      );
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

    const otpCode = generateOtpCode();
    const otpHash = await bcrypt.hash(otpCode, 10);
    const now = new Date();

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

      emailVerifiedAt: null,
      emailVerificationCodeHash: otpHash,
      emailVerificationExpiresAt: addMinutes(now, OTP_EXPIRED_MINUTES),
      emailVerificationLastSentAt: now,
    });

    await sendEmailVerificationCode({
      to: email,
      name,
      code: otpCode,
    });

    return successResponse(
      {
        message:
          "Register berhasil. Kode verifikasi sudah dikirim ke email. Silakan cek inbox atau spam.",
        data: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          role: user.role,
          referralCode: user.referralCode,
          referredByCode: user.referredByCode,
          needEmailVerification: true,
          expiresInSeconds: OTP_EXPIRED_MINUTES * 60,
          resendAfterSeconds: RESEND_COOLDOWN_MINUTES * 60,
        },
      },
      201
    );
  } catch (error) {
    return errorResponse("Register gagal", 500, error);
  }
}