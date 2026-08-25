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
        <Alert tone="info" title={t("empimp.fileHint")}>
          {t.locale === "ar"
            ? "يقبل ملف Excel أو CSV. يكفي وجود عمودين: رقم الهوية والاسم — وتُقرأ العناوين تلقائياً من أي صف ضمن أول ١٥ صفاً، فلا تحتاج لحذف صفوف العنوان أعلى الجدول. باقي الأعمدة اختيارية وتُتعرَّف بالعربية أو الإنجليزية."
            : "Accepts Excel or CSV. Two columns are enough — national ID and name. Headers are detected automatically in any of the first 15 rows, so title rows above the table are fine. Other columns are optional and matched in Arabic or English."}
        </Alert>
      </div>

      <Card>
        <SectionTitle>{t("action.upload")}</SectionTitle>
        <EmployeeImportForm />
      </Card>
    </>
  );
}
