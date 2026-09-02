import { cookies, headers } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "./session";
import { can, canOpenPath, type Permission } from "./rbac";
import { employeeAccessAllowed } from "./employee-access";

export type CurrentUser = {
  id: string;
  username: string;
  name: string;
  role: Role;
  totpEnabled: boolean;
  mustChangePassword: boolean;
  employeeId: string | null;
};

/**
 * Resolved once per request. The JWT is only a claim — the database decides
 * whether the account is still active and whether its sessions were revoked.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies();
  const claims = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!claims) return null;

  const user = await db.user.findUnique({
    where: { id: claims.sub },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      isActive: true,
      tokenVersion: true,
      totpEnabled: true,
      mustChangePassword: true,
      employeeId: true,
      employee: { select: { isArchived: true, employmentStatus: true } },
    },
  });

  if (!user || !user.isActive) return null;
  if (user.tokenVersion !== claims.ver) return null;
  if (user.role !== claims.role) return null;
  if (
    user.role === "EMPLOYEE" &&
    (!user.employee || !employeeAccessAllowed(user.employee))
  )
    return null;

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    totpEnabled: user.totpEnabled,
    mustChangePassword: user.role !== "EMPLOYEE" && user.mustChangePassword,
    employeeId: user.employeeId,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/account/password");
  return user;
}

export async function requirePermission(
  permission: Permission,
): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect("/denied");
  return user;
}

export async function requirePath(pathname: string): Promise<CurrentUser> {
  const user = await requireUser();
  if (!canOpenPath(user.role, pathname)) redirect("/denied");
  return user;
}

export async function requestContext(): Promise<{
  ip: string | null;
  userAgent: string | null;
}> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return {
    ip: forwarded ? forwarded.split(",")[0].trim() : h.get("x-real-ip"),
    userAgent: h.get("user-agent"),
  };
}
