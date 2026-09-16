import jwt from "jsonwebtoken";

export type JwtUserPayload = {
  id: number;
  role: string;
  email: string;
};

export function getTokenFromRequest(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!authHeader) {
    return null;
  }

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.replace("Bearer ", "");
}

export function verifyToken(token: string): JwtUserPayload | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error("FATAL: JWT_SECRET tidak di-set. Token tidak bisa diverifikasi.");
    return null;
  }
  try {
    return jwt.verify(token, secret) as JwtUserPayload;
  } catch {
    return null;
  }
}