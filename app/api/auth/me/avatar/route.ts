import { NextRequest, NextResponse } from "next/server";
import { User } from "@/database/models";
import { getTokenFromRequest, verifyToken } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/response";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";

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
    let ext = "png";

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await request.json();
      const photoDataUrl = String(body.photo ?? body.image ?? "").trim();

      if (!photoDataUrl) {
        return errorResponse("Foto base64 tidak ditemukan", 400);
      }

      if (!photoDataUrl.startsWith("data:image/")) {
        return errorResponse("Format foto harus base64 data URL", 400);
      }

      const match = photoDataUrl.match(/^data:image\/(\w+);base64,/);
      if (match) {
        ext = match[1];
      }

      const base64Data = photoDataUrl.replace(/^data:image\/\w+;base64,/, "");
      buffer = Buffer.from(base64Data, "base64");
    } else {
      const formData = await request.formData();
      const file = formData.get("photo") as File | null;

      if (!file) {
        return errorResponse("File foto tidak ditemukan dalam request", 400);
      }

      if (!file.type.startsWith("image/")) {
        return errorResponse("File harus berupa gambar", 400);
      }

      const bytes = await file.arrayBuffer();
      buffer = Buffer.from(bytes);
      ext = file.name.split(".").pop() || "png";
    }

    // Create uploads/users directory if not exists
    const uploadDir = path.join(process.cwd(), "public", "uploads", "users");
    try {
      await fs.access(uploadDir);
    } catch {
      await fs.mkdir(uploadDir, { recursive: true });
    }

    // Determine extension and filename
    const filename = `avatar_${user.id}_${Date.now()}.${ext}`;
    const filepath = path.join(uploadDir, filename);

    // Write file to disk
    await fs.writeFile(filepath, buffer);

    // Delete old avatar if exists
    if (user.photoUrl && user.photoUrl.startsWith("/uploads/users/")) {
      try {
        const oldFile = path.join(process.cwd(), "public", user.photoUrl);
        await fs.unlink(oldFile);
      } catch (e) {
        // Ignore if file doesn't exist
      }
    }

    const newPhotoUrl = `/uploads/users/${filename}`;
    
    // Update database
    user.photoUrl = newPhotoUrl;
    await user.save();

    return successResponse({
      message: "Foto profil berhasil diperbarui",
      data: { photoUrl: newPhotoUrl },
    });
  } catch (error) {
    console.error("PUT AVATAR ERROR:", error);
    return errorResponse("Gagal memperbarui foto profil", 500, error);
  }
}
