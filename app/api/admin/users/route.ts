import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { Op } from "sequelize";

import { User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { getAdminFromRequest } from "@/lib/admin-auth";

const STAFF_ROLES = [
  "admin",
  "owner",
  "direktur",
  "manager",
  "karyawan",
  "trainer",
  "sales",
  "kasir",
] as const;

type StaffRole = (typeof STAFF_ROLES)[number];

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

function normalizeRole(value: unknown): StaffRole | null {
  const role = String(value ?? "").trim().toLowerCase();

  return STAFF_ROLES.includes(role as StaffRole) ? (role as StaffRole) : null;
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

function serializeUser(user: RawUser) {
  const points = toNumber(user.points, 0);
  const maxPoints = toNumber(user.maxPoints ?? user.max_points, points);

  return {
    id: user.id,
    name: getUserName(user),
    fullName: getUserName(user),
    email: user.email ?? "",
    phone: user.phone ?? "",
    role: String(user.role ?? "karyawan").toLowerCase(),
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

export async function GET(request: NextRequest) {
  try {
    const auth = await getAdminFromRequest(request);
    if (!auth.success) {
      return errorResponse(auth.message, 403);
    }

    const users = (await User.findAll({
      raw: true,
      order: [["id", "DESC"]],
    })) as RawUser[];

    return successResponse({
      message: "Data user berhasil diambil",
      data: users.map(serializeUser),
    });
  } catch (error) {
    console.error("GET ADMIN USERS ERROR:", error);

    return errorResponse("Gagal mengambil data user", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAdminFromRequest(request);
    if (!auth.success) {
      return errorResponse(auth.message, 403);
    }

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

    if (!name) return errorResponse("Nama wajib diisi", 400);
    if (!phone) return errorResponse("Nomor HP wajib diisi", 400);
    if (!email) return errorResponse("Email wajib diisi", 400);
    if (!password) return errorResponse("Password wajib diisi", 400);

    if (!role) {
      return errorResponse(
        "Role hanya boleh admin, owner, direktur, manager, karyawan, trainer, sales, atau kasir",
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

    const user = await User.create({
      name,
      phone,
      email,
      password: hashedPassword,
      role,
      points,
      maxPoints,
      referralCode: generateReferralCode(name),
      referredByCode: null,
      referredByUserId: null,
      isActive,
    });

    return successResponse({
      message: "Akun tim berhasil dibuat",
      data: serializeUser(user.get({ plain: true }) as RawUser),
    });
  } catch (error) {
    console.error("CREATE ADMIN USER ERROR:", error);

    return errorResponse("Gagal membuat akun tim", 500);
  }
}