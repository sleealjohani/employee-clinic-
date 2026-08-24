import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
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
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
