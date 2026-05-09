import { MembershipPlan } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

function serializePlan(plan: any) {
  const data = plan.get ? plan.get({ plain: true }) : plan;

  return {
    id: data.id,
    programName: data.programName,
    customerCategory: data.customerCategory,
    packageCode: data.packageCode,
    name: data.name,
    description: data.description,
    imageUrl: data.imageUrl,
    price: Number(data.price ?? 0),
    discountPercent: Number(data.discountPercent ?? 0),
    personalTrainerSessions: Number(data.personalTrainerSessions ?? 0),
    pilatesSessions: Number(data.pilatesSessions ?? 0),
    freeMembershipMonths: Number(data.freeMembershipMonths ?? 0),
    benefits: Array.isArray(data.benefits) ? data.benefits : [],
    isActive: Boolean(data.isActive),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export async function GET() {
  try {
    const plans = await MembershipPlan.findAll({
      where: {
        isActive: true,
      },
      order: [
        ["programName", "ASC"],
        ["price", "ASC"],
        ["id", "ASC"],
      ],
    });

    return successResponse({
      message: "Paket membership aktif berhasil diambil",
      data: plans.map(serializePlan),
    });
  } catch (error) {
    console.error("GET SALES MEMBERSHIP PLANS ERROR:", error);
    return errorResponse("Gagal mengambil paket membership", 500);
  }
}