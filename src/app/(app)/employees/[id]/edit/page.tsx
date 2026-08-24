import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { PageHeader } from "@/components/ui";
import { EmployeeForm } from "@/components/forms/EmployeeForm";

export const dynamic = "force-dynamic";

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("employee.write");
  const { id } = await params;
  const t = await getT();

  const [employee, departments, jobTitles] = await Promise.all([
    db.employee.findUnique({ where: { id } }),
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

  if (!employee) notFound();

  return (
    <>
      <PageHeader title={t("emp.edit")} subtitle={employee.name} />
      <EmployeeForm
        values={employee}
        departments={departments.map((d) => d.department!).filter(Boolean)}
        jobTitles={jobTitles.map((j) => j.jobTitle!).filter(Boolean)}
      />
    </>
  );
}
