import { latinDigits } from "@/lib/clinical/numeric";
import { canOpenPath } from "./rbac";

/** Exact stored identifier only: never fuzzy-match a person's identity. */
export function employeeLoginId(value: string): string | null {
  if (value.length > 32) return null;
  const id = latinDigits(value).trim();
  return /^\d{10}$/.test(id) ? id : null;
}

export function employeeAccessAllowed(employee: {
  isArchived: boolean;
  employmentStatus: string;
}): boolean {
  return (
    !employee.isArchived &&
    ["ACTIVE", "ON_LEAVE"].includes(employee.employmentStatus)
  );
}

export function employeeReturnPath(next: string): string {
  return next.startsWith("/") &&
    !next.startsWith("//") &&
    !/[\\\r\n]/.test(next) &&
    !next.split("?")[0].startsWith("/account/password") &&
    canOpenPath("EMPLOYEE", next.split("?")[0])
    ? next
    : "/portal";
}
