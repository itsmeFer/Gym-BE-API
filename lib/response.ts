import { NextResponse } from "next/server";

type ApiResponseData = Record<string, unknown>;

export function successResponse(data: ApiResponseData = {}, status = 200) {
  return NextResponse.json(
    {
      success: true,
      ...data,
    },
    { status }
  );
}

export function errorResponse(message: string, status = 400, error?: unknown) {
  return NextResponse.json(
    {
      success: false,
      message,
      error: error instanceof Error ? error.message : error,
    },
    { status }
  );
}