import { User, Attendance } from "@/database/models";
import { Op } from "sequelize";

/**
 * Update user points berdasarkan total penalty dari attendance
 */
export async function updateUserPoints(userId: number): Promise<void> {
  if (!userId) return;

  try {
    // Hitung total penalty dari semua attendance user ini
    const attendances = await Attendance.findAll({
      where: { userId },
      attributes: ["pointPenalty"],
      raw: true,
    });

    const totalPenalty = attendances.reduce(
      (sum, att) => sum + (att.pointPenalty || 0),
      0
    );

    // Point awal adalah 100
    const currentPoints = Math.max(100 + totalPenalty, 0); // totalPenalty negatif, jadi ditambah

    // Update user points
    await User.update(
      { points: currentPoints },
      { where: { id: userId } }
    );

    console.log(
      `✅ User ${userId} points updated: ${currentPoints} (penalty: ${totalPenalty})`
    );
  } catch (error) {
    console.error("❌ Error updating user points:", error);
  }
}

/**
 * Kalkulasi point penalty berdasarkan keterlambatan
 */
export function calculatePointPenalty(
  lateMinutes: number,
  settings: {
    lateToleranceMinutes: number;
    penaltyIntervalMinutes: number;
    penaltyPointsPerInterval: number;
    maxLatePenaltyPoints: number;
  }
): number {
  if (lateMinutes <= settings.lateToleranceMinutes) {
    return 0; // Tidak ada penalty dalam toleransi
  }

  const excessMinutes = lateMinutes - settings.lateToleranceMinutes;
  const intervals = Math.ceil(excessMinutes / settings.penaltyIntervalMinutes);
  const penalty = intervals * settings.penaltyPointsPerInterval;

  // Cap maximum penalty
  const finalPenalty = Math.min(penalty, settings.maxLatePenaltyPoints);

  return -finalPenalty; // Negatif karena mengurangi point
}