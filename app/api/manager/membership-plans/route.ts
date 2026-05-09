import { NextRequest } from "next/server";
import { MembershipPlan } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

const CUSTOMER_CATEGORIES = ["prima_grup", "non_prima_grup"] as const;

type CustomerCategory = (typeof CUSTOMER_CATEGORIES)[number];

function toNumber(value: unknown, defaultValue = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
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

export async function GET() {
  try {
    const plans = await MembershipPlan.findAll({
      order: [["createdAt", "DESC"]],
    });

    return successResponse({
      message: "Membership plans berhasil diambil",
      data: plans,
    });
  } catch (error) {
    console.error("GET MANAGER MEMBERSHIP PLANS ERROR:", error);
    return errorResponse("Gagal mengambil data membership plan", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const programName = String(body.programName ?? "").trim();
    const customerCategory = normalizeCustomerCategory(body.customerCategory);
    const packageCode = String(body.packageCode ?? "").trim();
    const name = String(body.name ?? "").trim();

    const description = body.description
      ? String(body.description).trim()
      : null;

    const imageUrl = body.imageUrl ? String(body.imageUrl).trim() : null;

    const price = Math.max(toNumber(body.price), 0);
    const durationDays = Math.max(toNumber(body.durationDays, 30), 1);
    const discountPercent = Math.max(toNumber(body.discountPercent), 0);

    const personalTrainerSessions = Math.max(
      toNumber(body.personalTrainerSessions),
      0
    );

    const pilatesSessions = Math.max(toNumber(body.pilatesSessions), 0);

    const freeMembershipDays = Math.max(
      toNumber(body.freeMembershipDays),
      0
    );

    const benefits = Array.isArray(body.benefits)
      ? body.benefits
          .map((item: unknown) => String(item).trim())
          .filter(Boolean)
      : [];

    const isActive =
      typeof body.isActive === "boolean" ? body.isActive : true;

    if (!programName) {
      return errorResponse("Program name wajib diisi", 400);
    }

    if (!customerCategory) {
      return errorResponse(
        "Customer category hanya boleh prima_grup atau non_prima_grup",
        400
      );
    }

    if (!packageCode) {
      return errorResponse("Package code wajib diisi", 400);
    }

    if (!name) {
      return errorResponse("Nama paket wajib diisi", 400);
    }

    const plan = await MembershipPlan.create({
      programName,
      customerCategory,
      packageCode,
      name,
      description,
      imageUrl,
      price,
      durationDays,
      discountPercent,
      personalTrainerSessions,
      pilatesSessions,
      freeMembershipDays,
      benefits,
      isActive,
    });

    return successResponse({
      message: "Membership plan berhasil dibuat",
      data: plan,
    });
  } catch (error) {
    console.error("CREATE MANAGER MEMBERSHIP PLAN ERROR:", error);
    return errorResponse("Gagal membuat membership plan", 500);
  }
}