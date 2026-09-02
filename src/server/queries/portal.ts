import { requireUser } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
export async function requireEmployee() {
  const user = await requireUser();
  if (user.role !== "EMPLOYEE" || !user.employeeId) redirect("/dashboard");
  const employee = await db.employee.findUnique({
    where: { id: user.employeeId },
  });
  if (!employee || employee.isArchived) redirect("/login");
  return { user, employee };
}
