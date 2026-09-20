import { User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { logActivity, extractClientIp } from "@/lib/activity-logger";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";

interface ResetTokenPayload {
  userId: number;
  email: string;
  purpose: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const resetToken = String(body.resetToken || "").trim();
    const newPassword = String(body.newPassword || "");

    if (!resetToken || !newPassword) {
      return errorResponse("Reset token dan password baru wajib diisi", 400);
    }

    if (newPassword.length < 6) {
      return errorResponse("Password minimal 6 karakter", 400);
    }

    const secret = process.env.JWT_SECRET || "default_secret";

    let payload: ResetTokenPayload;
    try {
      payload = jwt.verify(resetToken, secret) as ResetTokenPayload;
    } catch {
      return errorResponse(
        "Sesi reset password tidak valid atau sudah kadaluarsa. Silakan ulang dari awal.",
        401
      );
    }

    if (payload.purpose !== "password_reset" || !payload.userId) {
      return errorResponse("Reset token tidak valid", 400);
    }

    const user = await User.findByPk(payload.userId);

    if (!user) {
      return errorResponse("User tidak ditemukan", 404);
    }

    // Hash new password securely
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    void logActivity({
      actorId: user.id,
      action: "PASSWORD_RESET_SUCCESS",
      targetType: "user",
      targetId: user.id,
      description: `Kata sandi akun ${user.email} berhasil diperbarui via Reset Password OTP`,
      ipAddress: extractClientIp(request),
    }).catch(() => {});

    return successResponse(
      {
        message: "Kata sandi Anda berhasil diperbarui. Silakan masuk menggunakan kata sandi baru.",
        data: {
          email: user.email,
        },
      },
      200
    );
  } catch (error) {
    return errorResponse("Reset password gagal", 500, error);
  }
}
