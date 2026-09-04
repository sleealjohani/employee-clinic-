import Link from "next/link";
import { ExposureNature, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { clinicDateTime, validDay } from "@/lib/clinic-config";
import { formatDateTime } from "@/lib/format";
import { Card, Chip, Empty, PageHeader } from "@/components/ui";
import { Pagination, safePage } from "@/components/ui/Pagination";
import { IconPlus } from "@/components/layout/icons";

export const dynamic = "force-dynamic";

export default async function NeedleStickIncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    from?: string;
    to?: string;
    nature?: string;
    state?: string;
  }>;
}) {
  await requirePermission("clinical.read");
  const t = await getT();
  const params = await searchParams;
  const page = safePage(params.page);
  const q = (params.q || "").trim().slice(0, 160);
  const from = validDay(params.from || "") ? params.from : undefined;
  const to = validDay(params.to || "") ? params.to : undefined;
  const nature = Object.values(ExposureNature).includes(
    params.nature as ExposureNature,
  )
    ? (params.nature as ExposureNature)
    : undefined;

  const where: Prisma.NeedleStickIncidentWhereInput = {
    status: "ACTIVE",
    nature,
    incidentAt:
      from || to
        ? {
            ...(from ? { gte: clinicDateTime(from) } : {}),
            ...(to
              ? { lt: new Date(clinicDateTime(to).getTime() + 86_400_000) }
              : {}),
          }
        : undefined,
    ...(params.state === "open"
      ? { completedAt: null }
      : params.state === "complete"
        ? { completedAt: { not: null } }
        : {}),
    ...(q
      ? {
          OR: [
            { staffName: { contains: q, mode: "insensitive" } },
            { department: { contains: q, mode: "insensitive" } },
            { employee: { nationalId: { contains: q } } },
            { employee: { employeeNo: { contains: q } } },
            { sourcePatientFileNo: { contains: q } },
          ],
        }
      : {}),
  };

  const [incidents, total, openCount, completedCount] = await Promise.all([
    db.needleStickIncident.findMany({
      where,
      orderBy: [{ incidentAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * 25,
      take: 25,
      include: {
        employee: { select: { id: true, nationalId: true, employeeNo: true } },
      },
    }),
    db.needleStickIncident.count({ where }),
    db.needleStickIncident.count({
      where: { status: "ACTIVE", completedAt: null },
    }),
    db.needleStickIncident.count({
      where: { status: "ACTIVE", completedAt: { not: null } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title={t("needle.title")}
        subtitle={t("needle.description")}
        badge={<Chip>{total}</Chip>}
        actions={
          <Link className="btn btn-primary" href="/needle-stick/new">
            <IconPlus /> {t("needle.register")}
          </Link>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {t("common.total")}
          </p>
          <strong className="num mt-1 block text-2xl">
            {openCount + completedCount}
          </strong>
        </Card>
        <Card>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {t("needle.status.OPEN")}
          </p>
          <strong
            className="num mt-1 block text-2xl"
            style={{ color: "var(--warn)" }}
          >
            {openCount}
          </strong>
        </Card>
        <Card>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {t("needle.status.COMPLETED")}
          </p>
          <strong
            className="num mt-1 block text-2xl"
            style={{ color: "var(--ok)" }}
          >
            {completedCount}
          </strong>
        </Card>
      </div>

      <Card className="mb-5">
        <form method="get" className="filter-bar">
          <label>
            {t("v2.searchEmployee")}
            <input
              className="input"
              name="q"
              defaultValue={q}
              placeholder={t("needle.searchPlaceholder")}
            />
          </label>
          <label>
            {t("rep.from")}
            <input
              className="input"
              name="from"
              type="date"
              defaultValue={from}
            />
          </label>
          <label>
            {t("rep.to")}
            <input className="input" name="to" type="date" defaultValue={to} />
          </label>
          <label>
            {t("needle.nature")}
            <select
              className="select"
              name="nature"
              defaultValue={nature || ""}
            >
              <option value="">{t("common.all")}</option>
              {Object.values(ExposureNature).map((value) => (
                <option key={value} value={value}>
                  {t(`needle.nature.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("common.status")}
            <select
              className="select"
              name="state"
              defaultValue={params.state || ""}
            >
              <option value="">{t("common.all")}</option>
              <option value="open">{t("needle.status.OPEN")}</option>
              <option value="complete">{t("needle.status.COMPLETED")}</option>
            </select>
          </label>
          <button className="btn btn-primary" type="submit">
            {t("action.filter")}
          </button>
        </form>
      </Card>

      <Card pad={false}>
        {incidents.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("needle.incidentAt")}</th>
                  <th>{t("emp.name")}</th>
                  <th>{t("emp.department")}</th>
                  <th>{t("needle.nature")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((incident) => (
                  <tr key={incident.id}>
                    <td className="num">
                      {formatDateTime(incident.incidentAt, t.locale)}
                    </td>
                    <td>
                      <Link
                        className="text-link"
                        href={`/employees/${incident.employeeId}?tab=needleStick`}
                      >
                        {incident.staffName}
                      </Link>
                      <small className="num block muted" dir="ltr">
                        {incident.employee.employeeNo ||
                          incident.employee.nationalId}
                      </small>
                    </td>
                    <td>{incident.department || "—"}</td>
                    <td>{t(`needle.nature.${incident.nature}`)}</td>
                    <td>
                      <Chip tone={incident.completedAt ? "ok" : "warn"} dot>
                        {t(
                          incident.completedAt
                            ? "needle.status.COMPLETED"
                            : "needle.status.OPEN",
                        )}
                      </Chip>
                    </td>
                    <td>
                      <Link
                        className="btn btn-ghost btn-sm"
                        href={`/needle-stick/${incident.id}`}
                      >
                        {t("action.open")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title={t("common.empty")} hint={t("needle.emptyHint")} />
        )}
      </Card>
      <Pagination
        base="/needle-stick"
        page={page}
        total={total}
        params={{ q, from, to, nature, state: params.state }}
      />
    </>
  );
}
