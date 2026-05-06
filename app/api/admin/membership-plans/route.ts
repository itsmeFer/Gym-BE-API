import { NextRequest } from "next/server";
import { MembershipPlan } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

function toNumber(value: unknown, defaultValue = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

export async function GET() {
  try {
    const plans = await MembershipPlan.findAll({
      order: [["createdAt", "DESC"]],
    });

    return successResponse({
      message: "Membership plans fetched successfully",
      data: plans,
    });
  } catch (error) {
    console.error("GET MEMBERSHIP PLANS ERROR:", error);

    return errorResponse("Gagal mengambil data membership plan", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const programName = String(body.programName ?? "").trim();
    const customerCategory = String(body.customerCategory ?? "").trim();
    const packageCode = String(body.packageCode ?? "").trim();
    const name = String(body.name ?? "").trim();

    const description = body.description
      ? String(body.description).trim()
      : null;

    const imageUrl = body.imageUrl
      ? String(body.imageUrl).trim()
      : null;

    const price = toNumber(body.price);
    const discountPercent = toNumber(body.discountPercent);
    const personalTrainerSessions = toNumber(body.personalTrainerSessions);
    const pilatesSessions = toNumber(body.pilatesSessions);
    const freeMembershipMonths = toNumber(body.freeMembershipMonths);

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
      return errorResponse("Customer category wajib diisi", 400);
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
      discountPercent,
      personalTrainerSessions,
      pilatesSessions,
      freeMembershipMonths,
      benefits,
      isActive,
    });

    return successResponse({
      message: "Membership plan berhasil dibuat",
      data: plan,
    });
  } catch (error) {
    console.error("CREATE MEMBERSHIP PLAN ERROR:", error);

    return errorResponse("Gagal membuat membership plan", 500);
  }
}