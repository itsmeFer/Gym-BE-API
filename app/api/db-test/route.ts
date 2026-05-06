import { NextResponse } from "next/server";
import { sequelize } from "@/database/connection";

export const runtime = "nodejs";

export async function GET() {
  try {
    await sequelize.authenticate();

    return NextResponse.json({
      success: true,
      message: "Koneksi PostgreSQL berhasil",
      database: process.env.DB_NAME,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Koneksi PostgreSQL gagal",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}