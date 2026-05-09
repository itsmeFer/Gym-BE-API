import { NextRequest } from "next/server";
import { Op } from "sequelize";

import { Membership, User, MembershipPlan } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;

    const membership = await Membership.findOne({
      where: {
        id,
        memberStatus: {
          [Op.notIn]: ["revoke", "revoked", "dicabut", "dibatalkan"],
        },
      },
      include: [
        {
          model: User,
          as: "user",
          attributes: [
            "id",
            "name",
            "phone",
            "email",
            "role",
            "points",
            "maxPoints",
          ],
        },
        {
          model: User,
          as: "sales",
          attributes: ["id", "name", "phone", "email", "role"],
          required: false,
        },
        {
          model: MembershipPlan,
          as: "plan",
          required: false,
        },
      ],
    });

    if (!membership) {
      return errorResponse("Membership tidak ditemukan atau sudah revoke", 404);
    }

    return successResponse({
      message: "Detail membership berhasil diambil",
      data: membership,
    });
  } catch (error) {
    console.error("GET MANAGER MEMBERSHIP DETAIL ERROR:", error);
    return errorResponse("Gagal mengambil detail membership", 500);
  }
}
