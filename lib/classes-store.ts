import { MembershipPlan, MembershipPlanSchedule, User } from "@/database/models";

export interface CustomClass {
  id: string;
  planId: number | string;
  title: string;
  packageCode: string;
  category: string;
  price: number;
  durationDays: number;
  time: string;
  endTime: string;
  sessionLabel?: string; // Pagi | Siang | Sore | Malam
  room: string;
  quota: number;
  joined: number;
  level: string;
  calories: string;
  benefits: any[];
  assignedPtNames: string[];
  trainerId?: number | null;
  isClosed?: boolean;
  statusText?: string;
}

let customClassesStore: CustomClass[] = [];
let isStoreInitialized = false;

export function computeSessionLabel(time: string): string {
  const clean = String(time || "").trim().slice(0, 5);
  const hour = Number(clean.split(":")[0]);
  if (!Number.isFinite(hour)) return "Pagi";
  if (hour >= 5 && hour < 11) return "Pagi";
  if (hour >= 11 && hour < 15) return "Siang";
  if (hour >= 15 && hour < 18) return "Sore";
  return "Malam";
}

export function computeClassStatus(time: string, endTime: string) {
  const getJakartaTimeString = () =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());

  const timeToMinutes = (val: string) => {
    const clean = String(val || "").trim().slice(0, 5);
    const [h, m] = clean.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
    return h * 60 + m;
  };

  const nowMinutes = timeToMinutes(getJakartaTimeString());
  const startMinutes = timeToMinutes(time);
  const endMinutes = timeToMinutes(endTime);

  const isClosed = nowMinutes > endMinutes;
  let statusText = "Sesi Berlangsung";
  if (isClosed) {
    statusText = "Closed / Selesai";
  } else if (nowMinutes < startMinutes - 30) {
    statusText = "Belum Dibuka";
  }

  return { isClosed, statusText };
}

export async function initializeClassesFromPlans(): Promise<CustomClass[]> {
  try {
    let dbSchedules = await MembershipPlanSchedule.findAll({
      where: { isActive: true },
      include: [
        { model: MembershipPlan, as: "plan" },
        { model: User, as: "trainer" },
      ],
      order: [["id", "ASC"]],
    });

    if (dbSchedules.length === 0) {
      // Seed default schedules from MembershipPlans into database pivot table
      const plans = await MembershipPlan.findAll({ order: [["id", "ASC"]] });
      for (const p of plans) {
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

        await MembershipPlanSchedule.create({
          planId: plan.id,
          trainerId: null,
          title: name,
          category,
          startTime: "08:00",
          endTime: "11:00",
          sessionLabel: "Pagi",
          room: category === "Pilates" ? "VIP Studio" : "Main Gym Floor",
          quota,
          isActive: true,
        });
      }

      dbSchedules = await MembershipPlanSchedule.findAll({
        where: { isActive: true },
        include: [
          { model: MembershipPlan, as: "plan" },
          { model: User, as: "trainer" },
        ],
        order: [["id", "ASC"]],
      });
    }

    const formatted: CustomClass[] = dbSchedules.map((s) => {
      const schedule: any = typeof s.toJSON === "function" ? s.toJSON() : s;
      const plan = schedule.plan || {};
      const trainer = schedule.trainer || {};
      const startTime = schedule.startTime || schedule.start_time || "08:00";
      const endTime = schedule.endTime || schedule.end_time || "11:00";
      const sessionLabel = schedule.sessionLabel || schedule.session_label || computeSessionLabel(startTime);
      const { isClosed, statusText } = computeClassStatus(startTime, endTime);

      const assignedPtNames: string[] = [];
      if (trainer.name) {
        assignedPtNames.push(trainer.name);
      }

      return {
        id: String(schedule.id),
        planId: schedule.planId,
        title: schedule.title || plan.name || "Kelas Gym",
        packageCode: plan.packageCode || "CUSTOM",
        category: schedule.category || "Gym Class",
        price: plan.price || 0,
        durationDays: plan.durationDays || 30,
        time: startTime,
        endTime: endTime,
        sessionLabel,
        room: schedule.room || "Main Gym Floor",
        quota: Number(schedule.quota || 10),
        joined: 0,
        level: "VIP / Member",
        calories: "450",
        benefits: Array.isArray(plan.benefits)
          ? plan.benefits
          : typeof plan.benefits === "string"
            ? JSON.parse(plan.benefits)
            : [],
        assignedPtNames,
        trainerId: schedule.trainerId,
        isClosed,
        statusText,
      };
    });

    const sorted = sortClassesSmart(formatted);
    customClassesStore = sorted;
    isStoreInitialized = true;
    return sorted;
  } catch (error) {
    console.error("initializeClassesFromPlans error:", error);
    return customClassesStore;
  }
}

export function sortClassesSmart(classes: CustomClass[]): CustomClass[] {
  const timeToMinutes = (val: string) => {
    const clean = String(val || "").trim().slice(0, 5);
    const [h, m] = clean.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
    return h * 60 + m;
  };

  const getJakartaTimeMinutes = () => {
    const now = new Date();
    const jakartaStr = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
    return timeToMinutes(jakartaStr);
  };

  const nowMinutes = getJakartaTimeMinutes();

  return [...classes].sort((a, b) => {
    const isClosedA = a.isClosed === true;
    const isClosedB = b.isClosed === true;

    // 1. Available classes (!isClosed) MUST come before Closed classes (isClosed)
    if (isClosedA !== isClosedB) {
      return isClosedA ? 1 : -1;
    }

    const startA = timeToMinutes(a.time);
    const startB = timeToMinutes(b.time);

    // 2. If both are available, sort by closest time relative to current time
    if (!isClosedA) {
      const diffA = startA <= nowMinutes ? -1 : startA - nowMinutes;
      const diffB = startB <= nowMinutes ? -1 : startB - nowMinutes;
      return diffA - diffB;
    }

    // 3. If both are closed, sort by start time ascending
    return startA - startB;
  });
}

export function getCustomClassesStore(): CustomClass[] {
  return customClassesStore;
}

export function setCustomClassesStore(store: CustomClass[]) {
  customClassesStore = store;
  isStoreInitialized = true;
}
