import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { PageHeader } from "@/components/ui";
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
      <PageHeader title={t("emp.new")} subtitle={t("emp.subtitle")} />
      <EmployeeForm
        departments={departments.map((d) => d.department!).filter(Boolean)}
        jobTitles={jobTitles.map((j) => j.jobTitle!).filter(Boolean)}
      />
    </>
  );
}
