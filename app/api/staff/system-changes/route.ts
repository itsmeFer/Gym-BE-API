import { NextRequest } from "next/server";
import { SystemChange, SystemChangeItem, User, UserSystemChangeRead } from "@/database/models";
import { sequelize } from "@/database/connection";
import { errorResponse, successResponse } from "@/lib/response";
import { requireAuth } from "@/lib/rbac";
import { logActivity, extractClientIp } from "@/lib/activity-logger";

export const runtime = "nodejs";

const ALL_STAFF_ROLES = [
  "admin",
  "manager",
  "owner",
  "direktur",
  "kasir",
  "sales",
  "trainer",
  "it",
  "karyawan",
];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.success) {
      return errorResponse(auth.message, auth.statusCode);
    }

    const userRole = String(auth.user.role).toLowerCase();
    if (!ALL_STAFF_ROLES.includes(userRole)) {
      return errorResponse("Akses ditolak. Menu ini hanya untuk staf internal.", 403);
    }

    // Auto-sync table if needed
    await SystemChange.sync();
    await SystemChangeItem.sync();
    await UserSystemChangeRead.sync();

    const changes = await SystemChange.findAll({
      include: [
        {
          model: SystemChangeItem,
          as: "items",
          attributes: ["id", "pointTitle", "description", "orderIndex"],
        },
        {
          model: User,
          as: "author",
          attributes: ["id", "name", "email", "role"],
          required: false,
        },
        {
          model: UserSystemChangeRead,
          as: "reads",
          where: { userId: auth.user.id },
          required: false,
          attributes: ["id", "readAt"],
        },
      ],
      order: [
        ["releasedAt", "DESC"],
        [{ model: SystemChangeItem, as: "items" }, "orderIndex", "ASC"],
      ],
    });

    const serialized = changes.map((c) => {
      const plain = c.get({ plain: true }) as Record<string, any>;
      const isRead = Array.isArray(plain.reads) && plain.reads.length > 0;
      delete plain.reads;
      return {
        ...plain,
        isRead,
      };
    });

    return successResponse({
      message: "Daftar perubahan sistem berhasil diambil",
      data: serialized,
    });
  } catch (error) {
    console.error("GET STAFF SYSTEM CHANGES ERROR:", error);
    return errorResponse("Gagal mengambil data perubahan sistem", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.success) {
      return errorResponse(auth.message, auth.statusCode);
    }

    const userRole = String(auth.user.role).toLowerCase();
    if (userRole !== "it") {
      return errorResponse("Akses ditolak. Hanya role IT yang berwenang mencatat perubahan sistem.", 403);
    }

    const body = await request.json().catch(() => ({}));
    const { title, version, category, releasedAt, items } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return errorResponse("Judul perubahan wajib diisi", 400);
    }

    if (!version || typeof version !== "string" || !version.trim()) {
      return errorResponse("Versi rilis wajib diisi (contoh: v1.1.0)", 400);
    }

    if (!Array.isArray(items) || items.length === 0) {
      return errorResponse("Minimal harus ada 1 poin perubahan pada rilis ini", 400);
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.pointTitle || typeof item.pointTitle !== "string" || !item.pointTitle.trim()) {
        return errorResponse(`Judul poin ke-${i + 1} wajib diisi`, 400);
      }
      if (!item.description || typeof item.description !== "string" || !item.description.trim()) {
        return errorResponse(`Deskripsi poin ke-${i + 1} wajib diisi`, 400);
      }
    }

    await SystemChange.sync();
    await SystemChangeItem.sync();

    const t = await sequelize.transaction();

    try {
      const authorUser = await User.findByPk(auth.user.id, { transaction: t });
      const authorName = authorUser?.name ?? "Tim IT Prima";

      const newChange = await SystemChange.create(
        {
          authorUserId: Number(auth.user.id),
          authorName,
          title: title.trim(),
          version: version.trim(),
          category: category && typeof category === "string" ? category.trim() : "General",
          releasedAt: releasedAt ? new Date(releasedAt) : new Date(),
        },
        { transaction: t }
      );

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        await SystemChangeItem.create(
          {
            systemChangeId: newChange.id,
            pointTitle: item.pointTitle.trim(),
            description: item.description.trim(),
            orderIndex: Number(item.orderIndex ?? i + 1),
          },
          { transaction: t }
        );
      }

      await t.commit();

      await logActivity({
        actorId: Number(auth.user.id),
        action: "CREATE_SYSTEM_CHANGE",
        targetType: "system_change",
        targetId: newChange.id,
        description: `Mencatat pembaruan sistem ${newChange.version}: "${newChange.title}" (${items.length} poin perubahan)`,
        ipAddress: extractClientIp(request),
      });

      const fullResult = await SystemChange.findByPk(newChange.id, {
        include: [{ model: SystemChangeItem, as: "items" }],
      });

      return successResponse(
        {
          message: "Catatan perubahan sistem berhasil disimpan",
          data: fullResult,
        },
        201
      );
    } catch (txError) {
      await t.rollback();
      throw txError;
    }
  } catch (error) {
    console.error("POST STAFF SYSTEM CHANGES ERROR:", error);
    return errorResponse("Gagal mencatat perubahan sistem", 500);
  }
}
