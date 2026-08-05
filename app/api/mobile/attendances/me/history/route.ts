import { NextRequest } from "next/server";
import { Op } from "sequelize";
import { Attendance, Membership, MembershipPlan } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = Number(searchParams.get("userId") ?? "");

    if (!userId) {
      return errorResponse("User ID tidak ditemukan.", 400);
    }

    // 1. Get all attendance history for this user
    const attendances = await Attendance.findAll({
      where: { userId },
      order: [["attendanceDate", "DESC"], ["id", "DESC"]],
    });
    console.log(`Found ${attendances.length} attendance records for user ${userId}`);

    // 2. Get all active memberships and plans
    const activeMemberships = await Membership.findAll({
      where: {
        userId,
        paymentStatus: "paid",
        memberStatus: {
          [Op.in]: ["active", "pending"],
        },
      },
      order: [
        ["createdAt", "DESC"],
        ["id", "DESC"],
      ],
    });

    const quotas = [];
    for (const mem of activeMemberships) {
      let qInfo = {
        hasActiveMembership: true,
        packageName: mem.packageName,
        totalSessions: 0,
        attendedSessions: 0,
        remainingSessions: 0,
        expiredAt: mem.expiredAt,
      };

      if (mem.planId) {
        const plan = await MembershipPlan.findByPk(mem.planId);
        if (plan) {
          const totalSessions = Number(plan.dataValues.personalTrainerSessions ?? (plan.dataValues as any).personal_trainer_sessions ?? 0) +
                                Number(plan.dataValues.pilatesSessions ?? (plan.dataValues as any).pilates_sessions ?? 0);
          qInfo.totalSessions = totalSessions;

          if (totalSessions > 0) {
            const attendanceCount = await Attendance.count({
              where: {
                userId,
                createdAt: {
                  [Op.gte]: mem.startedAt || mem.createdAt,
                },
              },
            });
            qInfo.attendedSessions = attendanceCount;
            qInfo.remainingSessions = Math.max(totalSessions - attendanceCount, 0);
          }
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
  } catch (error: any) {
    console.error("Fetch Attendance History Error:", error);
    return errorResponse("Gagal mengambil riwayat absensi.", 500);
  }
}
