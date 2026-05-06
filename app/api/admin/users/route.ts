import { User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

type RawUser = {
  id?: number;
  name?: string | null;
  fullName?: string | null;
  full_name?: string | null;
  nama?: string | null;
  email?: string | null;
  role?: string | null;
  phone?: string | null;
  createdAt?: Date;
  created_at?: Date;
};

function getUserName(user: RawUser) {
  return (
    user.fullName ||
    user.full_name ||
    user.name ||
    user.nama ||
    user.email ||
    `User ${user.id ?? ""}`
  );
}

export async function GET() {
  try {
    const users = (await User.findAll({
      raw: true,
      order: [["id", "DESC"]],
    })) as RawUser[];

    const data = users.map((user) => {
      return {
        id: user.id,
        name: getUserName(user),
        fullName: getUserName(user),
        email: user.email ?? "",
        role: String(user.role ?? "karyawan").toLowerCase(),
      };
    });

    return successResponse({
      message: "Data user berhasil diambil",
      data,
    });
  } catch (error) {
    console.error("GET ADMIN USERS ERROR:", error);

    return errorResponse("Gagal mengambil data user", 500);
  }
}