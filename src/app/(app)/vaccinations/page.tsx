import Link from "next/link";
import { db } from "@/lib/db";
import { requirePath } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { getT } from "@/lib/i18n";
import { formatDate, percent } from "@/lib/format";
import { nextVaccineDue } from "@/lib/clinical/due";
import { OCCUPATIONAL_VACCINES, VACCINE_BY_CODE } from "@/lib/catalog/vaccines";
import { Card, Chip, Empty, Meter, PageHeader, SectionTitle } from "@/components/ui";
import { DownloadLink } from "@/components/ui/DownloadLink";
import { Modal } from "@/components/ui/Modal";
import { QuickVaccinationForm } from "@/components/forms/QuickClinicalForms";
import { IconPlus } from "@/components/layout/icons";

export const metadata = { title: "التحصينات" };
export const dynamic = "force-dynamic";

export default async function VaccinationsPage() {
  const user = await requirePath("/vaccinations");
  const t = await getT();

  const [employees, recent, pickList] = await Promise.all([
    db.employee.findMany({
      where: { isArchived: false, employmentStatus: { not: "TERMINATED" } },
      select: {
        id: true,
        name: true,
        department: true,
        vaccinations: {
          where: { status: "ACTIVE" },
          select: { vaccineCode: true, doseNumber: true, givenAt: true, nextDueAt: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    db.vaccination.findMany({
      where: { status: "ACTIVE" },
      orderBy: { givenAt: "desc" },
      take: 60,
      include: { employee: { select: { id: true, name: true } } },
    }),
    can(user.role, "clinical.write")
      ? db.employee.findMany({
          where: { isArchived: false },
          orderBy: { name: "asc" },
          select: { id: true, name: true, nationalId: true, gender: true },
        })
      : Promise.resolve([]),
  ]);

  const coverage = OCCUPATIONAL_VACCINES.map((vac) => {
    let complete = 0;
    let overdue = 0;
    for (const emp of employees) {
      const doses = emp.vaccinations.filter((v) => v.vaccineCode === vac.code);
      const next = nextVaccineDue(vac.code, doses);
      if (!next) complete++;
      else if (next.dueDate < new Date()) overdue++;
    }
    return { vac, complete, overdue, total: employees.length };
  });

  return (
    <>
      <PageHeader
        title={t("vac.title")}
        subtitle={t("due.subtitle")}
        actions={
          <>
            <DownloadLink href="/api/export/immunisation">{t("action.export")}</DownloadLink>
            {can(user.role, "clinical.write") && (
              <Modal
                title={t("vac.new")}
                wide
                trigger={
                  <button className="btn btn-primary">
                    <IconPlus /> {t("vac.new")}
                  </button>
                }
              >
                <QuickVaccinationForm employees={pickList} />
              </Modal>
            )}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {coverage.map(({ vac, complete, overdue, total }) => {
          const pct = percent(complete, total);
          return (
            <Card key={vac.code}>
              <p className="text-sm font-bold">{t.locale === "ar" ? vac.nameAr : vac.nameEn}</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="num text-2xl font-bold" style={{ color: "var(--text)" }}>{pct}%</span>
                <span className="num text-xs" style={{ color: "var(--text-faint)" }}>{complete} / {total}</span>
              </div>
              <div className="mt-2">
                <Meter value={pct} tone={pct >= 90 ? "ok" : pct >= 60 ? "warn" : "danger"} />
              </div>
              {overdue > 0 && (
                <p className="mt-2">
                  <Link href="/due">
                    <Chip tone="danger" dot>{t("vac.overdue")}: {overdue}</Chip>
                  </Link>
                </p>
              )}
            </Card>
          );
        })}
      </div>

      <Card pad={false}>
        <div className="px-4 py-3"><SectionTitle>{t("vac.title")}</SectionTitle></div>
        {recent.length === 0 ? (
          <Empty title={t("common.empty")} hint={t("common.emptyHint")} />
        ) : (
          <div className="table-wrap border-t">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("due.employee")}</th>
                  <th>{t("vac.vaccine")}</th>
                  <th>{t("vac.dose")}</th>
                  <th>{t("vac.givenAt")}</th>
                  <th>{t("vac.lot")}</th>
                  <th>{t("vac.provider")}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <Link href={`/employees/${v.employee.id}?tab=vaccines`} className="font-semibold" style={{ color: "var(--accent-text)" }}>
                        {v.employee.name}
                      </Link>
                    </td>
                    <td>
                      {VACCINE_BY_CODE[v.vaccineCode]
                        ? t.locale === "ar"
                          ? VACCINE_BY_CODE[v.vaccineCode].nameAr
                          : VACCINE_BY_CODE[v.vaccineCode].nameEn
                        : v.vaccineName}
                    </td>
                    <td className="num">{v.doseNumber}</td>
                    <td className="num">{formatDate(v.givenAt, t.locale)}</td>
                    <td className="num" dir="ltr">{v.lotNumber ?? "—"}</td>
                    <td>{v.provider ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
