import bcrypt from "bcryptjs";
import { User } from "@/database/models";
import { getTokenFromRequest, verifyToken } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/response";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) return errorResponse("Token tidak ditemukan", 401);

    const payload = verifyToken(token);
    if (!payload) return errorResponse("Token tidak valid atau sudah expired", 401);

    const body = await request.json();
    const currentPassword = body.currentPassword?.toString() ?? "";
    const newPassword = body.newPassword?.toString() ?? "";

    if (!currentPassword || !newPassword) {
      return errorResponse("Password lama dan password baru wajib diisi", 400);
    }
    if (newPassword.length < 6) {
      return errorResponse("Password baru minimal 6 karakter", 400);
    }

    const user = await User.findByPk(payload.id);
    if (!user) return errorResponse("User tidak ditemukan", 404);

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return errorResponse("Password lama tidak sesuai", 401);
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return successResponse({ message: "Password berhasil diperbarui" });
  } catch (error) {
    console.error("CHANGE PASSWORD ERROR:", error);
    return errorResponse("Gagal mengubah password", 500, error);
  }
}
