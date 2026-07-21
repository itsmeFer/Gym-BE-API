import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { Op } from "sequelize";

import { User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

const MANAGER_ALLOWED_ROLES = [
  "admin",
  "owner",
  "direktur",
  "manager",
  "karyawan",
  "trainer",
  "sales",
  "customer",
] as const;

type ManagerAllowedRole = (typeof MANAGER_ALLOWED_ROLES)[number];

type RawUser = {
  id?: number;
  name?: string | null;
  fullName?: string | null;
  full_name?: string | null;
  nama?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  points?: number | null;
  maxPoints?: number | null;
  max_points?: number | null;
  isActive?: boolean | null;
  is_active?: boolean | null;
  createdAt?: Date;
  created_at?: Date;
};

function normalizeRole(value: unknown): ManagerAllowedRole | null {
  const role = String(value ?? "").trim().toLowerCase();

  return MANAGER_ALLOWED_ROLES.includes(role as ManagerAllowedRole)
    ? (role as ManagerAllowedRole)
    : null;
}

function toBoolean(value: unknown, defaultValue = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  if (typeof value === "string") {
    const text = value.trim().toLowerCase();

    if (["true", "1", "aktif", "active"].includes(text)) return true;

    if (["false", "0", "nonaktif", "inactive", "off"].includes(text)) {
      return false;
    }
  }

  return defaultValue;
}

function toNumber(value: unknown, defaultValue = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

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

function serializeUser(user: RawUser) {
  const points = toNumber(user.points, 0);
  const maxPoints = toNumber(user.maxPoints ?? user.max_points, points || 100);

  return {
    id: user.id,
    name: getUserName(user),
    fullName: getUserName(user),
    email: user.email ?? "",
    phone: user.phone ?? "",
    role: String(user.role ?? "customer").toLowerCase(),
    points,
    maxPoints,
    isActive: user.isActive ?? user.is_active ?? true,
    createdAt: user.createdAt ?? user.created_at ?? null,
  };
}

function generateReferralCode(name: string) {
  const cleanName = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();

  return `PG-${cleanName || "USER"}-${random}`;
}

/**
 * GET /api/manager/users
 *
 * Ambil semua user semua role:
 * admin, direktur, manager, karyawan, trainer, sales, customer.
 */
export async function GET() {
  try {
    const users = (await User.findAll({
      where: {
        role: {
          [Op.in]: [...MANAGER_ALLOWED_ROLES],
        },
      },
      raw: true,
      order: [["id", "DESC"]],
    })) as RawUser[];

    return successResponse({
      message: "Data user berhasil diambil",
      data: users.map(serializeUser),
    });
  } catch (error) {
    console.error("GET MANAGER USERS ERROR:", error);

    return errorResponse("Gagal mengambil data user", 500);
  }
}

/**
 * POST /api/manager/users
 *
 * Buat user semua role:
 * admin, direktur, manager, karyawan, trainer, sales, customer.
 *
 * Body contoh:
 * {
 *   "name": "Budi",
 *   "phone": "08123456789",
 *   "email": "budi@gmail.com",
 *   "password": "123456",
 *   "role": "karyawan",
 *   "points": 100,
 *   "maxPoints": 100,
 *   "isActive": true
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const name = String(
      body.name ?? body.fullName ?? body.full_name ?? "",
    ).trim();

    const phone = String(body.phone ?? body.noHp ?? body.no_hp ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "").trim();

    const role = normalizeRole(body.role);
    const isActive = toBoolean(body.isActive ?? body.is_active, true);

    const pointsRaw = body.points ?? 100;
    const maxPointsRaw = body.maxPoints ?? body.max_points ?? pointsRaw;

    const points = Math.max(toNumber(pointsRaw, 100), 0);
    const maxPoints = Math.max(toNumber(maxPointsRaw, points), 0);

    if (!name) {
      return errorResponse("Nama wajib diisi", 400);
    }

    if (!phone) {
      return errorResponse("Nomor HP wajib diisi", 400);
    }

    if (!email) {
      return errorResponse("Email wajib diisi", 400);
    }

    if (!password) {
      return errorResponse("Password wajib diisi", 400);
    }

    if (!role) {
      return errorResponse(
        "Role hanya boleh admin, owner, direktur, manager, karyawan, trainer, sales, atau customer",
        400,
      );
    }

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return errorResponse("Format email belum valid", 400);
    }

    if (password.length < 6) {
      return errorResponse("Password minimal 6 karakter", 400);
    }

    if (Number.isNaN(Number(pointsRaw))) {
      return errorResponse("Points harus berupa angka", 400);
    }

    if (Number.isNaN(Number(maxPointsRaw))) {
      return errorResponse("Max points harus berupa angka", 400);
    }

    const existingUser = await User.findOne({
      where: {
        [Op.or]: [{ email }, { phone }],
      },
    });

    if (existingUser) {
      return errorResponse("Email atau nomor HP sudah dipakai", 409);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const createPayload = {
      name,
      phone,
      email,
      password: hashedPassword,
      role,
      points,
      maxPoints,
      isActive,
      ...(User.rawAttributes.referralCode
        ? { referralCode: generateReferralCode(name) }
        : {}),
    };

    const user = await User.create(createPayload as any);

    return successResponse({
      message: "User berhasil dibuat",
      data: serializeUser(user.get({ plain: true }) as RawUser),
    });
  } catch (error) {
    console.error("CREATE MANAGER USER ERROR:", error);

    return errorResponse("Gagal membuat user", 500);
  }
}