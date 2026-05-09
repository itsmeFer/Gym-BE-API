import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { errorResponse, successResponse } from "@/lib/response";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return errorResponse("File foto wajib dikirim", 400);
    }

    if (!file.type.startsWith("image/")) {
      return errorResponse("File harus berupa gambar", 400);
    }

    const maxSize = 5 * 1024 * 1024;

    if (file.size > maxSize) {
      return errorResponse("Ukuran foto maksimal 5MB", 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const extensionFromType = file.type.split("/")[1] || "jpg";
    const safeExtension =
      extensionFromType === "jpeg" ? "jpg" : extensionFromType;

    const fileName = `${randomUUID()}.${safeExtension}`;

    const uploadDir = path.join(
      process.cwd(),
      "public",
      "uploads",
      "membership"
    );

    await fs.mkdir(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, fileName);

    await fs.writeFile(filePath, buffer);

    const origin = new URL(request.url).origin;
    const imageUrl = `${origin}/uploads/membership/${fileName}`;

    return successResponse({
      message: "Foto membership berhasil diupload",
      data: {
        imageUrl,
      },
    });
  } catch (error) {
    console.error("UPLOAD ADMIN MEMBERSHIP IMAGE ERROR:", error);
    return errorResponse("Gagal upload foto membership", 500);
  }
}