import { NextRequest } from "next/server";
import { Op } from "sequelize";
import { Membership, MembershipPlan, User, PtSession } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import {
  CustomClass,
  initializeClassesFromPlans,
  getCustomClassesStore,
  computeSessionLabel,
  computeClassStatus,
  sortClassesSmart,
} from "@/lib/classes-store";

function toNumber(value: unknown, defaultValue = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

/**
 * GET /api/user/classes?userId=1
 *
 * Mengambil daftar kelas/sesi latihan HANYA untuk paket membership yang DIBELI & AKTIF oleh user,
 * serta menyertakan HANYA PT/Trainer yang bertugas di kelas tersebut.
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const userId = toNumber(url.searchParams.get("userId"), 0);

    if (!userId) {
      return errorResponse("User ID wajib dikirim", 400);
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return errorResponse("User tidak ditemukan", 404);
    }

    // 1. Ambil semua membership user yang PAID & tidak REVOKED
    const memberships = await Membership.findAll({
      where: {
        userId,
        paymentStatus: "paid",
        memberStatus: {
          [Op.in]: ["active", "pending"],
        },
      },
      include: [
        {
          model: MembershipPlan,
          as: "plan",
        },
      ],
      order: [["id", "DESC"]],
    });

    // Validasi keaktifan tanggal jika sudah diset
    const now = new Date();
    const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const activeMemberships = memberships.filter((m) => {
      const plain = m.get ? m.get({ plain: true }) : m;
      if (plain.memberStatus === "revoked") return false;

      if (plain.startedAt && plain.expiredAt) {
        const start = new Date(plain.startedAt);
        const exp = new Date(plain.expiredAt);

        const startOnly = new Date(
          start.getFullYear(),
          start.getMonth(),
          start.getDate()
        );
        const expOnly = new Date(
          exp.getFullYear(),
          exp.getMonth(),
          exp.getDate()
        );

        if (todayOnly < startOnly) return false; // belum mulai
        if (todayOnly > expOnly) return false; // sudah expired
      }

      return true;
    });

    if (activeMemberships.length === 0) {
      return successResponse({
        message: "User tidak memiliki paket membership aktif",
        data: {
          classes: [],
          activeMembershipsCount: 0,
        },
      });
    }

    // Ambil trainer khusus role 'trainer' sebagai fallback jika belum ada penugasan dari Admin
    const trainersOnly = await User.findAll({
      where: {
        role: "trainer",
      },
      attributes: ["id", "name", "email"],
      order: [["name", "ASC"]],
    });

    const trainerRoleNames = trainersOnly
      .map((t) => (t.name || t.email || "").trim())
      .filter(Boolean);

    // Ambil PT dari PT sessions user jika ada
    const ptSessions = await PtSession.findAll({
      where: { customerId: userId },
      include: [{ model: User, as: "trainer", attributes: ["id", "name", "email"] }],
    });

    const specificPtNames: string[] = [];
    for (const s of ptSessions) {
      const plain: any = s.get ? s.get({ plain: true }) : s;
      if (plain.trainer?.name) {
        specificPtNames.push(plain.trainer.name);
      }
    }

    // Initialize all master shifts from system
    await initializeClassesFromPlans();
    const allStoreClasses = getCustomClassesStore();

    const userClasses: CustomClass[] = [];
    const addedPlanIds = new Set<number | string>();

    // Collect classes matching user active plans
    for (const mem of activeMemberships) {
      const memData: any = mem.get ? mem.get({ plain: true }) : mem;
      const planId = memData.planId;
      const packageName = memData.packageName || memData.plan?.name || "Paket Membership";

      if (planId) {
        addedPlanIds.add(Number(planId));

        // Find matching store classes by planId
        const matched = allStoreClasses.filter(
          (c) => Number(c.planId) === Number(planId)
        );

        if (matched.length > 0) {
          userClasses.push(...matched);
        } else {
          // Dynamic fallback if no shift created in store for this planId
          let category = "Gym Class";
          const lowerName = packageName.toLowerCase();
          if (lowerName.includes("pilates")) category = "Pilates";
          else if (lowerName.includes("pt")) category = "Personal Trainer";

          userClasses.push({
            id: `class-${planId}-user-1`,
            planId: planId,
            title: packageName,
            packageCode: memData.plan?.packageCode || "MEMBERSHIP",
            category,
            price: memData.packagePrice || 0,
            durationDays: 30,
            time: "08:00",
            endTime: "09:00",
            room: category === "Pilates" ? "VIP Studio" : "Main Gym Floor",
            quota: 10,
            joined: 0,
            level: "VIP / Member",
            calories: "450",
            benefits: memData.plan?.benefits || [],
            assignedPtNames: [],
          });
        }
      } else {
        // Fallback matching by name
        const matchedByName = allStoreClasses.filter(
          (c) => c.title.toLowerCase() === packageName.toLowerCase()
        );
        if (matchedByName.length > 0) {
          userClasses.push(...matchedByName);
        }
      }
    }

    // Deduplicate by class id and strictly respect assignedPtNames set by Admin
    const uniqueUserClassesMap = new Map<string, CustomClass>();

    for (const cls of userClasses) {
      const copy = { ...cls };
      const { isClosed, statusText } = computeClassStatus(copy.time, copy.endTime);

      copy.sessionLabel = copy.sessionLabel || computeSessionLabel(copy.time);
      copy.isClosed = isClosed;
      copy.statusText = statusText;

      // High priority: If admin explicitly assigned PTs to this class, use ONLY those assigned PTs
      if (Array.isArray(copy.assignedPtNames) && copy.assignedPtNames.length > 0) {
        uniqueUserClassesMap.set(copy.id, copy);
      } else {
        // Fallback ONLY if Admin has not assigned any PT to this shift yet
        const fallbackPts: string[] = [];
        if (specificPtNames.length > 0) {
          fallbackPts.push(...specificPtNames);
        } else if (trainerRoleNames.length > 0) {
          fallbackPts.push(...trainerRoleNames);
        } else {
          fallbackPts.push("Coach Duty");
        }
        copy.assignedPtNames = Array.from(new Set(fallbackPts));
        uniqueUserClassesMap.set(copy.id, copy);
      }
    }

    return successResponse({
      message: "Data kelas member berhasil diambil",
      data: {
        classes: sortClassesSmart(Array.from(uniqueUserClassesMap.values())),
        activeMembershipsCount: activeMemberships.length,
      },
    });
  } catch (error) {
    console.error("GET USER CLASSES ERROR:", error);
    return errorResponse("Gagal mengambil data kelas member", 500);
  }
}
