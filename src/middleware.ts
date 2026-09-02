import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  signSession,
  verifySession,
  sessionCookieOptions,
  IDLE_MINUTES,
} from "@/lib/auth/session";

const PUBLIC_PREFIXES = [
  "/login",
  "/setup",
  "/denied",
  "/_next",
  "/brand",
  "/favicon",
  "/icon",
  "/apple-icon",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = await verifySession(token);

  if (!claims) {
    if (pathname.startsWith("/api/"))
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search =
      pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    const response = NextResponse.redirect(url);
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  // Slide the idle window forward on real navigation, never on prefetches —
  // otherwise a background prefetch would keep an abandoned terminal signed in.
  const response = NextResponse.next();
  if (
    request.headers.get("next-router-prefetch") !== "1" &&
    request.method === "GET"
  ) {
    const refreshed = await signSession({
      sub: claims.sub,
      username: claims.username,
      name: claims.name,
      role: claims.role,
      ver: claims.ver,
      abs: claims.abs,
    });
    response.cookies.set(
      SESSION_COOKIE,
      refreshed,
      sessionCookieOptions(IDLE_MINUTES * 60),
    );
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!api/health|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2)$).*)",
  ],
};
