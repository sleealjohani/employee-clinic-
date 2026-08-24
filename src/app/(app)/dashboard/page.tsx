import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { getT } from "@/lib/i18n";
import { addDays, formatDate, formatShortDate, percent, startOfDay } from "@/lib/format";
import { completeness } from "@/lib/clinical/rules";
import { hbvStatus, hbvTone, type HbvStatus } from "@/lib/clinical/hbv";
import { loadDueItems } from "@/server/queries/due";
import { Alert, Card, Chip, Empty, Meter, PageHeader, SectionTitle } from "@/components/ui";
import { ColumnChart, RowBars, StatTile } from "@/components/charts/Charts";

export const metadata = { title: "لوحة التحكم" };
export const dynamic = "force-dynamic";

const HBV_ORDER: HbvStatus[] = [
  "PROTECTED",
  "SERIES_INCOMPLETE",
  "SUSCEPTIBLE",
  "NON_RESPONDER",
  "INFECTED",
  "NO_DATA",
];

export default async function DashboardPage() {
  const user = await requireUser();
  const t = await getT();
  const clinical = can(user.role, "clinical.read");

  const todayStart = startOfDay();
  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  const weeksBack = 12;
  const chartStart = addDays(todayStart, -7 * weeksBack + 1);

  const [
    activeEmployees,
    visitsToday,
    visitsMonth,
    labsTotal,
    criticalOpen,
    needsReview,
    unmatched,
    recentVisits,
    employeeRows,
    visitDates,
  ] = await Promise.all([
    db.employee.count({ where: { isArchived: false, employmentStatus: { not: "TERMINATED" } } }),
    db.visit.count({ where: { status: "ACTIVE", visitDate: { gte: todayStart } } }),
    db.visit.count({ where: { status: "ACTIVE", visitDate: { gte: monthStart } } }),
    clinical ? db.labResult.count({ where: { status: "ACTIVE" } }) : Promise.resolve(0),
    clinical
      ? db.labResult.count({
          where: { status: "ACTIVE", criticalNotifiedAt: null, flag: { in: ["CRITICAL_HIGH", "CRITICAL_LOW"] } },
        })
      : Promise.resolve(0),
    clinical
      ? db.labResult.count({ where: { status: "ACTIVE", requiresReview: true, reviewedAt: null } })
      : Promise.resolve(0),
    can(user.role, "import.run")
      ? db.labImportItem.count({ where: { matchStatus: "UNMATCHED", review: "PENDING" } })
      : Promise.resolve(0),
    clinical
      ? db.visit.findMany({
          where: { status: "ACTIVE" },
          orderBy: { visitDate: "desc" },
          take: 8,
          include: { employee: { select: { id: true, name: true, department: true } } },
        })
      : Promise.resolve([]),
    db.employee.findMany({
      where: { isArchived: false, employmentStatus: { not: "TERMINATED" } },
      select: {
        id: true,
        department: true,
        nationalId: true,
        name: true,
        dob: true,
        gender: true,
        phone: true,
        employeeNo: true,
        jobTitle: true,
        hireDate: true,
        bloodType: true,
        vaccinations: { where: { status: "ACTIVE" }, select: { vaccineCode: true } },
        labResults: {
          where: { status: "ACTIVE" },
          select: { testCode: true, flag: true, valueNum: true, collectedAt: true },
        },
      },
    }),
    db.visit.findMany({
      where: { status: "ACTIVE", visitDate: { gte: chartStart } },
      select: { visitDate: true },
    }),
  ]);

  // --- weekly visit counts
  const buckets = Array.from({ length: weeksBack }, (_, i) => {
    const start = addDays(chartStart, i * 7);
    return { start, end: addDays(start, 7), value: 0 };
  });
  for (const v of visitDates) {
    const idx = Math.floor((v.visitDate.getTime() - chartStart.getTime()) / (7 * 86_400_000));
    if (idx >= 0 && idx < buckets.length) buckets[idx].value++;
  }
  const visitSeries = buckets.map((b) => ({
    label: formatShortDate(b.start, t.locale),
    value: b.value,
    title: `${formatDate(b.start, t.locale)} — ${formatDate(addDays(b.start, 6), t.locale)}: ${b.value}`,
  }));

  // --- immunity distribution and record completeness
  const hbvCounts = new Map<HbvStatus, number>(HBV_ORDER.map((s) => [s, 0]));
  let completenessSum = 0;
  let incompleteFiles = 0;
  const byDepartment = new Map<string, number>();

  for (const emp of employeeRows) {
    const hepB = emp.vaccinations.filter((v) => v.vaccineCode === "HEP_B").length;
    const status = hbvStatus(emp.labResults, hepB, t.locale).status;
    hbvCounts.set(status, (hbvCounts.get(status) ?? 0) + 1);

    const c = completeness(emp);
    completenessSum += c.score;
    if (c.missing.length > 0) incompleteFiles++;

    const dept = emp.department ?? t("common.none");
    byDepartment.set(dept, (byDepartment.get(dept) ?? 0) + 1);
  }

  const avgCompleteness = employeeRows.length ? Math.round(completenessSum / employeeRows.length) : 0;
  const protectedCount = hbvCounts.get("PROTECTED") ?? 0;

  const departments = [...byDepartment.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const due = clinical ? await loadDueItems(t.locale) : [];
  const overdue = due.filter((d) => d.urgency === "OVERDUE");
  const dueSoonVaccines = due.filter((d) => d.kind === "VACCINE" && d.urgency !== "OVERDUE").length;
  const overdueVaccines = due.filter((d) => d.kind === "VACCINE" && d.urgency === "OVERDUE").length;

  const actionTiles = [
    {
      label: t("dash.criticalOpen"),
      value: criticalOpen,
      tone: "danger" as const,
      href: "/labs?queue=critical",
    },
    { label: t("dash.needsReview"), value: needsReview, tone: "warn" as const, href: "/labs?queue=review" },
    { label: t("dash.vaccineOverdue"), value: overdueVaccines, tone: "danger" as const, href: "/due?kind=VACCINE" },
    { label: t("dash.vaccineDueSoon"), value: dueSoonVaccines, tone: "warn" as const, href: "/due?kind=VACCINE" },
    { label: t("dash.incompleteFiles"), value: incompleteFiles, tone: "warn" as const, href: "/due?kind=PROFILE" },
    ...(can(user.role, "import.run")
      ? [{ label: t("dash.unmatchedImports"), value: unmatched, tone: "warn" as const, href: "/labs/import" }]
      : []),
  ].filter((tile) => tile.value > 0);

  return (
    <>
      <PageHeader
        title={t("dash.title")}
        subtitle={t("dash.subtitle")}
        badge={<Chip tone="neutral">{formatDate(new Date(), t.locale)}</Chip>}
      />

      {clinical && (
        <section className="mb-5">
          <SectionTitle>{t("dash.needsAction")}</SectionTitle>
          {actionTiles.length === 0 ? (
            <Alert tone="ok">{t("dash.noAction")}</Alert>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {actionTiles.map((tile) => (
                <StatTile key={tile.label} label={tile.label} value={tile.value} tone={tile.tone} href={tile.href} />
              ))}
            </div>
          )}
        </section>
      )}

      <section className="mb-5">
        <SectionTitle>{t("dash.overview")}</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label={t("dash.activeEmployees")} value={activeEmployees} href="/employees" />
          <StatTile label={t("dash.visitsToday")} value={visitsToday} hint={`${t("dash.visitsMonth")}: ${visitsMonth}`} href="/visits" />
          {clinical && <StatTile label={t("dash.labsTotal")} value={labsTotal} href="/labs" />}
          <StatTile
            label={t("dash.fileCompleteness")}
            value={`${avgCompleteness}%`}
            hint={t("dash.definition") + ": " + (t.locale === "ar" ? "١٠ حقول أساسية" : "10 core fields")}
            tone="accent"
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle>{t("dash.visitTrend")}</SectionTitle>
          <ColumnChart data={visitSeries} emptyLabel={t("common.empty")} />
        </Card>

        <Card>
          <SectionTitle>{t("dash.byDepartment")}</SectionTitle>
          <RowBars data={departments} emptyLabel={t("common.empty")} />
        </Card>

        {clinical && (
          <Card className="lg:col-span-2">
            <SectionTitle
              action={
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  <bdi>{t("dash.hbvProtected")}</bdi>
                  {": "}
                  <span className="num">{percent(protectedCount, employeeRows.length)}%</span>
                </span>
              }
            >
              {t("dash.hbvBreakdown")}
            </SectionTitle>
            {/* A table rather than a stacked bar: six clinical states cannot be told
                apart by colour alone, so the label carries the identity. */}
            <ul className="space-y-2.5">
              {HBV_ORDER.map((status) => {
                const count = hbvCounts.get(status) ?? 0;
                if (count === 0) return null;
                const pct = percent(count, employeeRows.length);
                const tone = hbvTone(status);
                return (
                  <li key={status} className="grid grid-cols-[minmax(9rem,13rem)_1fr_3.4rem] items-center gap-3">
                    <span className="flex items-center gap-1.5 text-xs">
                      <Chip tone={tone === "neutral" ? "neutral" : tone} dot>
                        {t(`hbv.${status}`)}
                      </Chip>
                    </span>
                    <Meter value={pct} tone={tone === "neutral" ? "neutral" : tone} />
                    <span className="num text-end text-xs font-bold">
                      {count} <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>({pct}%)</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {clinical && (
          <Card pad={false}>
            <div className="px-4 pt-4">
              <SectionTitle
                action={
                  <Link href="/visits" className="text-xs font-semibold" style={{ color: "var(--accent-text)" }}>
                    {t("common.showMore")}
                  </Link>
                }
              >
                {t("dash.recentVisits")}
              </SectionTitle>
            </div>
            {recentVisits.length === 0 ? (
              <Empty title={t("common.empty")} />
            ) : (
              <ul>
                {recentVisits.map((v) => (
                  <li key={v.id} className="border-t px-4 py-2.5">
                    <Link href={`/employees/${v.employee.id}?tab=visits`} className="flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{v.employee.name}</span>
                        <span className="block truncate text-xs" style={{ color: "var(--text-faint)" }}>
                          {t(`visitType.${v.type}`)}
                          {v.employee.department ? ` · ${v.employee.department}` : ""}
                        </span>
                      </span>
                      <span className="num shrink-0 text-xs" style={{ color: "var(--text-faint)" }}>
                        {formatDate(v.visitDate, t.locale)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      {clinical && overdue.length > 0 && (
        <div className="mt-4">
          <Card>
            <SectionTitle
              action={
                <Link href="/due" className="text-xs font-semibold" style={{ color: "var(--accent-text)" }}>
                  {t("common.showMore")}
                </Link>
              }
            >
              {t("due.status.OVERDUE")} ({overdue.length})
            </SectionTitle>
            <ul className="space-y-1.5">
              {overdue.slice(0, 6).map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <Link href={item.href} className="font-semibold" style={{ color: "var(--accent-text)" }}>
                    {item.employeeName}
                  </Link>
                  <span style={{ color: "var(--text-muted)" }}>
                    {item.title} — {item.detail}
                  </span>
                  <span className="num text-xs" style={{ color: "var(--danger)" }}>
                    {item.daysLate > 0 ? `${item.daysLate}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {!clinical && (
        <div className="mt-4">
          <Alert tone="info">{t("rep.hrNotice")}</Alert>
        </div>
      )}
    </>
  );
}
