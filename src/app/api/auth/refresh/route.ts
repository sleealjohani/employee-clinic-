import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  SESSION_COOKIE,
  verifySession,
  signSession,
  sessionCookieOptions,
  IDLE_MINUTES,
} from "@/lib/auth/session";
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (
    origin &&
    origin !== request.nextUrl.origin &&
    new URL(origin).host !== request.headers.get("host")
  )
    return NextResponse.json({ error: "origin" }, { status: 403 });
  const user = await getCurrentUser(),
    claims = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user || !claims || user.mustChangePassword)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const response = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(
    SESSION_COOKIE,
    await signSession({
      sub: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      ver: claims.ver,
      abs: claims.abs,
    }),
    sessionCookieOptions(IDLE_MINUTES * 60),
  );
  return response;
}
