import { NextRequest } from "next/server";
import { Op } from "sequelize";
import { Membership, User, MembershipPlan } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { requireFeature } from "@/lib/feature-permission";
import { logActivity, extractClientIp } from "@/lib/activity-logger";
import { syncMemberToGate } from "@/lib/gate/gate_service";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireFeature(
      request,
      ["admin.member", "manager.member"],
      ["admin", "kasir", "manager"]
    );
    if (!auth.success) {
      return errorResponse(auth.message, auth.statusCode);
    }

    const { id } = await context.params;

    const membership = await Membership.findOne({
      where: {
        id,
        memberStatus: {
          [Op.notIn]: ["revoke", "revoked"],
        },
      },
      include: [
        {
          model: User,
          as: "user",
          attributes: [
            "id",
            "name",
            "phone",
            "email",
            "role",
            "points",
            "maxPoints",
          ],
        },
        {
          model: User,
          as: "sales",
          attributes: ["id", "name", "phone", "email", "role"],
          required: false,
        },
        {
          model: MembershipPlan,
          as: "plan",
          required: false,
        },
      ],
    });

    if (!membership) {
      return errorResponse("Membership tidak ditemukan atau sudah revoke", 404);
    }

    return successResponse({
      message: "Detail membership berhasil diambil",
      data: membership,
    });
  } catch (error) {
    console.error("GET ADMIN MEMBERSHIP DETAIL ERROR:", error);

    return errorResponse("Gagal mengambil detail membership", 500);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireFeature(
      request,
      ["admin.member", "manager.member"],
      ["admin", "manager"]
    );
    if (!auth.success) {
      return errorResponse(auth.message, auth.statusCode);
    }

    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const { startedAt, expiredAt, notes } = body;

    let startDate: Date | null = null;
    let expireDate: Date | null = null;

    if (startedAt && expiredAt) {
      startDate = new Date(startedAt);
      expireDate = new Date(expiredAt);

      if (isNaN(startDate.getTime()) || isNaN(expireDate.getTime())) {
        return errorResponse("Format tanggal tidak valid", 400);
      }

      if (expireDate < startDate) {
        return errorResponse("Tanggal expired tidak boleh lebih awal dari tanggal mulai", 400);
      }
    } else if (startedAt || expiredAt) {
      return errorResponse("Tanggal mulai dan tanggal expired harus keduanya diisi atau keduanya dikosongkan", 400);
    }

    const membership = await Membership.findByPk(id, {
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "name", "phone", "email", "role", "photoUrl"],
        },
        {
          model: MembershipPlan,
          as: "plan",
          required: false,
        },
      ],
    });

    if (!membership) {
      return errorResponse("Membership tidak ditemukan", 404);
    }

    const currentStatus = String(membership.memberStatus ?? "").toLowerCase();
    if (currentStatus === "revoke" || currentStatus === "revoked") {
      return errorResponse("Membership yang berstatus revoke tidak dapat diubah masa aktifnya", 400);
    }

    const oldStarted = membership.startedAt
      ? new Date(membership.startedAt).toISOString().split("T")[0]
      : "belum diset";
    const oldExpired = membership.expiredAt
      ? new Date(membership.expiredAt).toISOString().split("T")[0]
      : "belum diset";
    const newStarted = startDate ? startDate.toISOString().split("T")[0] : "belum di-set oleh member";
    const newExpired = expireDate ? expireDate.toISOString().split("T")[0] : "belum di-set oleh member";

    const actorName = (auth.user as any)?.name ?? auth.user?.email ?? "Admin";
    const nowStr = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    const changeNote = `[Masa aktif diubah oleh ${actorName} pada ${nowStr}: Mulai ${oldStarted} -> ${newStarted}, Expired ${oldExpired} -> ${newExpired}${
      notes ? ` | Alasan: ${String(notes).trim()}` : ""
    }]`;

    const oldNotes = membership.notes ? String(membership.notes) : "";
    const updatedNotes = oldNotes ? `${oldNotes}\n${changeNote}` : changeNote;

    await membership.update({
      startedAt: startDate,
      expiredAt: expireDate,
      userScheduleSet: startDate !== null,
      notes: updatedNotes,
    });

    await logActivity({
      actorId: Number(auth.user.id),
      action: "UPDATE_MEMBERSHIP_DATES",
      targetType: "membership",
      targetId: Number(id),
      description: `Mengubah masa aktif membership #${id} (${membership.packageName}): Mulai ${oldStarted} -> ${newStarted}, Expired ${oldExpired} -> ${newExpired}`,
      ipAddress: extractClientIp(request),
    });

    let gateSync = null;
    if (currentStatus === "active") {
      try {
        const plainMembership = membership.get({ plain: true }) as any;
        const plainUser = plainMembership?.user;
        const plainPlan = plainMembership?.plan;

        if (plainUser) {
          const allowedRooms = [1];
          const roomQuotas: Record<string, number> = {};
          const pilatesSessions = Number(plainPlan?.pilatesSessions ?? plainPlan?.pilates_sessions ?? 0);
          if (pilatesSessions > 0) {
            allowedRooms.push(3);
            roomQuotas["3"] = pilatesSessions;
          }

          gateSync = await syncMemberToGate({
            userId: Number(plainUser.id),
            name: String(plainUser.name),
            phone: String(plainUser.phone),
            joinDate: startDate ?? new Date(),
            packageId: Number(membership.planId ?? 1),
            allowedRooms,
            roomQuotas,
            status: "Aktif",
          });
        }
      } catch (gateErr) {
        console.error("GATE SYNC UPDATE ERROR:", gateErr);
      }
    }

    return successResponse({
      message: "Masa aktif membership berhasil diperbarui",
      data: {
        id: membership.id,
        startedAt: membership.startedAt,
        expiredAt: membership.expiredAt,
        notes: membership.notes,
        gateSync,
      },
    });
  } catch (error) {
    console.error("PATCH ADMIN MEMBERSHIP DATES ERROR:", error);
    return errorResponse("Gagal memperbarui masa aktif membership", 500);
  }
}