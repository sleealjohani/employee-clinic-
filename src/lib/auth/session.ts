import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { Role } from "@prisma/client";

export const SESSION_COOKIE = "clinic_session";

/** Sliding idle window — a shared clinic terminal must not stay open. */
export const IDLE_MINUTES = 15;
/** Hard ceiling regardless of activity. */
export const ABSOLUTE_HOURS = 12;

export type SessionData = {
  sub: string;
  username: string;
  name: string;
  role: Role;
  ver: number;
  /** Absolute expiry (epoch seconds) — survives every sliding refresh. */
  abs: number;
};

export type SessionClaims = JWTPayload & SessionData;

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or shorter than 32 characters. Generate one with: openssl rand -base64 48",
    );
  }
  return new TextEncoder().encode(value);
}

export async function signSession(
  claims: Omit<SessionData, "abs"> & { abs?: number },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const abs = claims.abs ?? now + ABSOLUTE_HOURS * 3600;
  return new SignJWT({ ...claims, abs })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setSubject(claims.sub)
    .setExpirationTime(Math.min(now + IDLE_MINUTES * 60, abs))
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const claims = payload as SessionClaims;
    if (typeof claims.abs !== "number" || claims.abs * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
