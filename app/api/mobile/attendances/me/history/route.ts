import { NextRequest } from "next/server";
import { Op } from "sequelize";
import { Attendance, Membership, MembershipPlan } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { requireAuth } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.success) {
      return errorResponse(auth.message, auth.statusCode);
    }

    const { searchParams } = new URL(request.url);
    const queryUserId = Number(searchParams.get("userId") ?? "");

    const requesterRole = String(auth.user.role || "").toLowerCase();
    const isStaff = ["admin", "owner", "direktur", "manager", "sales"].includes(requesterRole);

    const targetUserId = queryUserId > 0 ? queryUserId : auth.user.id;

    if (targetUserId !== auth.user.id && !isStaff) {
      return errorResponse(
        "Akses ditolak: Anda tidak berhak melihat riwayat absensi pengguna lain.",
        403
      );
    }

    // 1. Get all attendance history for this user
    const attendances = await Attendance.findAll({
      where: { userId: targetUserId },
      order: [["attendanceDate", "DESC"], ["id", "DESC"]],
    });

    // 2. Get all active memberships and plans
    const activeMemberships = await Membership.findAll({
      where: {
        userId: targetUserId,
        paymentStatus: "paid",
        memberStatus: {
          [Op.in]: ["active", "pending"],
        },
      },
      include: [
        {
          model: MembershipPlan,
          as: "plan",
          required: false,
        },
      ],
      order: [
        ["createdAt", "DESC"],
        ["id", "DESC"],
      ],
    });

    const quotas = [];
    for (const mem of activeMemberships) {
      const plainMem = mem.get({ plain: true }) as unknown as Record<string, unknown>;
      const plan = plainMem.plan as Record<string, unknown> | null;

      const qInfo = {
        hasActiveMembership: true,
        packageName: plainMem.packageName as string,
        totalSessions: 0,
        attendedSessions: 0,
        remainingSessions: 0,
        expiredAt: plainMem.expiredAt as Date | string | null,
      };

      if (plan) {
        const totalSessions =
          Number(plan.personalTrainerSessions ?? plan.personal_trainer_sessions ?? 0) +
          Number(plan.pilatesSessions ?? plan.pilates_sessions ?? 0);
        qInfo.totalSessions = totalSessions;

        if (totalSessions > 0) {
          const attendanceCount = await Attendance.count({
            where: {
              userId: targetUserId,
              createdAt: {
                [Op.gte]: (plainMem.startedAt || plainMem.createdAt) as Date,
              },
            },
          });
          qInfo.attendedSessions = attendanceCount;
          qInfo.remainingSessions = Math.max(totalSessions - attendanceCount, 0);
        }
      }
      quotas.push(qInfo);
    }

    const defaultEmptyQuota = {
      hasActiveMembership: false,
      packageName: "Tidak ada paket aktif",
      totalSessions: 0,
      attendedSessions: 0,
      remainingSessions: 0,
      expiredAt: null as Date | null,
    };

    return successResponse({
      quota: quotas[0] || defaultEmptyQuota,
      quotas: quotas.length > 0 ? quotas : [defaultEmptyQuota],
      history: attendances,
    });
  } catch (error) {
    console.error("Fetch Attendance History Error:", error);
    return errorResponse("Gagal mengambil riwayat absensi.", 500);
  }
}
