import { NextRequest } from "next/server";
import { Op } from "sequelize";
import { Membership, User, MembershipPlan } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";
import { getTokenFromRequest, verifyToken } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromRequest(request);
    const userPayload = token ? verifyToken(token) : null;

    if (!userPayload) {
      return errorResponse("Autentikasi gagal. Silakan login kembali.", 401);
    }

    const allowedRoles = ["admin", "kasir", "owner", "direktur", "manager"];
    if (!allowedRoles.includes(userPayload.role.toLowerCase())) {
      return errorResponse("Akses ditolak: Anda tidak memiliki akses ke detail membership", 403);
    }

    const { id } = await context.params;

    const membership = await Membership.findOne({
      where: {
        id,
        memberStatus: {
          [Op.notIn]: ["revoke", "revoked"],
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
    console.error("GET ADMIN MEMBERSHIP DETAIL ERROR:", error);

    return errorResponse("Gagal mengambil detail membership", 500);
  }
}