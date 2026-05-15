import { User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import bcrypt from "bcryptjs";

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

    const user = await User.findOne({
      where: {
        email,
      },
    });

    if (!user) {
      return errorResponse("User tidak ditemukan", 404);
    }

    if (user.emailVerifiedAt) {
      return successResponse(
        {
          message: "Email sudah terverifikasi",
          data: {
            id: user.id,
            email: user.email,
            verified: true,
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

    await user.save();

    return successResponse(
      {
        message: "Email berhasil diverifikasi. Silakan login.",
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          verified: true,
        },
      },
      200
    );
  } catch (error) {
    return errorResponse("Verifikasi email gagal", 500, error);
  }
}