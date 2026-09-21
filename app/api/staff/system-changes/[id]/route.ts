import { NextRequest } from "next/server";
import { SystemChange, SystemChangeItem } from "@/database/models";
import { sequelize } from "@/database/connection";
import { errorResponse, successResponse } from "@/lib/response";
import { requireAuth } from "@/lib/rbac";
import { logActivity, extractClientIp } from "@/lib/activity-logger";

export const runtime = "nodejs";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.success) {
      return errorResponse(auth.message, auth.statusCode);
    }

    const userRole = String(auth.user.role).toLowerCase();
    if (userRole !== "it") {
      return errorResponse("Akses ditolak. Hanya role IT yang berwenang mengubah catatan perubahan sistem.", 403);
    }

    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const { title, version, category, releasedAt, items } = body;

    const change = await SystemChange.findByPk(id);
    if (!change) {
      return errorResponse("Catatan perubahan sistem tidak ditemukan", 404);
    }

    const t = await sequelize.transaction();

    try {
      const updatePayload: Record<string, any> = {};
      if (title) updatePayload.title = String(title).trim();
      if (version) updatePayload.version = String(version).trim();
      if (category) updatePayload.category = String(category).trim();
      if (releasedAt) updatePayload.releasedAt = new Date(releasedAt);

      await change.update(updatePayload, { transaction: t });

      if (Array.isArray(items) && items.length > 0) {
        await SystemChangeItem.destroy({
          where: { systemChangeId: change.id },
          transaction: t,
        });

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          await SystemChangeItem.create(
            {
              systemChangeId: change.id,
              pointTitle: String(item.pointTitle ?? "").trim(),
              description: String(item.description ?? "").trim(),
              category:
                item.category && typeof item.category === "string"
                  ? item.category.trim()
                  : category && typeof category === "string"
                  ? category.trim()
                  : "Fitur Baru",
              orderIndex: Number(item.orderIndex ?? i + 1),
            },
            { transaction: t }
          );
        }
      }

      await t.commit();

      await logActivity({
        actorId: Number(auth.user.id),
        action: "UPDATE_SYSTEM_CHANGE",
        targetType: "system_change",
        targetId: change.id,
        description: `Memperbarui catatan sistem ${change.version}: "${change.title}"`,
        ipAddress: extractClientIp(request),
      });

      const updated = await SystemChange.findByPk(change.id, {
        include: [{ model: SystemChangeItem, as: "items" }],
      });

      return successResponse({
        message: "Catatan perubahan sistem berhasil diperbarui",
        data: updated,
      });
    } catch (txError) {
      await t.rollback();
      throw txError;
    }
  } catch (error) {
    console.error("PUT STAFF SYSTEM CHANGE ERROR:", error);
    return errorResponse("Gagal memperbarui catatan perubahan sistem", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.success) {
      return errorResponse(auth.message, auth.statusCode);
    }

    const userRole = String(auth.user.role).toLowerCase();
    if (userRole !== "it") {
      return errorResponse("Akses ditolak. Hanya role IT yang berwenang menghapus catatan perubahan sistem.", 403);
    }

    const { id } = await context.params;
    const change = await SystemChange.findByPk(id);

    if (!change) {
      return errorResponse("Catatan perubahan sistem tidak ditemukan", 404);
    }

    const changeTitle = change.title;
    const changeVersion = change.version;

    await change.destroy();

    await logActivity({
      actorId: Number(auth.user.id),
      action: "DELETE_SYSTEM_CHANGE",
      targetType: "system_change",
      targetId: Number(id),
      description: `Menghapus catatan pembaruan sistem ${changeVersion}: "${changeTitle}"`,
      ipAddress: extractClientIp(request),
    });

    return successResponse({
      message: "Catatan perubahan sistem berhasil dihapus",
    });
  } catch (error) {
    console.error("DELETE STAFF SYSTEM CHANGE ERROR:", error);
    return errorResponse("Gagal menghapus catatan perubahan sistem", 500);
  }
}
