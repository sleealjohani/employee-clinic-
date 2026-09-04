import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { toDateTimeInput } from "@/lib/format";
import { LinkButton, PageHeader } from "@/components/ui";
import { NeedleStickIncidentForm } from "@/components/forms/NeedleStickIncidentForm";

export const dynamic = "force-dynamic";

export default async function NewNeedleStickIncidentPage({
  searchParams,
}: {
  searchParams: Promise<{ employeeId?: string }>;
}) {
  await requirePermission("clinical.write");
  const [t, employees, params] = await Promise.all([
    getT(),
    db.employee.findMany({
      where: { isArchived: false, employmentStatus: { not: "TERMINATED" } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        nationalId: true,
        employeeNo: true,
        department: true,
      },
    }),
    searchParams,
  ]);

  return (
    <>
      <PageHeader
        title={t("needle.register")}
        subtitle={t("needle.formSubtitle")}
        actions={
          <LinkButton href="/needle-stick">{t("action.back")}</LinkButton>
        }
      />
      <NeedleStickIncidentForm
        employees={employees}
        preferredEmployeeId={params.employeeId}
        defaultIncidentAt={toDateTimeInput(new Date())}
      />
    </>
  );
}
