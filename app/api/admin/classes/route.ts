import { NextRequest } from "next/server";
import { Op } from "sequelize";
import { MembershipPlan, MembershipPlanSchedule, User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

import {
  initializeClassesFromPlans,
  computeSessionLabel,
  computeClassStatus,
} from "@/lib/classes-store";

export async function GET() {
  try {
    const classes = await initializeClassesFromPlans();

    const plansRaw = await MembershipPlan.findAll({
      where: { isActive: true },
      order: [["name", "ASC"]],
    });

    const formattedPlans = plansRaw.map((p) => {
      const plan: any = typeof p.toJSON === "function" ? p.toJSON() : p;
      const code = plan.packageCode || plan.package_code || "";
      const name = plan.name || plan.programName || "Paket Membership";

      let category = "Gym Class";
      if (name.toLowerCase().includes("pilates") || code.includes("PILATES")) {
        category = "Pilates";
      } else if (name.toLowerCase().includes("pt") || code.includes("PT")) {
        category = "Personal Trainer";
      } else if (name.toLowerCase().includes("strength")) {
        category = "Strength";
      } else if (name.toLowerCase().includes("cardio")) {
        category = "Cardio";
      }

      const pilatesSessions = Number(plan.pilatesSessions || plan.pilates_sessions || 0);
      const ptSessions = Number(plan.personalTrainerSessions || plan.personal_trainer_sessions || 0);
      const quota = pilatesSessions > 0 ? pilatesSessions : ptSessions > 0 ? ptSessions : 10;

      return {
        id: plan.id,
        name: name,
        programName: plan.programName || name,
        packageCode: code,
        category,
        price: plan.price || 0,
        durationDays: plan.durationDays || 30,
        quota,
      };
    });

    const trainers = await User.findAll({
      where: {
        role: {
          [Op.in]: ["trainer", "karyawan", "admin", "manager"],
        },
      },
      attributes: ["id", "name", "email", "phone", "role", "photoUrl"],
      order: [["name", "ASC"]],
    });

    const formattedTrainers = trainers.map((t) => ({
      id: t.id,
      name: t.name || t.email,
      role: t.role,
      photoUrl: t.photoUrl,
    }));

    return successResponse({
      message: "Data kelas, paket membership & trainer berhasil diambil",
      data: {
        classes,
        plans: formattedPlans,
        trainers: formattedTrainers,
      },
    });
  } catch (error) {
    console.error("GET ADMIN CLASSES ERROR:", error);
    return errorResponse("Gagal mengambil data kelas membership", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id,
      planId,
      title,
      category,
      time,
      endTime,
      room,
      quota,
      assignedPtNames,
      trainerId,
    } = body;

    let targetTrainerId: number | null = trainerId ? Number(trainerId) : null;
    if (!targetTrainerId && Array.isArray(assignedPtNames) && assignedPtNames.length > 0) {
      const firstPtName = assignedPtNames[0];
      const trainerUser = await User.findOne({
        where: { name: firstPtName },
      });
      if (trainerUser) {
        targetTrainerId = trainerUser.id;
      }
    }

    const finalStartTime = time || "08:00";
    const finalEndTime = endTime || "11:00";
    const sessionLabel = body.sessionLabel || computeSessionLabel(finalStartTime);

    if (id && !isNaN(Number(id))) {
      const existing = await MembershipPlanSchedule.findByPk(Number(id));
      if (existing) {
        await existing.update({
          planId: planId ? Number(planId) : existing.planId,
          trainerId: targetTrainerId !== null ? targetTrainerId : existing.trainerId,
          title: title || existing.title,
          category: category || existing.category,
          startTime: finalStartTime,
          endTime: finalEndTime,
          sessionLabel,
          room: room || existing.room,
          quota: quota !== undefined ? Number(quota) : existing.quota,
        });

        const updatedClasses = await initializeClassesFromPlans();
        const updatedItem = updatedClasses.find((c) => String(c.id) === String(id));

        return successResponse({
          message: "Kelas shift berhasil diperbarui di database PostgreSQL",
          data: updatedItem,
        });
      }
    }


    // Create new record in membership_plan_schedules
    const newSchedule = await MembershipPlanSchedule.create({
      planId: Number(planId || 1),
      trainerId: targetTrainerId,
      title: title || "Kelas Baru",
      category: category || "Gym Class",
      startTime: finalStartTime,
      endTime: finalEndTime,
      sessionLabel,
      room: room || "Main Gym Floor",
      quota: Number(quota) || 10,
      isActive: true,
    });

    const updatedClasses = await initializeClassesFromPlans();
    const createdItem = updatedClasses.find(
      (c) => String(c.id) === String(newSchedule.id)
    );

    return successResponse({
      message: "Kelas shift baru berhasil ditambahkan ke database PostgreSQL",
      data: createdItem,
    });
  } catch (error) {
    console.error("POST ADMIN CLASSES ERROR:", error);
    return errorResponse("Gagal menyimpan kelas", 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return errorResponse("Class ID wajib diisi", 400);
    }

    if (!isNaN(Number(id))) {
      await MembershipPlanSchedule.destroy({
        where: { id: Number(id) },
      });
    }

    await initializeClassesFromPlans();

    return successResponse({
      message: "Kelas shift berhasil dihapus dari database PostgreSQL",
      data: { id },
    });
  } catch (error) {
    console.error("DELETE ADMIN CLASSES ERROR:", error);
    return errorResponse("Gagal menghapus kelas shift", 500);
  }
}
