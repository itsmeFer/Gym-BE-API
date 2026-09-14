import bcrypt from "bcryptjs";
import { User } from "@/database/models";
import { getTokenFromRequest, verifyToken } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/response";
import { sendEmailVerificationCode } from "@/lib/mail/verification";

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
  const remainingMs =
    lastSentAt.getTime() + cooldownMinutes * 60 * 1000 - Date.now();
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

// POST /api/auth/me/change-email
// Dipakai dari halaman Edit Profil saat user sudah login (emailVerifiedAt boleh ada).
export async function POST(request: Request) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) return errorResponse("Token tidak ditemukan", 401);

    const payload = verifyToken(token);
    if (!payload) return errorResponse("Token tidak valid atau sudah expired", 401);

    const body = await request.json();
    const newEmail = String(body.newEmail || "").trim().toLowerCase();

    if (!newEmail) return errorResponse("Email baru wajib diisi", 400);

    const user = await User.findByPk(payload.id);
    if (!user) return errorResponse("User tidak ditemukan", 404);

    if (newEmail === user.email.toLowerCase()) {
      return errorResponse("Email baru tidak boleh sama dengan email saat ini", 400);
    }

    // Cooldown: cegah spam kirim OTP
    if (user.emailVerificationLastSentAt) {
      const remaining = getRemainingSeconds(
        user.emailVerificationLastSentAt,
        RESEND_COOLDOWN_MINUTES
      );
      if (remaining > 0) {
        return errorResponse(
          `Belum bisa ganti email. Tunggu ${remaining} detik lagi.`,
          429,
          { remainingSeconds: remaining }
        );
      }
    }

    // Pastikan email baru belum dipakai akun lain
    const conflict = await User.findOne({ where: { email: newEmail } });
    if (conflict) return errorResponse("Email baru sudah terdaftar", 409);

    const otpCode = generateOtpCode();
    const otpHash = await bcrypt.hash(otpCode, 10);
    const now = new Date();

    await sendEmailVerificationCode({ to: newEmail, name: user.name, code: otpCode });

    // Simpan email baru & reset status verifikasi sampai OTP dikonfirmasi
    user.email = newEmail;
    user.emailVerifiedAt = null;
    user.emailVerificationCodeHash = otpHash;
    user.emailVerificationExpiresAt = addMinutes(now, OTP_EXPIRED_MINUTES);
    user.emailVerificationLastSentAt = now;

    await user.save();

    return successResponse({
      message: "Kode OTP dikirim ke email baru. Verifikasi untuk menyelesaikan perubahan.",
      data: {
        email: newEmail,
        expiresInSeconds: OTP_EXPIRED_MINUTES * 60,
        resendAfterSeconds: RESEND_COOLDOWN_MINUTES * 60,
      },
    });
  } catch (error) {
    console.error("CHANGE EMAIL ERROR:", error);
    return errorResponse("Gagal mengirim kode ganti email", 500, error);
  }
}
