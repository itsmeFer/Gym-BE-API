import fs from "node:fs/promises";
import path from "node:path";

interface SyncMemberParams {
  userId: number;
  name: string;
  phone: string;
  joinDate?: string | Date;
  packageId?: number;
  allowedRooms?: number[];
  roomQuotas?: Record<string, number>;
  status?: "Pending" | "Terbayar" | "Aktif" | "Expired" | "Non-Aktif";
}

interface GateResult<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}

function getGateConfig() {
  const baseUrl = (process.env.GATE_API_URL || "http://192.168.1.10:8889").replace(/\/+$/, "");
  const apiKey = process.env.GATE_API_KEY || "prima_0f0c35614f6577ce78c8cbbee7243e955de738fc47c59cfc3c2a50bee7d7e28d";
  return { baseUrl, apiKey };
}

export function formatGateMemberId(userId: number): string {
  return `PF${String(userId).padStart(6, "0")}`;
}

export async function readPhotoAsBase64(photoUrl: string | null | undefined): Promise<string | null> {
  if (!photoUrl) return null;

  const trimmed = photoUrl.trim();
  if (trimmed.startsWith("data:image/")) {
    return trimmed;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const response = await fetch(trimmed);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      const contentType = response.headers.get("content-type") || "image/jpeg";
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      return `data:${contentType};base64,${base64}`;
    } catch {
      return null;
    }
  }

  try {
    const cleanPath = trimmed.replace(/^\/+/, "");
    const filePath = path.join(process.cwd(), "public", cleanPath);
    const fileBuffer = await fs.readFile(filePath);
    const ext = path.extname(cleanPath).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${fileBuffer.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function syncMemberToGate(params: SyncMemberParams): Promise<GateResult> {
  const { baseUrl, apiKey } = getGateConfig();
  const memberId = formatGateMemberId(params.userId);

  const formattedJoinDate = params.joinDate
    ? new Date(params.joinDate).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  const payload = {
    id: memberId,
    name: params.name,
    phone: params.phone,
    packageId: params.packageId ?? 1,
    joinDate: formattedJoinDate,
    username: memberId,
    status: params.status ?? "Aktif",
    allowedRooms: params.allowedRooms ?? [1],
    roomQuotas: params.roomQuotas ?? {},
  };

  try {
    const postRes = await fetch(`${baseUrl}/api/integration/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PRIMA-API-Key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (postRes.ok) {
      const data = await postRes.json().catch(() => ({}));
      return { success: true, message: "Member berhasil didaftarkan ke gate", data };
    }

    if (postRes.status === 409 || postRes.status === 400) {
      const putRes = await fetch(`${baseUrl}/api/integration/members/${memberId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-PRIMA-API-Key": apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (putRes.ok) {
        const data = await putRes.json().catch(() => ({}));
        return { success: true, message: "Data member di gate berhasil diperbarui", data };
      }
    }

    const errText = await postRes.text().catch(() => "Unknown error");
    return { success: false, message: `Gagal sinkronisasi member ke gate: ${errText}` };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Tidak dapat terhubung ke server gate",
    };
  }
}

export async function uploadMemberFaceToGate(memberId: string, photoData: string): Promise<GateResult> {
  const { baseUrl, apiKey } = getGateConfig();

  try {
    const response = await fetch(`${baseUrl}/api/integration/members/face`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PRIMA-API-Key": apiKey,
      },
      body: JSON.stringify({
        memberId,
        photoData,
      }),
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      return { success: true, message: "Foto wajah berhasil didaftarkan ke mesin gate", data };
    }

    const errText = await response.text().catch(() => "Unknown error");
    return { success: false, message: `Gagal upload foto wajah ke gate: ${errText}` };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Tidak dapat terhubung ke server gate",
    };
  }
}

export async function deactivateMemberGate(memberId: string): Promise<GateResult> {
  const { baseUrl, apiKey } = getGateConfig();

  try {
    const response = await fetch(`${baseUrl}/api/integration/members/${memberId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-PRIMA-API-Key": apiKey,
      },
      body: JSON.stringify({ status: "Non-Aktif" }),
    });

    if (response.ok) {
      return { success: true, message: "Akses gate member berhasil dinonaktifkan" };
    }

    const errText = await response.text().catch(() => "Unknown error");
    return { success: false, message: `Gagal menonaktifkan gate: ${errText}` };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Tidak dapat terhubung ke server gate",
    };
  }
}

export async function checkinFacilitySession(
  memberId: string,
  roomId: number,
  facilitySessionId?: number
): Promise<GateResult> {
  const { baseUrl, apiKey } = getGateConfig();

  try {
    const response = await fetch(`${baseUrl}/api/integration/members/checkin-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PRIMA-API-Key": apiKey,
      },
      body: JSON.stringify({
        memberId,
        roomId,
        facilitySessionId,
      }),
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      return { success: true, message: "Sesi berhasil check-in, gate dibuka", data };
    }

    const errText = await response.text().catch(() => "Unknown error");
    return { success: false, message: `Gagal check-in sesi gate: ${errText}` };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Tidak dapat terhubung ke server gate",
    };
  }
}
