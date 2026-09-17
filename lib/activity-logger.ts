import { ActivityLog } from "@/database/models";

export interface LogActivityParams {
  actorId?: number | null;
  action: string;
  targetType: string;
  targetId?: number | null;
  description: string;
  ipAddress?: string | null;
}

/**
 * Centralized Activity Logger untuk Audit Trail Enterprise.
 * Mencatat aktivitas sensitif (misal: mutasi akun, persetujuan pembayaran, perubahan izin)
 * secara aman tanpa menggagalkan flow utama jika terjadi error pencatatan.
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    // Sinkronisasi otomatis tabel activity_logs jika belum ada di database
    await ActivityLog.sync();

    await ActivityLog.create({
      actorId: params.actorId ?? null,
      action: params.action.trim().toUpperCase(),
      targetType: params.targetType.trim().toLowerCase(),
      targetId: params.targetId ?? null,
      description: params.description.trim(),
      ipAddress: params.ipAddress ?? null,
    });
  } catch (error) {
    console.error("LOG ACTIVITY ERROR:", error);
  }
}

export function extractClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return null;
}

