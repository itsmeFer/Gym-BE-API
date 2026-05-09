import { NextRequest } from "next/server";
import { MembershipPlan } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

type CustomerCategory = "prima_grup" | "non_prima_grup";

function toNumberOrUndefined(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizeCustomerCategory(value: unknown): CustomerCategory | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const category = String(value).trim().toLowerCase();

  if (category === "prima_grup" || category === "non_prima_grup") {
    return category;
  }

  return undefined;
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
      message: "Membership plan detail fetched successfully",
      data: plan,
    });
  } catch (error) {
    console.error("GET MEMBERSHIP PLAN DETAIL ERROR:", error);

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

    const customerCategory = normalizeCustomerCategory(body.customerCategory);

    const packageCode =
      body.packageCode !== undefined
        ? String(body.packageCode).trim()
        : undefined;

    const name =
      body.name !== undefined ? String(body.name).trim() : undefined;

    const description =
      body.description !== undefined
        ? String(body.description).trim()
        : undefined;

    const imageUrl =
      body.imageUrl !== undefined
        ? String(body.imageUrl).trim()
        : undefined;

    const price = toNumberOrUndefined(body.price);
    const discountPercent = toNumberOrUndefined(body.discountPercent);

    const personalTrainerSessions = toNumberOrUndefined(
      body.personalTrainerSessions
    );

    const pilatesSessions = toNumberOrUndefined(body.pilatesSessions);

    const freeMembershipMonths = toNumberOrUndefined(
      body.freeMembershipMonths
    );

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

    await plan.update({
      ...(programName !== undefined && { programName }),
      ...(customerCategory !== undefined && { customerCategory }),
      ...(packageCode !== undefined && { packageCode }),
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(imageUrl !== undefined && { imageUrl }),
      ...(price !== undefined && { price }),
      ...(discountPercent !== undefined && { discountPercent }),
      ...(personalTrainerSessions !== undefined && {
        personalTrainerSessions,
      }),
      ...(pilatesSessions !== undefined && { pilatesSessions }),
      ...(freeMembershipMonths !== undefined && {
        freeMembershipMonths,
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
    console.error("UPDATE MEMBERSHIP PLAN ERROR:", error);

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
    console.error("DELETE MEMBERSHIP PLAN ERROR:", error);

    return errorResponse("Gagal hapus membership plan", 500);
  }
}