import { MembershipPlan } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

export async function GET() {
  try {
    const plans = await MembershipPlan.findAll({
      where: {
        isActive: true,
      },
      order: [
        ["createdAt", "DESC"],
      ],
    });

    return successResponse({
      message: "Public membership plans fetched successfully",
      data: plans,
    });
  } catch (error) {
    console.error("GET PUBLIC MEMBERSHIP PLANS ERROR:", error);

    return errorResponse("Gagal mengambil paket membership", 500);
  }
}