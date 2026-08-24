import Link from "next/link";
import { requirePath } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { getT } from "@/lib/i18n";
import { addDays, startOfDay, toDateInput } from "@/lib/format";
import { buildAggregateSummary, buildReport, REPORTS, reportById, type ReportId } from "@/server/queries/reports";
import { Alert, Card, Chip, Empty, PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/ui/PrintButton";
import { DownloadLink } from "@/components/ui/DownloadLink";

export const metadata = { title: "التقارير" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string; from?: string; to?: string }>;
}) {
  const user = await requirePath("/reports");
  const t = await getT();
  const params = await searchParams;

  const detailed = can(user.role, "reports.detailed");
  const available = REPORTS.filter((r) => can(user.role, r.permission));
  const meta = reportById(params.report ?? "") ?? available[0];

  const from = params.from ? new Date(params.from) : addDays(startOfDay(), -30);
  const to = params.to ? new Date(`${params.to}T23:59:59`) : new Date();

  const table = detailed
    ? await buildReport((meta?.id ?? "visits") as ReportId, t.locale, { from, to })
    : await buildAggregateSummary(t.locale);

  const exportHref = `/api/export/${meta?.id ?? "visits"}?from=${toDateInput(from)}&to=${toDateInput(to)}`;

  return (
    <>
      <PageHeader
        title={t("rep.title")}
        subtitle={t("rep.subtitle")}
        badge={
          <Chip tone="neutral">
            {t("rep.rows")}: {table.rows.length}
          </Chip>
        }
        actions={
          <>
            <DownloadLink href={exportHref}>{t("action.export")}</DownloadLink>
            <PrintButton />
          </>
        }
      />

      {!detailed && (
        <div className="mb-4">
          <Alert tone="info">{t("rep.hrNotice")}</Alert>
        </div>
      )}

      {detailed && (
        <>
          <div className="mb-3 flex flex-wrap gap-2 no-print">
            {available.map((r) => (
              <Link
                key={r.id}
                href={`/reports?report=${r.id}&from=${toDateInput(from)}&to=${toDateInput(to)}`}
                className={`btn btn-sm ${meta?.id === r.id ? "btn-primary" : "btn-ghost"}`}
              >
                {t(r.labelKey)}
              </Link>
            ))}
          </div>

          {meta?.dateRange && (
            <Card className="mb-4">
              <form method="get" className="flex flex-wrap items-end gap-2.5">
                <input type="hidden" name="report" value={meta.id} />
                <div>
                  <label className="label" htmlFor="from">
                    {t("rep.from")}
                  </label>
                  <input id="from" className="input" type="date" name="from" defaultValue={toDateInput(from)} />
                </div>
                <div>
                  <label className="label" htmlFor="to">
                    {t("rep.to")}
                  </label>
                  <input id="to" className="input" type="date" name="to" defaultValue={toDateInput(to)} />
                </div>
                <button type="submit" className="btn btn-ghost">
                  {t("rep.generate")}
                </button>
              </form>
            </Card>
          )}
        </>
      )}

      <Card pad={false}>
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-bold">{table.title}</h2>
          <p className="text-xs" style={{ color: "var(--text-faint)" }}>
            {t("app.hospital")} — {t("app.name")}
          </p>
        </div>
        {table.rows.length === 0 ? (
          <Empty title={t("common.empty")} hint={t("common.emptyHint")} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  {table.columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.slice(0, 500).map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} className={typeof cell === "number" ? "num" : undefined}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {table.rows.length > 500 && (
          <p className="px-4 py-3 text-xs" style={{ color: "var(--text-faint)" }}>
            {t("common.showMore")} — {t("action.export")}
          </p>
        )}
      </Card>
    </>
  );
}
