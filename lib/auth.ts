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
  try {
    return jwt.verify(
      token,
      process.env.JWT_SECRET || "default_secret"
    ) as JwtUserPayload;
  } catch {
    return null;
  }
}