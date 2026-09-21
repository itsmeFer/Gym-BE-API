import { NextRequest } from "next/server";
import { Op } from "sequelize";

import { sequelize } from "@/database/connection";
import { Membership, MembershipPlan, User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { buildMembershipAgreementPdf } from "@/lib/pdf/membershipAgreementPdf";
import { sendMembershipAgreementEmail } from "@/lib/mail/sendMembershipAgreementEmail";
import { requireFeature } from "@/lib/feature-permission";
import { logActivity, extractClientIp } from "@/lib/activity-logger";
import {
  syncMemberToGate,
  uploadMemberFaceToGate,
  readPhotoAsBase64,
  formatGateMemberId,
} from "@/lib/gate/gate_service";

export const runtime = "nodejs";

function toNumber(value: unknown, defaultValue = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function serializeUser(user: any) {
  if (!user) return null;

  const data = user?.get ? user.get({ plain: true }) : user;

  return {
    id: data?.id,
    name: data?.name ?? "",
    email: data?.email ?? "",
    phone: data?.phone ?? "",
    role: data?.role ?? "",
    isActive: data?.isActive ?? data?.is_active ?? true,
    photoUrl: data?.photoUrl ?? data?.photo_url ?? null,
  };
}

function serializePlan(plan: any) {
  if (!plan) return null;

  const data = plan?.get ? plan.get({ plain: true }) : plan;

  return {
    id: data?.id,
    programName: data?.programName ?? data?.program_name ?? "",
    customerCategory: data?.customerCategory ?? data?.customer_category ?? "",
    packageCode: data?.packageCode ?? data?.package_code ?? "",
    name: data?.name ?? "",
    description: data?.description ?? "",
    imageUrl: data?.imageUrl ?? data?.image_url ?? null,
    price: Number(data?.price ?? 0),
    durationDays: Number(data?.durationDays ?? data?.duration_days ?? 0),
    discountPercent: Number(
      data?.discountPercent ?? data?.discount_percent ?? 0
    ),
    personalTrainerSessions: Number(
      data?.personalTrainerSessions ?? data?.personal_trainer_sessions ?? 0
    ),
    pilatesSessions: Number(data?.pilatesSessions ?? data?.pilates_sessions ?? 0),
    freeMembershipDays: Number(
      data?.freeMembershipDays ?? data?.free_membership_days ?? 0
    ),
    benefits: Array.isArray(data?.benefits) ? data.benefits : [],
    isActive: data?.isActive ?? data?.is_active ?? true,
    createdAt: data?.createdAt ?? data?.created_at ?? null,
    updatedAt: data?.updatedAt ?? data?.updated_at ?? null,
  };
}

function serializePayment(membership: any) {
  const data = membership?.get ? membership.get({ plain: true }) : membership;

  return {
    id: data?.id,
    userId: data?.userId ?? data?.user_id,
    salesUserId: data?.salesUserId ?? data?.sales_user_id,
    processedByUserId: data?.processedByUserId ?? data?.processed_by_user_id,
    planId: data?.planId ?? data?.plan_id,

    packageName: data?.packageName ?? data?.package_name,
    packagePrice: Number(data?.packagePrice ?? data?.package_price ?? 0),

    paymentMethod: data?.paymentMethod ?? data?.payment_method,
    paymentStatus: data?.paymentStatus ?? data?.payment_status,
    paidAmount: Number(data?.paidAmount ?? data?.paid_amount ?? 0),
    paidAt: data?.paidAt ?? data?.paid_at,

    paymentProofPhoto:
      data?.paymentProofPhoto ?? data?.payment_proof_photo ?? null,

    memberStatus: data?.memberStatus ?? data?.member_status,
    salesStatus: data?.salesStatus ?? data?.sales_status ?? "pending",

    startedAt: data?.startedAt ?? data?.started_at,
    expiredAt: data?.expiredAt ?? data?.expired_at,

    notes: data?.notes,
    createdAt: data?.createdAt ?? data?.created_at,
    updatedAt: data?.updatedAt ?? data?.updated_at,

    user: serializeUser(data?.user),
    sales: serializeUser(data?.sales),
    processedBy: serializeUser(data?.processedBy),
    plan: serializePlan(data?.plan),
  };
}

async function findPaymentWithRelations(id: number) {
  return Membership.findByPk(id, {
    include: [
      {
        model: User,
        as: "user",
        attributes: [
          "id",
          "name",
          "email",
          "phone",
          "role",
          "isActive",
          "photoUrl",
        ],
      },
      {
        model: User,
        as: "sales",
        attributes: ["id", "name", "email", "phone", "role"],
        required: false,
      },
      {
        model: User,
        as: "processedBy",
        attributes: ["id", "name", "email", "phone", "role"],
        required: false,
      },
      {
        model: MembershipPlan,
        as: "plan",
        required: false,
      },
    ],
  });
}

function getPlainData(entity: any) {
  if (!entity) return null;
  return entity.get ? entity.get({ plain: true }) : entity;
}

/**
 * POST /api/admin/payments/:id/pay
 *
 * Proses pembayaran member oleh admin/kasir.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Zero Trust: Wajib autentikasi JWT dengan role kasir/admin/manager
    const auth = await requireFeature(
      request,
      ["admin.kasir", "kasir.verifikasi", "kasir.pembayaran", "manager.pembayaran"],
      ["admin", "kasir", "manager"]
    );
    if (!auth.success) {
      return errorResponse(auth.message, auth.statusCode);
    }

    const { id } = await context.params;
    const paymentId = toNumber(id, 0);

    if (!paymentId) {
      return errorResponse("ID pembayaran tidak valid", 400);
    }

    // Identitas kasir terikat secara kriptografis ke token JWT
    const resolvedAdminId = auth.user.id;
    const adminUser = auth.user;

    const body = await request.json().catch(() => ({}));

    const paidAmount = toNumber(body.paidAmount ?? body.paid_amount, 0);

    const paymentMethod = String(
      body.paymentMethod ?? body.payment_method ?? "cash"
    )
      .trim()
      .toLowerCase();

    const adminNote = body.adminNote ?? body.admin_note;
    const cleanAdminNote = adminNote ? String(adminNote).trim() : null;

    const paymentProofPhotoInput = String(
      body.paymentProofPhoto ?? body.payment_proof_photo ?? ""
    ).trim();

    if (!paidAmount || paidAmount <= 0) {
      return errorResponse("Nominal pembayaran wajib lebih dari 0", 400);
    }

    const allowedPaymentMethods = [
      "cash",
      "cashier",
      "transfer",
      "qris",
      "debit",
      "credit",
      "cashless",
    ];

    if (!allowedPaymentMethods.includes(paymentMethod)) {
      return errorResponse(
        "Metode pembayaran hanya boleh cash, transfer, qris, debit, credit, cashier, atau cashless",
        400
      );
    }

    const membership = await Membership.findByPk(paymentId);

    if (!membership) {
      return errorResponse("Data pembayaran tidak ditemukan", 404);
    }

    if (membership.paymentStatus === "paid") {
      return errorResponse("Pembayaran ini sudah lunas", 400);
    }

    if (membership.memberStatus === "active") {
      return errorResponse("Membership ini sudah aktif", 400);
    }

    // Admin tidak perlu upload bukti bayar lagi jika sudah diupload oleh sales
    const existingProof = String(membership.paymentProofPhoto ?? "").trim();
    const finalProofPhoto = paymentProofPhotoInput || existingProof;

    if (!finalProofPhoto) {
      return errorResponse(
        "Foto bukti pembayaran belum dilampirkan oleh sales maupun admin",
        400
      );
    }

    if (
      !finalProofPhoto.startsWith("[") &&
      !finalProofPhoto.startsWith("data:image/") &&
      !finalProofPhoto.startsWith("http://") &&
      !finalProofPhoto.startsWith("https://") &&
      !finalProofPhoto.startsWith("/uploads/") &&
      !finalProofPhoto.startsWith("uploads/")
    ) {
      return errorResponse("Format foto bukti pembayaran tidak valid", 400);
    }

    const memberUser = await User.findByPk(membership.userId);

    if (!memberUser) {
      return errorResponse("User member tidak ditemukan", 404);
    }

    // ponytail: gate foto wajah — enterprise anti-fraud, foto wajib sebelum aktivasi
    const memberPhotoUrl = String(memberUser.photoUrl ?? "").trim();
    if (!memberPhotoUrl) {
      return errorResponse(
        "Member belum upload foto wajah. Minta member untuk melengkapi profil terlebih dahulu.",
        422
      );
    }

    const memberEmail = String(memberUser.email ?? "").trim();

    if (!memberEmail) {
      return errorResponse("Email user member tidak tersedia", 400);
    }

    const plan = membership.planId
      ? await MembershipPlan.findByPk(membership.planId)
      : null;

    const planData = plan ? plan.get({ plain: true }) : null;

    // Server-authoritative: ambil harga resmi dari master paket di database
    const officialPackagePrice = Number(planData?.price ?? membership.packagePrice ?? 0);

    if (paidAmount < officialPackagePrice) {
      return errorResponse(
        `Nominal bayar kurang. Harga paket resmi Rp ${officialPackagePrice.toLocaleString("id-ID")}, dibayar Rp ${paidAmount.toLocaleString("id-ID")}`,
        400
      );
    }

    const durationDays = Math.max(Number(planData?.durationDays ?? 30), 1);

    const freeMembershipDays = Math.max(
      Number(planData?.freeMembershipDays ?? 0),
      0
    );

    const totalActiveDays = Math.max(durationDays + freeMembershipDays, 1);

    const startedAt = membership.startedAt
      ? new Date(membership.startedAt)
      : null;
    const expiredAt = membership.expiredAt
      ? new Date(membership.expiredAt)
      : null;
    const paidAt = new Date();

    const oldNotes = membership.notes ? String(membership.notes) : "";

    const activePeriodNote = `Masa aktif: ${durationDays} hari${
      freeMembershipDays > 0
        ? ` + free membership ${freeMembershipDays} hari`
        : ""
    } = total ${totalActiveDays} hari`;

    const mergedNote = cleanAdminNote
      ? `Catatan admin: ${cleanAdminNote}\n${activePeriodNote}`
      : activePeriodNote;

    const processedNote = `Diproses oleh admin: ${adminUser.email || `Staf #${adminUser.id}`}`;

    const newNotes = oldNotes
      ? `${oldNotes}\n\n${mergedNote}\n${processedNote}`
      : `${mergedNote}\n${processedNote}`;

    // 2. Transaksi Atomik & Anti-Double Payment (Race Condition Protection)
    const t = await sequelize.transaction();
    try {
      const [affectedRows] = await Membership.update(
        {
          paymentMethod,
          paymentStatus: "paid",
          paidAmount,
          paidAt: paidAt,
          paymentProofPhoto: finalProofPhoto,
          memberStatus: "active",
          salesStatus: "completed",
          startedAt,
          expiredAt,
          processedByUserId: resolvedAdminId,
          notes: newNotes,
        },
        {
          where: {
            id: paymentId,
            paymentStatus: { [Op.ne]: "paid" },
          },
          transaction: t,
        }
      );

      if (affectedRows === 0) {
        await t.rollback();
        return errorResponse(
          "Pembayaran ini sudah pernah diproses oleh kasir lain atau status sudah lunas",
          400
        );
      }

      await t.commit();
    } catch (dbError) {
      await t.rollback();
      throw dbError;
    }

    const freshPayment = await findPaymentWithRelations(membership.id);

    if (!freshPayment) {
      return errorResponse("Pembayaran berhasil, tetapi data terbaru gagal diambil", 500);
    }

    const freshData = getPlainData(freshPayment);
    const freshUser = freshData?.user;
    const freshPlan = freshData?.plan;

    const transactionCode = `PFC-${String(freshData?.id ?? membership.id).padStart(
      6,
      "0"
    )}`;

    let emailSent = false;
    let emailError: string | null = null;

    try {
      const pdfBuffer = await buildMembershipAgreementPdf({
        user: {
          id: freshUser?.id,
          name: freshUser?.name,
          email: freshUser?.email,
          phone: freshUser?.phone,
        },
        membership: {
          id: freshData?.id,
          packageName: freshData?.packageName ?? freshData?.package_name,
          packagePrice: freshData?.packagePrice ?? freshData?.package_price,
          paymentMethod: freshData?.paymentMethod ?? freshData?.payment_method,
          paymentStatus: freshData?.paymentStatus ?? freshData?.payment_status,
          paidAmount: freshData?.paidAmount ?? freshData?.paid_amount,
          paidAt: freshData?.paidAt ?? freshData?.paid_at,
          memberStatus: freshData?.memberStatus ?? freshData?.member_status,
          startedAt: freshData?.startedAt ?? freshData?.started_at,
          expiredAt: freshData?.expiredAt ?? freshData?.expired_at,
          notes: freshData?.notes,
        },
        plan: freshPlan
          ? {
            name: freshPlan?.name,
            programName: freshPlan?.programName ?? freshPlan?.program_name,
            packageCode: freshPlan?.packageCode ?? freshPlan?.package_code,
            durationDays: freshPlan?.durationDays ?? freshPlan?.duration_days,
            personalTrainerSessions:
              freshPlan?.personalTrainerSessions ??
              freshPlan?.personal_trainer_sessions,
            pilatesSessions:
              freshPlan?.pilatesSessions ?? freshPlan?.pilates_sessions,
            freeMembershipDays:
              freshPlan?.freeMembershipDays ??
              freshPlan?.free_membership_days,
            benefits: Array.isArray(freshPlan?.benefits)
              ? freshPlan.benefits
              : [],
          }
          : null,
      });

      await sendMembershipAgreementEmail({
        to: String(freshUser?.email ?? memberEmail),
        memberName: String(freshUser?.name ?? memberUser.name ?? "Member"),
        pdfBuffer,
        transactionCode,
      });

      emailSent = true;
    } catch (mailError) {
      console.error("SEND MEMBERSHIP PDF EMAIL ERROR:", mailError);
      emailSent = false;
      emailError =
        mailError instanceof Error
          ? mailError.message
          : "Gagal mengirim email PDF membership";
    }

    await logActivity({
      actorId: Number(resolvedAdminId),
      action: "PAYMENT_APPROVED",
      targetType: "membership",
      targetId: Number(paymentId),
      description: `Verifikasi pembayaran membership LUNAS Rp ${Number(paidAmount).toLocaleString('id-ID')} untuk member ${freshUser?.name ?? memberUser.name}`,
      ipAddress: extractClientIp(request),
    });

    let gateSyncResult = {
      synced: false,
      message: "Sinkronisasi gate belum dilakukan",
    };

    try {
      const allowedRooms = [1];
      const roomQuotas: Record<string, number> = {};
      const pilatesSessions = Number(freshPlan?.pilatesSessions ?? freshPlan?.pilates_sessions ?? 0);
      if (pilatesSessions > 0) {
        allowedRooms.push(3);
        roomQuotas["3"] = pilatesSessions;
      }

      const syncRes = await syncMemberToGate({
        userId: Number(memberUser.id),
        name: String(freshUser?.name ?? memberUser.name),
        phone: String(freshUser?.phone ?? memberUser.phone),
        joinDate: startedAt ?? new Date(),
        packageId: Number(membership.planId ?? 1),
        allowedRooms,
        roomQuotas,
        status: "Aktif",
      });

      if (syncRes.success) {
        const photoBase64 = await readPhotoAsBase64(memberPhotoUrl);
        if (photoBase64) {
          const faceRes = await uploadMemberFaceToGate(
            formatGateMemberId(Number(memberUser.id)),
            photoBase64
          );
          gateSyncResult = {
            synced: faceRes.success,
            message: faceRes.message,
          };
        } else {
          gateSyncResult = {
            synced: true,
            message: "Member aktif di gate, foto wajah tidak dapat dibaca untuk sync biometrik",
          };
        }
      } else {
        gateSyncResult = {
          synced: false,
          message: syncRes.message,
        };
      }
    } catch (gateErr) {
      gateSyncResult = {
        synced: false,
        message: gateErr instanceof Error ? gateErr.message : "Gagal terhubung ke gate",
      };
    }

    return successResponse({
      message: emailSent
        ? "Pembayaran berhasil diproses oleh admin. Membership sudah aktif dan PDF berhasil dikirim ke email user."
        : "Pembayaran berhasil diproses oleh admin. Membership sudah aktif, tetapi PDF gagal dikirim ke email user.",
      data: {
        payment: serializePayment(freshPayment),
        pdfEmail: {
          sent: emailSent,
          to: String(freshUser?.email ?? memberEmail),
          error: emailError,
        },
        gateSync: gateSyncResult,
      },
    });
  } catch (error) {
    console.error("PAY ADMIN PAYMENT ERROR:", error);

    return errorResponse("Gagal memproses pembayaran", 500);
  }
}