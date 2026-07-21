import { User, Membership } from "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

import { Op } from "sequelize";

function serializeCustomer(user: any) {
  const data = user.get ? user.get({ plain: true }) : user;

  const memberships = Array.isArray(data.memberships) ? data.memberships : [];
  const latestMembership = memberships.length > 0 ? memberships[0] : null;

  return {
    id: data.id,
    name: data.name,
    phone: data.phone,
    email: data.email,
    role: data.role,
    isActive: data.isActive,

    latestMemberStatus: latestMembership?.memberStatus ?? "customer",
    latestPaymentStatus: latestMembership?.paymentStatus ?? "-",
    latestPackageName: latestMembership?.packageName ?? null,
    latestExpiredAt: latestMembership?.expiredAt ?? null,
  };
}

export async function GET() {
  try {
    const customers = await User.findAll({
      where: {
        role: "customer",
        emailVerifiedAt: {
          [Op.ne]: null,
        },
      },
      attributes: ["id", "name", "phone", "email", "role", "isActive"],
      include: [
        {
          model: Membership,
          as: "memberships",
          required: false,
          separate: true,
          limit: 1,
          order: [["id", "DESC"]],
        },
      ],
      order: [["id", "DESC"]],
    });

    return successResponse({
      message: "Data customer/member berhasil diambil",
      data: customers.map(serializeCustomer),
    });
  } catch (error) {
    console.error("GET SALES CUSTOMERS ERROR:", error);
    return errorResponse("Gagal mengambil data customer/member", 500);
  }
}