import { NextRequest } from "next/server";
import { Membership, User, MembershipPlan } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { requireFeature } from "@/lib/feature-permission";
import {
  syncMemberToGate,
  uploadMemberFaceToGate,
  readPhotoAsBase64,
  formatGateMemberId,
} from "@/lib/gate/gate_service";

export const runtime = "nodejs";

export async function POST(
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
      return errorResponse("Data membership tidak ditemukan", 404);
    }

    const plainMembership = membership.get({ plain: true }) as unknown as Record<string, unknown>;
    const user = plainMembership.user as Record<string, unknown> | undefined;
    const plan = plainMembership.plan as Record<string, unknown> | undefined;

    if (!user) {
      return errorResponse("Data user member tidak ditemukan", 404);
    }

    const memberStatus = String(plainMembership.memberStatus ?? plainMembership.member_status ?? "");
    const paymentStatus = String(plainMembership.paymentStatus ?? plainMembership.payment_status ?? "");

    if (memberStatus !== "active" || paymentStatus !== "paid") {
      return errorResponse(
        `Membership belum aktif / lunas (status: ${memberStatus}, bayar: ${paymentStatus}). Hanya member aktif yang dapat disinkronkan ke gate.`,
        400
      );
    }

    const photoUrl = user.photoUrl as string | null | undefined;
    if (!photoUrl) {
      return errorResponse(
        "Member belum memiliki foto wajah di profil. Minta member untuk upload foto wajah terlebih dahulu.",
        422
      );
    }

    const allowedRooms = [1];
    const roomQuotas: Record<string, number> = {};
    const pilatesSessions = Number(plan?.pilatesSessions ?? plan?.pilates_sessions ?? 0);
    if (pilatesSessions > 0) {
      allowedRooms.push(3);
      roomQuotas["3"] = pilatesSessions;
    }

    const syncRes = await syncMemberToGate({
      userId: Number(user.id),
      name: String(user.name ?? ""),
      phone: String(user.phone ?? ""),
      joinDate: (plainMembership.startedAt as Date) ?? new Date(),
      packageId: Number(plainMembership.planId ?? 1),
      allowedRooms,
      roomQuotas,
      status: "Aktif",
    });

    if (!syncRes.success) {
      return errorResponse(`Gagal mendaftarkan data member ke gate: ${syncRes.message}`, 502);
    }

    const photoBase64 = await readPhotoAsBase64(photoUrl);
    if (!photoBase64) {
      return errorResponse(
        "Member terdaftar di gate, tetapi foto wajah gagal dibaca untuk sinkronisasi biometrik.",
        500
      );
    }

    const faceRes = await uploadMemberFaceToGate(
      formatGateMemberId(Number(user.id)),
      photoBase64
    );

    if (!faceRes.success) {
      return errorResponse(
        `Data member aktif di gate, tetapi upload foto biometrik gagal: ${faceRes.message}`,
        502
      );
    }

    return successResponse({
      message: "Sinkronisasi ke SYSTEM FACE ID SWING GATE berhasil. Wajah dan akses ruangan member telah aktif di mesin gate.",
      data: {
        memberId: formatGateMemberId(Number(user.id)),
        allowedRooms,
        roomQuotas,
        gateSync: {
          memberSynced: true,
          faceSynced: true,
        },
      },
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Terjadi kesalahan internal saat sinkronisasi gate",
      500
    );
  }
}
