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
  const isDev = process.env.NODE_ENV === "development";

  const responseBody: Record<string, unknown> = {
    success: false,
    message,
  };

  if (error !== undefined) {
    if (isDev) {
      responseBody.error = error instanceof Error ? error.message : error;
    } else if (
      typeof error === "object" &&
      error !== null &&
      "needEmailVerification" in error
    ) {
      responseBody.error = error;
    }
  }

  return NextResponse.json(responseBody, { status });
}