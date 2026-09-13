import { NextRequest } from "next/server";
import { User } from "@/database/models";
import { getTokenFromRequest, verifyToken } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/response";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_EXT: Record<string, string> = {
  jpeg: "jpg",
  jpg: "jpg",
  png: "png",
  webp: "webp",
};

export async function PUT(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);

    if (!token) {
      return errorResponse("Token tidak ditemukan", 401);
    }

    const payload = verifyToken(token);

    if (!payload) {
      return errorResponse("Token tidak valid atau expired", 401);
    }

    const user = await User.findByPk(payload.id);

    if (!user) {
      return errorResponse("User tidak ditemukan", 404);
    }

    let buffer: Buffer;
    let ext = "jpg";

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await request.json();
      const photoDataUrl = String(body.photo ?? body.image ?? "").trim();

      if (!photoDataUrl) {
        return errorResponse("Foto base64 tidak ditemukan", 400);
      }

      if (!photoDataUrl.startsWith("data:image/")) {
        return errorResponse("Format foto harus base64 data URL (data:image/...)", 400);
      }

      const mimeMatch = photoDataUrl.match(/^data:(image\/\w+);base64,/);
      if (!mimeMatch || !ALLOWED_MIME.includes(mimeMatch[1])) {
        return errorResponse("Format foto harus JPEG, PNG, atau WebP", 400);
      }

      const rawExt = mimeMatch[1].replace("image/", "");
      ext = ALLOWED_EXT[rawExt] ?? "jpg";

      const base64Data = photoDataUrl.replace(/^data:image\/\w+;base64,/, "");
      buffer = Buffer.from(base64Data, "base64");
    } else {
      const formData = await request.formData();
      const file = formData.get("photo") as File | null;

      if (!file) {
        return errorResponse("File foto tidak ditemukan dalam request", 400);
      }

      if (!ALLOWED_MIME.includes(file.type)) {
        return errorResponse("Format foto harus JPEG, PNG, atau WebP", 400);
      }

      const bytes = await file.arrayBuffer();
      buffer = Buffer.from(bytes);

      const rawExt = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      ext = ALLOWED_EXT[rawExt] ?? "jpg";
    }

    if (buffer.byteLength > MAX_BYTES) {
      return errorResponse("Ukuran foto maksimal 5MB", 400);
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads", "users");
    try {
      await fs.access(uploadDir);
    } catch {
      await fs.mkdir(uploadDir, { recursive: true });
    }

    const filename = `avatar_${user.id}_${Date.now()}.${ext}`;
    const filepath = path.join(uploadDir, filename);

    await fs.writeFile(filepath, buffer);

    if (user.photoUrl && user.photoUrl.startsWith("/uploads/users/")) {
      try {
        const oldFile = path.join(process.cwd(), "public", user.photoUrl);
        await fs.unlink(oldFile);
      } catch {
        // file lama tidak ada, abaikan
      }
    }

    const newPhotoUrl = `/uploads/users/${filename}`;
    user.photoUrl = newPhotoUrl;
    await user.save();

    return successResponse({
      message: "Foto profil berhasil diperbarui",
      data: { photoUrl: newPhotoUrl },
    });
  } catch (error) {
    console.error("PUT AVATAR ERROR:", error);
    return errorResponse("Gagal memperbarui foto profil", 500);
  }
}
