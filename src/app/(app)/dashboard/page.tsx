import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { getT } from "@/lib/i18n";
import { addDays, formatDate, formatShortDate, percent, startOfDay } from "@/lib/format";
import { completeness } from "@/lib/clinical/rules";
import { hbvStatus, hbvTone, type HbvStatus } from "@/lib/clinical/hbv";
import { loadDueItems } from "@/server/queries/due";
import { Chip, Meter } from "@/components/ui";
import { ColumnChart, RowBars } from "@/components/charts/Charts";
import { AnimatedMetric } from "@/components/dashboard/AnimatedMetric";
import "./dashboard.css";

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

type ActionKind = "critical" | "review" | "vaccine" | "profile" | "import" | "due";

function ActionGlyph({ kind }: { kind: ActionKind }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true } as const;

  if (kind === "critical") {
    return (
      <svg {...common}>
        <path d="M12 8v5m0 3h.01M10.2 4.6 3.7 16a2 2 0 0 0 1.73 3h13.14a2 2 0 0 0 1.73-3L13.8 4.6a2 2 0 0 0-3.6 0Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "review") {
    return (
      <svg {...common}>
        <path d="M8 6h8M8 10h8M8 14h5M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "vaccine") {
    return (
      <svg {...common}>
        <path d="m15 4 5 5M13.5 5.5l5 5M6.5 18.5l-1 2m7.5-9.5-7.2 7.2a2 2 0 0 0 2.8 2.8l7.2-7.2M4 14l6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "profile") {
    return (
      <svg {...common}>
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "import") {
    return (
      <svg {...common}>
        <path d="M12 3v12m0 0-4-4m4 4 4-4M5 20h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 6v6l4 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="m9 18 6-6-6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const t = await getT();
  const ar = t.locale === "ar";
  const clinical = can(user.role, "clinical.read");
  const canImport = can(user.role, "import.run");
  const canWriteEmployee = can(user.role, "employee.write");

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
    canImport
      ? db.labImportItem.count({ where: { matchStatus: "UNMATCHED", review: "PENDING" } })
      : Promise.resolve(0),
    clinical
      ? db.visit.findMany({
          where: { status: "ACTIVE" },
          orderBy: { visitDate: "desc" },
          take: 7,
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
  const protectedPct = percent(protectedCount, employeeRows.length);

  const departments = [...byDepartment.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const due = clinical ? await loadDueItems(t.locale) : [];
  const overdue = due.filter((d) => d.urgency === "OVERDUE");
  const dueSoonVaccines = due.filter((d) => d.kind === "VACCINE" && d.urgency !== "OVERDUE").length;
  const overdueVaccines = due.filter((d) => d.kind === "VACCINE" && d.urgency === "OVERDUE").length;

  const actionTiles: Array<{
    label: string;
    hint: string;
    value: number;
    tone: "danger" | "warn" | "ok" | "accent";
    href: string;
    kind: ActionKind;
  }> = [
    {
      label: t("dash.criticalOpen"),
      hint: ar ? "نتائج حرجة لم يُوثق الإجراء عليها" : "Critical results without a documented action",
      value: criticalOpen,
      tone: "danger",
      href: "/labs?queue=critical",
      kind: "critical",
    },
    {
      label: t("dash.needsReview"),
      hint: ar ? "نتائج تنتظر المراجعة السريرية" : "Results awaiting clinical review",
      value: needsReview,
      tone: "warn",
      href: "/labs?queue=review",
      kind: "review",
    },
    {
      label: t("dash.vaccineOverdue"),
      hint: ar ? "جرعات تجاوزت موعد الاستحقاق" : "Vaccines past their due date",
      value: overdueVaccines,
      tone: "danger",
      href: "/due?kind=VACCINE",
      kind: "vaccine",
    },
    {
      label: t("dash.vaccineDueSoon"),
      hint: ar ? "جرعات قريبة وتحتاج تخطيطًا" : "Upcoming doses that need planning",
      value: dueSoonVaccines,
      tone: "warn",
      href: "/due?kind=VACCINE",
      kind: "due",
    },
    {
      label: t("dash.incompleteFiles"),
      hint: ar ? "ملفات ينقصها حقل أساسي واحد أو أكثر" : "Profiles missing one or more core fields",
      value: incompleteFiles,
      tone: "warn",
      href: "/due?kind=PROFILE",
      kind: "profile",
    },
    ...(canImport
      ? [
          {
            label: t("dash.unmatchedImports"),
            hint: ar ? "نتائج مستوردة لم تُطابق مع موظف" : "Imported results not matched to an employee",
            value: unmatched,
            tone: "warn" as const,
            href: "/labs/import",
            kind: "import" as const,
          },
        ]
      : []),
  ].filter((tile) => tile.value > 0);

  const systemState = criticalOpen > 0
    ? ar
      ? "يوجد إجراء سريري عاجل"
      : "Urgent clinical action required"
    : needsReview > 0 || overdue.length > 0
      ? ar
        ? "توجد عناصر تحتاج متابعة"
        : "Items need follow-up"
      : ar
        ? "لا توجد إجراءات حرجة مفتوحة"
        : "No open critical actions";

  return (
    <div className="clinic-dashboard">
      <section className="clinic-dashboard-hero">
        <div className="relative z-[1] min-w-0">
          <span className="clinic-dashboard-kicker">
            <span className="clinic-dashboard-live-dot" aria-hidden />
            {ar ? "مركز القيادة السريري" : "CLINICAL COMMAND CENTER"}
          </span>
          <h1 className="clinic-dashboard-title">
            {ar ? `مرحبًا ${user.name}` : `Welcome, ${user.name}`}
          </h1>
          <p className="clinic-dashboard-subtitle">
            {ar
              ? "صورة تشغيلية واحدة لعيادة الموظف: ما يحتاج إجراء الآن، نشاط اليوم، وجاهزية الملفات الصحية دون تشتيت بين الشاشات."
              : "One operational view of the employee clinic: what needs action now, today's activity, and record readiness without jumping between screens."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Chip tone={criticalOpen > 0 ? "danger" : needsReview > 0 ? "warn" : "ok"} dot>
              {systemState}
            </Chip>
            <Chip tone="neutral">{formatDate(new Date(), t.locale)}</Chip>
          </div>
        </div>

        <div className="clinic-dashboard-actions relative z-[1]">
          <Link href="/employees" prefetch={false} className="clinic-dashboard-action-link">
            {ar ? "بحث الموظفين" : "Find employee"} <ArrowGlyph />
          </Link>
          {canWriteEmployee && (
            <Link href="/employees/new" prefetch={false} className="clinic-dashboard-action-link" data-primary="true">
              {ar ? "موظف جديد" : "New employee"} <span aria-hidden>＋</span>
            </Link>
          )}
          {canImport && (
            <Link href="/labs/import" prefetch={false} className="clinic-dashboard-action-link">
              {ar ? "استيراد تحليل" : "Import lab"}
            </Link>
          )}
        </div>
      </section>

      {clinical && (
        <section>
          <div className="clinic-dashboard-section-label">
            <div>
              <h2>{ar ? "يحتاج إجراء الآن" : "Needs action now"}</h2>
              <p>{ar ? "مرتبة حسب الأثر السريري والتشغيلي" : "Prioritized by clinical and operational impact"}</p>
            </div>
            <Link href="/due" prefetch={false}>{ar ? "عرض جميع المستحقات" : "View all due items"}</Link>
          </div>

          {actionTiles.length === 0 ? (
            <div className="clinic-dashboard-empty-state">
              <span aria-hidden>✓</span>
              <span>{t("dash.noAction")}</span>
            </div>
          ) : (
            <div className="clinic-dashboard-priority-grid">
              {actionTiles.map((tile) => (
                <Link
                  key={`${tile.kind}-${tile.href}`}
                  href={tile.href}
                  prefetch={false}
                  className="clinic-dashboard-priority"
                  data-tone={tile.tone}
                >
                  <span className="clinic-dashboard-priority-icon">
                    <ActionGlyph kind={tile.kind} />
                  </span>
                  <span className="min-w-0">
                    <span className="clinic-dashboard-priority-title block">{tile.label}</span>
                    <span className="clinic-dashboard-priority-hint block">{tile.hint}</span>
                  </span>
                  <AnimatedMetric value={tile.value} className="clinic-dashboard-priority-value" />
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <div className="clinic-dashboard-section-label">
          <div>
            <h2>{ar ? "نبض اليوم" : "Today's pulse"}</h2>
            <p>{ar ? "أرقام تشغيلية سريعة بدون بطاقات زائدة" : "Fast operational numbers without card overload"}</p>
          </div>
        </div>
        <div className="clinic-dashboard-metrics">
          <Link href="/employees" prefetch={false} className="clinic-dashboard-metric">
            <p className="clinic-dashboard-metric-label">{t("dash.activeEmployees")}</p>
            <AnimatedMetric value={activeEmployees} className="clinic-dashboard-metric-value block" />
            <p className="clinic-dashboard-metric-hint">{ar ? "ملف موظف نشط" : "active employee records"}</p>
          </Link>
          <Link href="/visits" prefetch={false} className="clinic-dashboard-metric">
            <p className="clinic-dashboard-metric-label">{t("dash.visitsToday")}</p>
            <AnimatedMetric value={visitsToday} className="clinic-dashboard-metric-value block" />
            <p className="clinic-dashboard-metric-hint">{ar ? `${visitsMonth} زيارة هذا الشهر` : `${visitsMonth} visits this month`}</p>
          </Link>
          <div className="clinic-dashboard-metric">
            <p className="clinic-dashboard-metric-label">{ar ? "زيارات الشهر" : "Visits this month"}</p>
            <AnimatedMetric value={visitsMonth} className="clinic-dashboard-metric-value block" />
            <p className="clinic-dashboard-metric-hint">{ar ? "من بداية الشهر حتى اليوم" : "month to date"}</p>
          </div>
          <div className="clinic-dashboard-metric">
            <p className="clinic-dashboard-metric-label">{t("dash.fileCompleteness")}</p>
            <AnimatedMetric value={avgCompleteness} suffix="%" className="clinic-dashboard-metric-value block" />
            <p className="clinic-dashboard-metric-hint">{ar ? "متوسط اكتمال الحقول الأساسية" : "average core-field completeness"}</p>
          </div>
        </div>
      </section>

      <section className="clinic-dashboard-main-grid">
        <div className="clinic-dashboard-panel clinic-dashboard-span-wide">
          <div className="clinic-dashboard-section-label">
            <div>
              <h2>{t("dash.visitTrend")}</h2>
              <p>{ar ? "اتجاه الزيارات خلال آخر 12 أسبوعًا" : "Visit activity over the last 12 weeks"}</p>
            </div>
            <Link href="/visits" prefetch={false}>{t("common.showMore")}</Link>
          </div>
          <ColumnChart data={visitSeries} height={190} labelEvery={2} emptyLabel={t("common.empty")} />
        </div>

        <aside className="clinic-dashboard-panel" data-glass="true">
          <div className="clinic-dashboard-section-label">
            <div>
              <h2>{ar ? "الحالة السريرية" : "Clinical pulse"}</h2>
              <p>{ar ? "أهم مؤشرات الجاهزية" : "Key readiness signals"}</p>
            </div>
          </div>
          <div className="clinic-dashboard-pulse-grid">
            <div className="clinic-dashboard-pulse-item">
              <p className="clinic-dashboard-pulse-label">{ar ? "إجمالي التحاليل" : "Lab results"}</p>
              <AnimatedMetric value={labsTotal} className="clinic-dashboard-pulse-value block" />
            </div>
            <div className="clinic-dashboard-pulse-item">
              <p className="clinic-dashboard-pulse-label">{t("dash.hbvProtected")}</p>
              <AnimatedMetric value={protectedPct} suffix="%" className="clinic-dashboard-pulse-value block" />
            </div>
            <div className="clinic-dashboard-pulse-item">
              <p className="clinic-dashboard-pulse-label">{t("dash.needsReview")}</p>
              <AnimatedMetric value={needsReview} className="clinic-dashboard-pulse-value block" />
            </div>
            <div className="clinic-dashboard-pulse-item">
              <p className="clinic-dashboard-pulse-label">{t("dash.criticalOpen")}</p>
              <AnimatedMetric value={criticalOpen} className="clinic-dashboard-pulse-value block" />
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-[0.68rem]">
              <span style={{ color: "var(--text-muted)" }}>{t("dash.fileCompleteness")}</span>
              <span className="num font-bold">{avgCompleteness}%</span>
            </div>
            <Meter value={avgCompleteness} tone={avgCompleteness >= 90 ? "ok" : avgCompleteness >= 70 ? "accent" : "warn"} />
          </div>
        </aside>
      </section>

      <section className="clinic-dashboard-bottom-grid">
        {clinical && (
          <div className="clinic-dashboard-panel">
            <div className="clinic-dashboard-section-label">
              <div>
                <h2>{ar ? "النشاط السريري الأخير" : "Recent clinical activity"}</h2>
                <p>{ar ? "آخر الزيارات المسجلة" : "Latest recorded visits"}</p>
              </div>
              <Link href="/visits" prefetch={false}>{t("common.showMore")}</Link>
            </div>

            {recentVisits.length === 0 ? (
              <p className="py-8 text-center text-xs" style={{ color: "var(--text-faint)" }}>{t("common.empty")}</p>
            ) : (
              <div className="clinic-dashboard-timeline">
                {recentVisits.map((v) => (
                  <Link
                    key={v.id}
                    href={`/employees/${v.employee.id}?tab=visits`}
                    prefetch={false}
                    className="clinic-dashboard-timeline-item"
                  >
                    <span className="clinic-dashboard-timeline-dot" aria-hidden />
                    <span className="min-w-0">
                      <span className="clinic-dashboard-timeline-name block truncate">{v.employee.name}</span>
                      <span className="clinic-dashboard-timeline-meta block truncate">
                        {t(`visitType.${v.type}`)}{v.employee.department ? ` · ${v.employee.department}` : ""}
                      </span>
                    </span>
                    <span className="clinic-dashboard-timeline-date num">{formatDate(v.visitDate, t.locale)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="clinic-dashboard-panel" data-glass="true">
          <div className="clinic-dashboard-section-label">
            <div>
              <h2>{t("dash.byDepartment")}</h2>
              <p>{ar ? "توزيع الموظفين النشطين" : "Active employee distribution"}</p>
            </div>
          </div>
          <RowBars data={departments} emptyLabel={t("common.empty")} />
        </div>
      </section>

      {clinical && (
        <section className="clinic-dashboard-main-grid">
          <div className="clinic-dashboard-panel">
            <div className="clinic-dashboard-section-label">
              <div>
                <h2>{t("dash.hbvBreakdown")}</h2>
                <p>{ar ? "حالة المناعة لالتهاب الكبد B" : "Hepatitis B immunity status"}</p>
              </div>
              <span className="text-[0.7rem]" style={{ color: "var(--text-muted)" }}>
                {t("dash.hbvProtected")}: <b className="num">{protectedPct}%</b>
              </span>
            </div>
            <ul className="space-y-2.5">
              {HBV_ORDER.map((status) => {
                const count = hbvCounts.get(status) ?? 0;
                if (count === 0) return null;
                const pct = percent(count, employeeRows.length);
                const tone = hbvTone(status);
                return (
                  <li key={status} className="grid grid-cols-[minmax(8.5rem,13rem)_1fr_3.6rem] items-center gap-3">
                    <Chip tone={tone === "neutral" ? "neutral" : tone} dot>{t(`hbv.${status}`)}</Chip>
                    <Meter value={pct} tone={tone === "neutral" ? "neutral" : tone} />
                    <span className="num text-end text-xs font-bold">{count} <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>({pct}%)</span></span>
                  </li>
                );
              })}
            </ul>
          </div>

          <aside className="clinic-dashboard-panel" data-glass="true">
            <div className="clinic-dashboard-section-label">
              <div>
                <h2>{ar ? "قائمة المتابعة" : "Follow-up inbox"}</h2>
                <p>{ar ? "أكثر العناصر تأخرًا" : "Most overdue items"}</p>
              </div>
              <Link href="/due" prefetch={false}>{t("common.showMore")}</Link>
            </div>

            {overdue.length === 0 ? (
              <div className="clinic-dashboard-empty-state"><span aria-hidden>✓</span><span>{ar ? "لا توجد عناصر متأخرة" : "No overdue items"}</span></div>
            ) : (
              <div className="clinic-dashboard-overdue">
                {overdue.slice(0, 6).map((item) => (
                  <Link key={item.id} href={item.href} prefetch={false} className="clinic-dashboard-overdue-item">
                    <span className="clinic-dashboard-overdue-name truncate">{item.employeeName}</span>
                    <span className="clinic-dashboard-overdue-detail">{item.title} — {item.detail}</span>
                    <span className="clinic-dashboard-overdue-days num">{item.daysLate > 0 ? `${item.daysLate}${ar ? " ي" : "d"}` : ""}</span>
                  </Link>
                ))}
              </div>
            )}
          </aside>
        </section>
      )}

      {!clinical && (
        <section className="clinic-dashboard-panel" data-glass="true">
          <p className="text-sm" style={{ color: "var(--info)" }}>{t("rep.hrNotice")}</p>
        </section>
      )}
    </div>
  );
}
