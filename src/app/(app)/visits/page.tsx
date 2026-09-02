import Link from "next/link";
import { Prisma, VisitType } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { getT } from "@/lib/i18n";
import { clinicDay, clinicDateTime, validDay } from "@/lib/clinic-config";
import { formatDateTime } from "@/lib/format";
import { PageHeader, Card, Chip, Empty } from "@/components/ui";
import { Pagination, safePage } from "@/components/ui/Pagination";
import { Modal } from "@/components/ui/Modal";
import { SmartVisitForm } from "@/components/forms/SmartClinicalForms";
import { DownloadLink } from "@/components/ui/DownloadLink";
export const dynamic = "force-dynamic";
export default async function VisitsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    from?: string;
    to?: string;
    type?: string;
    state?: string;
  }>;
}) {
  const user = await requirePermission("clinical.read"),
    t = await getT(),
    p = await searchParams,
    page = safePage(p.page);
  const from = validDay(p.from || "")
      ? p.from!
      : clinicDay(new Date(Date.now() - 29 * 86400000)),
    to = validDay(p.to || "") ? p.to! : clinicDay(),
    q = (p.q || "").trim().slice(0, 160);
  const type = Object.values(VisitType).includes(p.type as VisitType)
    ? (p.type as VisitType)
    : undefined;
  const where: Prisma.VisitWhereInput = {
    status: "ACTIVE",
    visitDate: {
      gte: clinicDateTime(from),
      lt: new Date(clinicDateTime(to).getTime() + 86400000),
    },
    type,
    ...(p.state === "open"
      ? { completedAt: null }
      : p.state === "complete"
        ? { completedAt: { not: null } }
        : {}),
    ...(q
      ? {
          employee: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { nationalId: { contains: q } },
              { employeeNo: { contains: q } },
            ],
          },
        }
      : {}),
  };
  const [visits, total, employees] = await Promise.all([
    db.visit.findMany({
      where,
      orderBy: [{ visitDate: "desc" }, { id: "asc" }],
      skip: (page - 1) * 25,
      take: 25,
      include: {
        employee: { select: { name: true, id: true, department: true } },
      },
    }),
    db.visit.count({ where }),
    can(user.role, "clinical.write")
      ? db.employee.findMany({
          where: { isArchived: false, employmentStatus: { not: "TERMINATED" } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, nationalId: true, gender: true },
        })
      : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader
        title={t("visit.title")}
        badge={<Chip>{total}</Chip>}
        actions={
          <>
            <DownloadLink
              href={"/api/export/visits?from=" + from + "&to=" + to}
            >
              {t("action.export")}
            </DownloadLink>
            {can(user.role, "clinical.write") && (
              <Modal
                wide
                title={t("visit.new")}
                trigger={
                  <button className="btn btn-primary">{t("visit.new")}</button>
                }
              >
                <SmartVisitForm employees={employees} />
              </Modal>
            )}
          </>
        }
      />
      <Card className="mb-5">
        <form method="get" className="filter-bar">
          <label>
            {t("v2.searchEmployee")}
            <input className="input" name="q" defaultValue={q} />
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
            {t("visit.type")}
            <select name="type" className="select" defaultValue={type || ""}>
              <option value="">{t("common.all")}</option>
              {Object.values(VisitType).map((v) => (
                <option key={v} value={v}>
                  {t("visitType." + v)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("common.status")}
            <select
              name="state"
              className="select"
              defaultValue={p.state || ""}
            >
              <option value="">{t("common.all")}</option>
              <option value="open">{t("v2.inProgress")}</option>
              <option value="complete">{t("v2.completed")}</option>
            </select>
          </label>
          <button className="btn btn-primary" type="submit">
            {t("action.filter")}
          </button>
        </form>
      </Card>
      <Card pad={false}>
        {visits.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  {[
                    "visit.date",
                    "emp.name",
                    "visit.type",
                    "visit.chief",
                    "common.status",
                    "action.open",
                  ].map((k) => (
                    <th key={k}>{t(k)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visits.map((v) => (
                  <tr key={v.id}>
                    <td className="num">
                      {formatDateTime(v.visitDate, t.locale)}
                    </td>
                    <td>
                      <Link
                        className="text-link"
                        href={"/employees/" + v.employeeId}
                      >
                        {v.employee.name}
                      </Link>
                      <small className="block muted">
                        {v.employee.department}
                      </small>
                    </td>
                    <td>{t("visitType." + v.type)}</td>
                    <td className="max-w-xs">{v.chiefComplaint || "—"}</td>
                    <td>
                      <Chip tone={v.completedAt ? "ok" : "accent"}>
                        {t(v.completedAt ? "v2.completed" : "v2.inProgress")}
                      </Chip>
                    </td>
                    <td>
                      <Link className="btn btn-ghost" href={"/visits/" + v.id}>
                        {t("v2.openVisit")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title={t("common.empty")} />
        )}
      </Card>
      <Pagination
        base="/visits"
        page={page}
        total={total}
        params={{ q, from, to, type, state: p.state }}
      />
    </>
  );
}
