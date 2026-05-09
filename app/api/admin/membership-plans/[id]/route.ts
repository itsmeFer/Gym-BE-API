import { NextRequest } from "next/server";
import { MembershipPlan } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

const CUSTOMER_CATEGORIES = ["prima_grup", "non_prima_grup"] as const;

type CustomerCategory = (typeof CUSTOMER_CATEGORIES)[number];

function toNumberOrUndefined(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizeCustomerCategory(value: unknown): CustomerCategory | null {
  const text = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");

  if (text === "prima_group") return "prima_grup";
  if (text === "non_prima_group") return "non_prima_grup";

  if (text === "prima_grup") return "prima_grup";
  if (text === "non_prima_grup") return "non_prima_grup";

  return null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const plan = await MembershipPlan.findByPk(id);

    if (!plan) {
      return errorResponse("Membership plan tidak ditemukan", 404);
    }

    return successResponse({
      message: "Detail membership plan berhasil diambil",
      data: plan,
    });
  } catch (error) {
    console.error("GET ADMIN MEMBERSHIP PLAN DETAIL ERROR:", error);
    return errorResponse("Gagal mengambil detail membership plan", 500);
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const plan = await MembershipPlan.findByPk(id);

    if (!plan) {
      return errorResponse("Membership plan tidak ditemukan", 404);
    }

    const programName =
      body.programName !== undefined
        ? String(body.programName).trim()
        : undefined;

    const customerCategory =
      body.customerCategory !== undefined
        ? normalizeCustomerCategory(body.customerCategory)
        : undefined;

    const packageCode =
      body.packageCode !== undefined
        ? String(body.packageCode).trim()
        : undefined;

    const name =
      body.name !== undefined ? String(body.name).trim() : undefined;

    const description =
      body.description !== undefined
        ? String(body.description ?? "").trim() || null
        : undefined;

    const imageUrl =
      body.imageUrl !== undefined
        ? String(body.imageUrl ?? "").trim() || null
        : undefined;

    const price = toNumberOrUndefined(body.price);
    const durationDays = toNumberOrUndefined(body.durationDays);
    const discountPercent = toNumberOrUndefined(body.discountPercent);

    const personalTrainerSessions = toNumberOrUndefined(
      body.personalTrainerSessions
    );

    const pilatesSessions = toNumberOrUndefined(body.pilatesSessions);

    const freeMembershipDays = toNumberOrUndefined(body.freeMembershipDays);

    const benefits =
      body.benefits !== undefined && Array.isArray(body.benefits)
        ? body.benefits
            .map((item: unknown) => String(item).trim())
            .filter(Boolean)
        : undefined;

    const isActive =
      body.isActive !== undefined && typeof body.isActive === "boolean"
        ? body.isActive
        : undefined;

    if (programName !== undefined && !programName) {
      return errorResponse("Program name wajib diisi", 400);
    }

    if (body.customerCategory !== undefined && customerCategory === null) {
      return errorResponse(
        "Customer category hanya boleh prima_grup atau non_prima_grup",
        400
      );
    }

    if (packageCode !== undefined && !packageCode) {
      return errorResponse("Package code wajib diisi", 400);
    }

    if (name !== undefined && !name) {
      return errorResponse("Nama paket wajib diisi", 400);
    }

    await plan.update({
      ...(programName !== undefined && { programName }),

      ...(customerCategory !== undefined &&
        customerCategory !== null && {
          customerCategory,
        }),

      ...(packageCode !== undefined && { packageCode }),
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(imageUrl !== undefined && { imageUrl }),

      ...(price !== undefined && {
        price: Math.max(price, 0),
      }),

      ...(durationDays !== undefined && {
        durationDays: Math.max(durationDays, 1),
      }),

      ...(discountPercent !== undefined && {
        discountPercent: Math.max(discountPercent, 0),
      }),

      ...(personalTrainerSessions !== undefined && {
        personalTrainerSessions: Math.max(personalTrainerSessions, 0),
      }),

      ...(pilatesSessions !== undefined && {
        pilatesSessions: Math.max(pilatesSessions, 0),
      }),

      ...(freeMembershipDays !== undefined && {
        freeMembershipDays: Math.max(freeMembershipDays, 0),
      }),

      ...(benefits !== undefined && { benefits }),
      ...(isActive !== undefined && { isActive }),
    });

    const updatedPlan = await MembershipPlan.findByPk(id);

    return successResponse({
      message: "Membership plan berhasil diupdate",
      data: updatedPlan,
    });
  } catch (error) {
    console.error("UPDATE ADMIN MEMBERSHIP PLAN ERROR:", error);
    return errorResponse("Gagal update membership plan", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const plan = await MembershipPlan.findByPk(id);

    if (!plan) {
      return errorResponse("Membership plan tidak ditemukan", 404);
    }

    await plan.destroy();

    return successResponse({
      message: "Membership plan berhasil dihapus",
      data: null,
    });
  } catch (error) {
    console.error("DELETE ADMIN MEMBERSHIP PLAN ERROR:", error);
    return errorResponse("Gagal hapus membership plan", 500);
  }
}