import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { EmployeeForm } from "@/components/forms/EmployeeForm";

export const metadata = { title: "موظف جديد" };
export const dynamic = "force-dynamic";

export default async function NewEmployeePage() {
  await requirePermission("employee.write");
  const t = await getT();

  const [departments, jobTitles] = await Promise.all([
    db.employee.findMany({
      where: { department: { not: null } },
      distinct: ["department"],
      select: { department: true },
    }),
    db.employee.findMany({
      where: { jobTitle: { not: null } },
      distinct: ["jobTitle"],
      select: { jobTitle: true },
    }),
  ]);

  return (
    <>
      <div className="mb-3 flex items-center gap-2 text-xs" style={{ color: "var(--text-faint)" }}>
        <Link href="/employees" className="font-bold" style={{ color: "var(--accent-text)" }}>{t("emp.title")}</Link>
        <span>/</span>
        <span>{t("emp.new")}</span>
      </div>
      <EmployeeForm
        departments={departments.map((department) => department.department!).filter(Boolean)}
        jobTitles={jobTitles.map((jobTitle) => jobTitle.jobTitle!).filter(Boolean)}
      />
    </>
  );
}
