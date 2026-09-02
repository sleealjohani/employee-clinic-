import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { getClinicConfig } from "@/server/queries/settings";
import { loadDueItems } from "@/server/queries/due";
import {
  clinicDay,
  clinicDateTime,
  profileCompletion,
} from "@/lib/clinic-config";
import { formatDate, formatShortDate } from "@/lib/format";
import { Card, Chip, Meter, Empty, SectionTitle } from "@/components/ui";
import { AppointmentList } from "@/components/clinic/AppointmentList";
import { ColumnChart } from "@/components/charts/Charts";
import {
  IconEmployees,
  IconVisit,
  IconLab,
  IconDue as IconClock,
} from "@/components/layout/icons";
export const dynamic = "force-dynamic";
export default async function Dashboard() {
  const user = await requireUser();
  if (user.role === "EMPLOYEE") redirect("/portal");
  if (user.role === "VIEWER") redirect("/reports");
  const t = await getT(),
    today = clinicDay(),
    start = clinicDateTime(today),
    end = new Date(start.getTime() + 86400000),
    since = new Date(start.getTime() - 13 * 86400000);
  const [
    config,
    employees,
    todayVisits,
    appointments,
    appointmentCount,
    pendingRequests,
    due,
    recentVisits,
    pendingImports,
  ] = await Promise.all([
    getClinicConfig(),
    db.employee.findMany({
      where: { isArchived: false, employmentStatus: { not: "TERMINATED" } },
    }),
    db.visit.count({
      where: { status: "ACTIVE", visitDate: { gte: start, lt: end } },
    }),
    db.appointment.findMany({
      where: {
        startsAt: { gte: start, lt: end },
        status: { not: "CANCELLED" },
      },
      include: {
        service: true,
        employee: { select: { name: true, id: true } },
      },
      orderBy: { startsAt: "asc" },
      take: 6,
    }),
    db.appointment.count({
      where: {
        startsAt: { gte: start, lt: end },
        status: { not: "CANCELLED" },
      },
    }),
    db.serviceRequest.count({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
    }),
    loadDueItems(t.locale),
    db.visit.findMany({
      where: { status: "ACTIVE", visitDate: { gte: since, lt: end } },
      select: { visitDate: true },
    }),
    db.labImportBatch.count({
      where: {
        status: { in: ["FAILED", "NEEDS_REVIEW", "UPLOADED", "EXTRACTING"] },
      },
    }),
  ]);
  const complete = employees.filter(
    (e) => profileCompletion(e, config.requiredProfileFields).percent === 100,
  ).length;
  const completePercent = employees.length
    ? Math.round((complete / employees.length) * 100)
    : 0;
  const critical = due.filter((d) => d.kind === "CRITICAL").length,
    review = due.filter((d) => d.kind === "REVIEW").length;
  const chart = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(since.getTime() + i * 86400000),
      key = clinicDay(date);
    return {
      label: formatShortDate(date, t.locale),
      value: recentVisits.filter((v) => clinicDay(v.visitDate) === key).length,
    };
  });
  const actions = [
    {
      label: "v2.openCritical",
      value: critical,
      href: "/labs?queue=critical",
      tone: "danger" as const,
    },
    {
      label: "v2.resultsForReview",
      value: review,
      href: "/labs?queue=review",
      tone: "warn" as const,
    },
    {
      label: "v2.requests",
      value: pendingRequests,
      href: "/requests",
      tone: "accent" as const,
    },
    {
      label: "v2.incompleteFiles",
      value: employees.length - complete,
      href: "/reports?report=incomplete",
      tone: "warn" as const,
    },
  ];
  return (
    <div className="stack">
      <header className="dashboard-greeting">
        <div>
          <span className="eyebrow">{t("v2.workspace")}</span>
          <h1>{t("v2.welcome", { name: user.name.split(" ")[0] })}</h1>
          <p>{t("v2.clinicOverview")}</p>
        </div>
        <div className="dashboard-actions">
          <Link className="btn btn-ghost" href="/visits">
            {t("visit.new")}
          </Link>
          <Link className="btn btn-primary" href="/appointments/new">
            {t("v2.book")}
          </Link>
        </div>
      </header>
      <section className="welcome-panel">
        <div>
          <span className="eyebrow">
            {formatDate(start, t.locale)} · {t("v2.riyadhTime")}
          </span>
          <h1>{t("v2.goodDay")}</h1>
          <p>{t.locale === "ar" ? config.welcomeAr : config.welcomeEn}</p>
          <Link className="btn btn-white" href="/appointments">
            {t("v2.todaySchedule")} <span aria-hidden>↗</span>
          </Link>
        </div>
        <div className="welcome-emblem" aria-hidden>
          <IconVisit size={74} />
        </div>
      </section>
      <div className="metric-grid">
        {[
          {
            label: "emp.count",
            value: employees.length,
            href: "/employees",
            icon: <IconEmployees />,
            note: "v2.activeFiles",
          },
          {
            label: "v2.todayVisits",
            value: todayVisits,
            href: "/visits?from=" + today + "&to=" + today,
            icon: <IconVisit />,
            note: "v2.actualVisits",
          },
          {
            label: "v2.todayAppointments",
            value: appointmentCount,
            href: "/appointments?day=" + today,
            icon: <IconClock />,
            note: "v2.confirmAndCheckIn",
          },
          {
            label: "v2.profileComplete",
            value: completePercent,
            href: "/reports?report=incomplete",
            icon: <IconLab />,
            note: "v2.requiredProfile",
          },
        ].map((m, i) => (
          <Link key={m.label} className="metric-card" href={m.href}>
            <span className="metric-icon">{m.icon}</span>
            <span className="metric-label">{t(m.label)}</span>
            <strong className="num">
              {m.value}
              {i === 3 && <small>%</small>}
            </strong>
            <span className="metric-note">{t(m.note)}</span>
          </Link>
        ))}
      </div>
      <div className="content-columns">
        <Card>
          <SectionTitle
            action={
              <Link className="text-link" href="/appointments">
                {t("v2.viewAll")}
              </Link>
            }
          >
            {t("v2.todaySchedule")}
          </SectionTitle>
          <AppointmentList appointments={appointments} staff />
        </Card>
        <Card>
          <SectionTitle>{t("v2.attentionQueue")}</SectionTitle>
          <div className="task-list">
            {actions.map((a) => (
              <Link key={a.label} href={a.href} className="task-row">
                <span>{t(a.label)}</span>
                <Chip tone={a.value ? a.tone : "neutral"}>{a.value}</Chip>
                <span aria-hidden>↗</span>
              </Link>
            ))}
            {user.role === "ADMIN" && (
              <Link href="/labs/import" className="task-row">
                <span>{t("v2.pendingImports")}</span>
                <Chip tone={pendingImports ? "warn" : "neutral"}>
                  {pendingImports}
                </Chip>
                <span aria-hidden>↗</span>
              </Link>
            )}
          </div>
        </Card>
      </div>
      <div className="content-columns">
        <Card>
          <SectionTitle
            action={
              <Link href="/visits" className="text-link">
                {t("v2.viewAll")}
              </Link>
            }
          >
            {t("v2.visitActivity")}
          </SectionTitle>
          <ColumnChart
            data={chart}
            height={200}
            emptyLabel={t("v2.noActivity")}
          />
        </Card>
        <Card>
          <SectionTitle>{t("v2.fileReadiness")}</SectionTitle>
          <div className="completion-number num">
            {completePercent}
            <small>%</small>
          </div>
          <Meter value={completePercent} />
          <p className="muted mt-4">
            {t("v2.filesComplete", { complete, total: employees.length })}
          </p>
          <p className="muted mt-3">{t("v2.profileDefinition")}</p>
          <Link className="btn btn-ghost mt-4" href="/employees">
            {t("v2.openDirectory")}
          </Link>
        </Card>
      </div>
      <Card>
        <SectionTitle
          action={
            <Link href="/due" className="text-link">
              {t("v2.viewAll")}
            </Link>
          }
        >
          {t("v2.nextActions")}
        </SectionTitle>
        {due.length ? (
          <div className="task-list">
            {due.slice(0, 5).map((item) => (
              <Link className="task-row" key={item.id} href={item.href}>
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.employeeName} · {item.detail}
                  </small>
                </span>
                <Chip
                  tone={
                    item.kind === "CRITICAL"
                      ? "danger"
                      : item.urgency === "OVERDUE"
                        ? "warn"
                        : "neutral"
                  }
                >
                  {t("due.urgency." + item.urgency)}
                </Chip>
                <span aria-hidden>↗</span>
              </Link>
            ))}
          </div>
        ) : (
          <Empty title={t("v2.noPendingTasks")} />
        )}
      </Card>
    </div>
  );
}
