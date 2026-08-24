import type { Role } from "@prisma/client";

/**
 * What the employer's side may see is not what the clinician may see.
 *
 * VIEWER exists for HR: aggregate indicators and immunisation completeness,
 * never a diagnosis, a lab value or a note. That separation is the whole point
 * of running the clinic's records as a distinct system.
 */

export type Permission =
  | "employee.read"
  | "employee.write"
  | "employee.archive"
  | "clinical.read" // visits, labs, allergies, notes — the confidential layer
  | "clinical.write"
  | "clinical.void"
  | "sensitive.read" // HIV / hepatitis serology
  | "import.run"
  | "reports.aggregate"
  | "reports.detailed"
  | "users.manage"
  | "audit.read";

const MATRIX: Record<Role, Permission[]> = {
  ADMIN: [
    "employee.read",
    "employee.write",
    "employee.archive",
    "clinical.read",
    "clinical.write",
    "clinical.void",
    "sensitive.read",
    "import.run",
    "reports.aggregate",
    "reports.detailed",
    "users.manage",
    "audit.read",
  ],
  STAFF: [
    "employee.read",
    "employee.write",
    "clinical.read",
    "clinical.write",
    "sensitive.read",
    "reports.aggregate",
    "reports.detailed",
  ],
  VIEWER: ["reports.aggregate"],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export function canAny(role: Role, permissions: Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

/** Routes a role is allowed to open, evaluated as prefixes. */
export function allowedPaths(role: Role): string[] {
  switch (role) {
    case "ADMIN":
      return ["/"];
    case "STAFF":
      return [
        "/dashboard",
        "/employees",
        "/visits",
        "/labs",
        "/vaccinations",
        "/due",
        "/reports",
        "/account",
      ];
    case "VIEWER":
      return ["/dashboard", "/reports", "/account"];
  }
}

export function canOpenPath(role: Role, pathname: string): boolean {
  if (role === "ADMIN") return true;
  const path = pathname === "/" ? "/dashboard" : pathname;
  return allowedPaths(role).some((p) => path === p || path.startsWith(`${p}/`));
}

export const ROLES: Role[] = ["ADMIN", "STAFF", "VIEWER"];
