import { requirePermission } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { Alert, Card, LinkButton, PageHeader, SectionTitle } from "@/components/ui";
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
        title={`${t("emp.title")} — Excel`}
        subtitle={t("emp.subtitle")}
        actions={<LinkButton href="/employees">{t("action.back")}</LinkButton>}
      />

      <div className="mb-4">
        <Alert tone="info" title={t("imp.uploadHint")}>
          {t.locale === "ar"
            ? "يقبل ملف Excel أو CSV. يجب أن يحتوي الصف الأول على عناوين الأعمدة، وأن يوجد عمودان على الأقل: رقم الهوية والاسم. باقي الأعمدة اختيارية وتُتعرَّف تلقائياً بالعربية أو الإنجليزية."
            : "Accepts Excel or CSV. The first row must be headers, and at least a national ID column and a name column must be present. Other columns are optional and matched automatically in Arabic or English."}
        </Alert>
      </div>

      <Card>
        <SectionTitle>{t("action.upload")}</SectionTitle>
        <EmployeeImportForm />
      </Card>
    </>
  );
}
