import { sequelize } from "@/database/connection";
import "@/database/models";
import { errorResponse, successResponse } from "@/lib/response";

export async function GET() {
  try {
    await sequelize.sync({ alter: true });

    return successResponse({
      message: "Setup database berhasil",
      data: null,
    });
  } catch (error) {
    console.error("SETUP DATABASE ERROR:", error);

    return errorResponse("Gagal setup database", 500);
  }
}