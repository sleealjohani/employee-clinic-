import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (user) {
    await writeAudit({
      user,
      action: "LOGOUT",
      entity: "User",
      entityId: user.id,
      summary: "تسجيل خروج",
    });
  }
  // nextUrl honours x-forwarded-host/proto, so the redirect lands on the host
  // the browser actually asked for — behind Vercel's proxy request.url does not.
  const response = NextResponse.redirect(new URL("/login", request.nextUrl), { status: 303 });
  // Clearing must repeat the attributes the cookie was set with, or a browser
  // keeps the original and the sign-out silently does nothing.
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0, expires: new Date(0) });
  return response;
}
