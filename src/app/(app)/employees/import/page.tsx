import { requirePermission } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { EmployeeImportForm } from "./EmployeeImportForm";
import { db } from "@/lib/db";
import { z } from "zod";
import { formatDate } from "@/lib/format";

const reportSchema = z.object({
  at: z.string(),
  created: z.number(),
  updated: z.number(),
  skipped: z.number(),
  issues: z.array(
    z.object({
      row: z.number(),
      reason: z.string().nullable(),
      notes: z.array(z.string()),
    }),
  ),
});

export const metadata = { title: "استيراد الموظفين" };
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function EmployeeImportPage() {
  await requirePermission("employee.write");
  const t = await getT();
  const stored = await db.setting.findUnique({
    where: { key: "employees.import.latest" },
  });
  let report: z.infer<typeof reportSchema> | null = null;
  if (stored) {
    try {
      const parsed = reportSchema.safeParse(JSON.parse(stored.value));
      if (parsed.success) report = parsed.data;
    } catch {
      /* A damaged historical report does not block a new import. */
    }
  }

  return (
    <>
      <PageHeader
        title={t("empimp.title")}
        actions={<LinkButton href="/employees">{t("action.back")}</LinkButton>}
      />

      <Card>
        <EmployeeImportForm />
      </Card>
      {report && (
        <Card className="mt-6">
          <h2 className="section-title">{t("v2.lastImport")}</h2>
          <p className="muted">{formatDate(report.at, t.locale)}</p>
          <p className="mt-3">
            {t("v2.importSummary", {
              created: report.created,
              updated: report.updated,
              skipped: report.skipped,
            })}
          </p>
          {report.issues.length > 0 && (
            <>
              <p className="muted mt-3">{t("v2.importIssuesHint")}</p>
              <div className="table-wrap mt-4">
                <table className="data">
                  <thead>
                    <tr>
                      <th>{t("v2.sourceRow")}</th>
                      <th>{t("common.notes")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.issues.map((issue) => (
                      <tr key={issue.row}>
                        <td className="num">{issue.row}</td>
                        <td>
                          {[issue.reason, ...issue.notes]
                            .filter(Boolean)
                            .map((key) => t(key!))
                            .join(" · ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}
    </>
  );
}
