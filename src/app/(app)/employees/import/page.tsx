import { requirePermission } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { EmployeeImportForm } from "./EmployeeImportForm";

export const metadata = { title: "استيراد الموظفين" };
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function EmployeeImportPage() {
  await requirePermission("employee.write");
  const t = await getT();

  return (
    <>
      <PageHeader
        title={t("empimp.title")}
        actions={<LinkButton href="/employees">{t("action.back")}</LinkButton>}
      />

      <Card>
        <EmployeeImportForm />
      </Card>
    </>
  );
}
