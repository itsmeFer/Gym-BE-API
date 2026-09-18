import { User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { logActivity, extractClientIp } from "@/lib/activity-logger";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";

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

    // Cari user berdasarkan pendingEmail (flow ganti email profil) atau email biasa (flow register)
    const user =
      (await User.findOne({ where: { pendingEmail: email } })) ??
      (await User.findOne({ where: { email } }));

    if (!user) {
      return errorResponse("User tidak ditemukan", 404);
    }

    // Jika sudah verified DAN tidak ada pendingEmail, berarti tidak perlu verifikasi lagi
    if (user.emailVerifiedAt && !user.pendingEmail) {
      const role = String(user.role ?? "customer").toLowerCase();
      const token = jwt.sign(
        {
          id: user.id,
          role,
          email: user.email,
        },
        process.env.JWT_SECRET || "default_secret",
        {
          expiresIn: "7d",
        }
      );

      return successResponse(
        {
          message: "Email sudah terverifikasi",
          data: {
            id: user.id,
            name: user.name,
            email: user.email,
            role,
            verified: true,
            token,
          },
        },
        200
      );
    }

    if (!user.emailVerificationCodeHash || !user.emailVerificationExpiresAt) {
      return errorResponse(
        "Kode verifikasi tidak tersedia. Silakan kirim ulang kode.",
        400
      );
    }

    const now = new Date();

    if (user.emailVerificationExpiresAt.getTime() < now.getTime()) {
      return errorResponse(
        "Kode verifikasi sudah expired. Silakan kirim ulang kode.",
        400,
        {
          expired: true,
        }
      );
    }

    const isCodeValid = await bcrypt.compare(
      code,
      user.emailVerificationCodeHash
    );

    if (!isCodeValid) {
      return errorResponse("Kode verifikasi salah", 400);
    }

    user.emailVerifiedAt = now;
    user.emailVerificationCodeHash = null;
    user.emailVerificationExpiresAt = null;
    user.emailVerificationLastSentAt = null;

    // Jika ada pendingEmail (dari flow ganti email profil), selesaikan pergantian email
    if (user.pendingEmail) {
      user.email = user.pendingEmail;
      user.pendingEmail = null;
    }

    await user.save();

    const role = String(user.role ?? "customer").toLowerCase();

    const token = jwt.sign(
      {
        id: user.id,
        role,
        email: user.email,
      },
      process.env.JWT_SECRET || "default_secret",
      {
        expiresIn: "7d",
      }
    );

    void logActivity({
      actorId: user.id,
      action: "EMAIL_VERIFIED",
      targetType: "user",
      targetId: user.id,
      description: `Email ${email} berhasil diverifikasi`,
      ipAddress: extractClientIp(request),
    }).catch(() => {});

    return successResponse(
      {
        message: "Email berhasil diverifikasi.",
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          role,
          verified: true,
          token,
        },
      },
      200
    );
  } catch (error) {
    return errorResponse("Verifikasi email gagal", 500, error);
  }
}