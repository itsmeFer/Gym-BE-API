import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { Op } from "sequelize";

import { User } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

const MANAGER_ALLOWED_ROLES = [
  "admin",
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
  return {
    id: user.id,
    name: getUserName(user),
    fullName: getUserName(user),
    email: user.email ?? "",
    phone: user.phone ?? "",
    role: String(user.role ?? "customer").toLowerCase(),
    points: Number(user.points ?? 0),
    maxPoints: Number(user.maxPoints ?? user.max_points ?? 100),
    isActive: user.isActive ?? user.is_active ?? true,
    createdAt: user.createdAt ?? user.created_at ?? null,
  };
}

async function findManagerAllowedUser(id: string) {
  return User.findOne({
    where: {
      id,
      role: {
        [Op.in]: [...MANAGER_ALLOWED_ROLES],
      },
    },
  });
}

/**
 * GET /api/manager/users/:id
 *
 * Ambil detail user semua role:
 * admin, direktur, manager, karyawan, trainer, sales, customer.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;

    const user = await findManagerAllowedUser(id);

    if (!user) {
      return errorResponse("User tidak ditemukan", 404);
    }

    return successResponse({
      message: "Detail user berhasil diambil",
      data: serializeUser(user.get({ plain: true }) as RawUser),
    });
  } catch (error) {
    console.error("GET MANAGER USER DETAIL ERROR:", error);

    return errorResponse("Gagal mengambil detail user", 500);
  }
}

/**
 * PUT /api/manager/users/:id
 *
 * Update user semua role:
 * admin, direktur, manager, karyawan, trainer, sales, customer.
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const user = await findManagerAllowedUser(id);

    if (!user) {
      return errorResponse("User tidak ditemukan", 404);
    }

    const name =
      body.name ?? body.fullName ?? body.full_name
        ? String(body.name ?? body.fullName ?? body.full_name).trim()
        : undefined;

    const phone =
      body.phone ?? body.noHp ?? body.no_hp
        ? String(body.phone ?? body.noHp ?? body.no_hp).trim()
        : undefined;

    const email =
      body.email !== undefined
        ? String(body.email).trim().toLowerCase()
        : undefined;

    const role = body.role !== undefined ? normalizeRole(body.role) : undefined;

    const isActive =
      body.isActive !== undefined || body.is_active !== undefined
        ? toBoolean(body.isActive ?? body.is_active, true)
        : undefined;

    const points =
      body.points !== undefined
        ? Math.max(toNumber(body.points, 0), 0)
        : undefined;

    const maxPoints =
      body.maxPoints !== undefined || body.max_points !== undefined
        ? Math.max(toNumber(body.maxPoints ?? body.max_points, 100), 1)
        : undefined;

    const password =
      body.password !== undefined ? String(body.password ?? "").trim() : "";

    if (name !== undefined && !name) {
      return errorResponse("Nama wajib diisi", 400);
    }

    if (phone !== undefined && !phone) {
      return errorResponse("Nomor HP wajib diisi", 400);
    }

    if (email !== undefined && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return errorResponse("Format email belum valid", 400);
    }

    if (body.role !== undefined && !role) {
      return errorResponse(
        "Role hanya boleh admin, direktur, manager, karyawan, trainer, sales, atau customer",
        400,
      );
    }

    if (body.points !== undefined && Number.isNaN(Number(body.points))) {
      return errorResponse("Points harus berupa angka", 400);
    }

    if (
      (body.maxPoints !== undefined || body.max_points !== undefined) &&
      Number.isNaN(Number(body.maxPoints ?? body.max_points))
    ) {
      return errorResponse("Max points harus berupa angka", 400);
    }

    if (password && password.length < 6) {
      return errorResponse("Password minimal 6 karakter", 400);
    }

    if (email !== undefined || phone !== undefined) {
      const duplicate = await User.findOne({
        where: {
          id: { [Op.ne]: Number(id) },
          [Op.or]: [
            ...(email ? [{ email }] : []),
            ...(phone ? [{ phone }] : []),
          ],
        },
      });

      if (duplicate) {
        return errorResponse("Email atau nomor HP sudah dipakai akun lain", 409);
      }
    }

    const payload: Record<string, unknown> = {};

    if (name !== undefined) payload.name = name;
    if (phone !== undefined) payload.phone = phone;
    if (email !== undefined) payload.email = email;
    if (role) payload.role = role;
    if (points !== undefined) payload.points = points;
    if (maxPoints !== undefined) payload.maxPoints = maxPoints;
    if (isActive !== undefined) payload.isActive = isActive;
    if (password) payload.password = await bcrypt.hash(password, 10);

    await user.update(payload);

    const updatedUser = await findManagerAllowedUser(id);

    return successResponse({
      message: "User berhasil diupdate",
      data: updatedUser
        ? serializeUser(updatedUser.get({ plain: true }) as RawUser)
        : null,
    });
  } catch (error) {
    console.error("UPDATE MANAGER USER ERROR:", error);

    return errorResponse("Gagal update user", 500);
  }
}

/**
 * DELETE /api/manager/users/:id
 *
 * Hapus user semua role.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;

    const user = await findManagerAllowedUser(id);

    if (!user) {
      return errorResponse("User tidak ditemukan", 404);
    }

    await user.destroy();

    return successResponse({
      message: "User berhasil dihapus",
      data: null,
    });
  } catch (error) {
    console.error("DELETE MANAGER USER ERROR:", error);

    return errorResponse("Gagal hapus user", 500);
  }
}