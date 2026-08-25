import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePath } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { getT } from "@/lib/i18n";
import { formatDate, startOfDay, toDateInput } from "@/lib/format";
import { vitalOutOfRange } from "@/lib/clinical/rules";
import { Card, Chip, Empty, PageHeader } from "@/components/ui";
import { DownloadLink } from "@/components/ui/DownloadLink";
import { Modal } from "@/components/ui/Modal";
import { SmartVisitForm } from "@/components/forms/SmartClinicalForms";
import { IconPlus } from "@/components/layout/icons";

export const metadata = { title: "الزيارات" };
export const dynamic = "force-dynamic";

export default async function VisitsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; type?: string }>;
}) {
  const user = await requirePath("/visits");
  const t = await getT();
  const params = await searchParams;

  const from = params.from ? new Date(params.from) : startOfDay(new Date(Date.now() - 29 * 86_400_000));
  const to = params.to ? new Date(`${params.to}T23:59:59`) : new Date();
  const type = params.type ?? "";

  const where: Prisma.VisitWhereInput = {
    status: { not: "ENTERED_IN_ERROR" },
    visitDate: { gte: from, lte: to },
    ...(type ? { type: type as Prisma.EnumVisitTypeFilter["equals"] } : {}),
  };

  const [visits, employees] = await Promise.all([
    db.visit.findMany({
      where,
      orderBy: { visitDate: "desc" },
      take: 300,
      include: { employee: { select: { id: true, name: true, department: true } } },
    }),
    can(user.role, "clinical.write")
      ? db.employee.findMany({
          where: { isArchived: false },
          orderBy: { name: "asc" },
          select: { id: true, name: true, nationalId: true, gender: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title={t("visit.title")}
        subtitle={`${formatDate(from, t.locale)} — ${formatDate(to, t.locale)}`}
        badge={<Chip tone="neutral">{visits.length}</Chip>}
        actions={
          <>
            <DownloadLink href={`/api/export/visits?from=${toDateInput(from)}&to=${toDateInput(to)}`}>
              {t("action.export")}
            </DownloadLink>
            {can(user.role, "clinical.write") && (
              <Modal
                title={t("visit.new")}
                wide
                trigger={
                  <button className="btn btn-primary">
                    <IconPlus /> {t("visit.new")}
                  </button>
                }
              >
                <SmartVisitForm employees={employees} />
              </Modal>
            )}
          </>
        }
      />

      <Card className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-2.5">
          <div>
            <label className="label" htmlFor="from">{t("rep.from")}</label>
            <input id="from" className="input" type="date" name="from" defaultValue={toDateInput(from)} />
          </div>
          <div>
            <label className="label" htmlFor="to">{t("rep.to")}</label>
            <input id="to" className="input" type="date" name="to" defaultValue={toDateInput(to)} />
          </div>
          <div className="w-44">
            <label className="label" htmlFor="type">{t("visit.type")}</label>
            <select id="type" className="select" name="type" defaultValue={type}>
              <option value="">{t("common.all")}</option>
              {["ACUTE_CARE", "FOLLOW_UP", "PRE_EMPLOYMENT", "PERIODIC", "INJURY", "EXPOSURE", "VACCINATION", "CONSULTATION", "OTHER"].map((v) => (
                <option key={v} value={v}>{t(`visitType.${v}`)}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-ghost">{t("action.filter")}</button>
        </form>
      </Card>

      <Card pad={false}>
        {visits.length === 0 ? (
          <Empty title={t("common.empty")} hint={t("common.emptyHint")} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("visit.date")}</th>
                  <th>{t("due.employee")}</th>
                  <th>{t("emp.department")}</th>
                  <th>{t("visit.type")}</th>
                  <th>{t("visit.chief")}</th>
                  <th>{t("visit.diagnosis")}</th>
                  <th>{t("visit.vitals")}</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((v) => {
                  const abnormal =
                    vitalOutOfRange("tempC", v.tempC) ||
                    vitalOutOfRange("systolic", v.systolic) ||
                    vitalOutOfRange("pulse", v.pulse) ||
                    vitalOutOfRange("spo2", v.spo2);
                  return (
                    <tr key={v.id}>
                      <td className="num">{formatDate(v.visitDate, t.locale)}</td>
                      <td>
                        <Link href={`/employees/${v.employee.id}?tab=visits`} className="font-semibold" style={{ color: "var(--accent-text)" }}>
                          {v.employee.name}
                        </Link>
                      </td>
                      <td>{v.employee.department ?? "—"}</td>
                      <td><Chip tone="accent">{t(`visitType.${v.type}`)}</Chip></td>
                      <td>{v.chiefComplaint ?? "—"}</td>
                      <td>{v.diagnosis ?? "—"}</td>
                      <td>{abnormal ? <Chip tone="warn">{t("visit.abnormalVitals")}</Chip> : <span style={{ color: "var(--text-faint)" }}>—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
