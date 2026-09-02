import { db } from "@/lib/db";
import Link from "next/link";
import { getOHC } from "@/server/ohc-register";
import { requirePath } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { getT } from "@/lib/i18n";
import { formatDate, percent, startOfDay, toDateInput } from "@/lib/format";
import { nextVaccineDue } from "@/lib/clinical/due";
import { OCCUPATIONAL_VACCINES, VACCINE_BY_CODE } from "@/lib/catalog/vaccines";
import { PageHeader } from "@/components/ui";
import { DownloadLink } from "@/components/ui/DownloadLink";
import { Modal } from "@/components/ui/Modal";
import { QuickVaccinationForm } from "@/components/forms/QuickClinicalForms";
import { VaccinationsOperationalWorkspace } from "@/components/operations/OperationalWorkspaces";
import { IconPlus } from "@/components/layout/icons";

export const metadata = { title: "التحصينات" };
export const dynamic = "force-dynamic";

export default async function VaccinationsPage() {
  const user = await requirePath("/vaccinations");
  const t = await getT();
  const register = await getOHC();
  const today = startOfDay();
  const soonLimit = new Date(today.getTime() + 30 * 86_400_000);

  const [employees, recent, pickList] = await Promise.all([
    db.employee.findMany({
      where: { isArchived: false, employmentStatus: { not: "TERMINATED" } },
      select: {
        id: true,
        name: true,
        department: true,
        vaccinations: {
          where: { status: "ACTIVE" },
          select: {
            vaccineCode: true,
            doseNumber: true,
            givenAt: true,
            nextDueAt: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    db.vaccination.findMany({
      where: { status: "ACTIVE" },
      orderBy: { givenAt: "desc" },
      take: 80,
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
    for (const employee of employees) {
      const doses = employee.vaccinations.filter(
        (item) => item.vaccineCode === vac.code,
      );
      const next = nextVaccineDue(vac.code, doses);
      if (!next || next.dueDate > today) complete++;
      if (next && next.dueDate < today) overdue++;
    }
    return {
      code: vac.code,
      name: t.locale === "ar" ? vac.nameAr : vac.nameEn,
      complete,
      overdue,
      total: employees.length,
      percent: percent(complete, employees.length),
    };
  });

  const attention = employees
    .flatMap((employee) =>
      OCCUPATIONAL_VACCINES.flatMap((vac) => {
        const doses = employee.vaccinations.filter(
          (item) => item.vaccineCode === vac.code,
        );
        const next = nextVaccineDue(vac.code, doses);
        if (!next || next.dueDate > soonLimit) return [];
        const status =
          next.dueDate < today ? ("overdue" as const) : ("dueSoon" as const);
        return [
          {
            key: `${employee.id}-${vac.code}`,
            employeeId: employee.id,
            employeeName: employee.name,
            department: employee.department,
            vaccineCode: vac.code,
            vaccineName: t.locale === "ar" ? vac.nameAr : vac.nameEn,
            dueDateKey: toDateInput(next.dueDate),
            dueDateLabel: formatDate(next.dueDate, t.locale),
            doseNumber: next.nextDose,
            status,
          },
        ];
      }),
    )
    .sort((a, b) => a.dueDateKey.localeCompare(b.dueDateKey));

  const recentRecords = recent.map((item) => ({
    id: item.id,
    employeeId: item.employee.id,
    employeeName: item.employee.name,
    vaccineCode: item.vaccineCode,
    vaccineName: VACCINE_BY_CODE[item.vaccineCode]
      ? t.locale === "ar"
        ? VACCINE_BY_CODE[item.vaccineCode].nameAr
        : VACCINE_BY_CODE[item.vaccineCode].nameEn
      : item.vaccineName,
    doseNumber: item.doseNumber,
    dateKey: toDateInput(item.givenAt),
    dateLabel: formatDate(item.givenAt, t.locale),
    lotNumber: item.lotNumber,
    provider: item.provider,
    site: item.site,
  }));

  return (
    <>
      <PageHeader
        title={t("vac.title")}
        actions={
          <>
            <Link className="btn btn-ghost" href="/vaccinations/register">
              {t("ohc.title")}
            </Link>
            {register && (
              <DownloadLink href="/api/ohc/export">
                {t("ohc.export")}
              </DownloadLink>
            )}
            <DownloadLink href="/api/export/immunisation">
              {t("ohc.coverageExport")}
            </DownloadLink>
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

      {register && (
        <div className="card p-4 mb-6">
          <p>{t("ohc.connected", { count: register.doseCount })}</p>
          <Link href="/vaccinations/register" className="muted">
            {t("ohc.needsMatch")}:{" "}
            <span className="num">
              {register.rows.filter((r) => !r.employeeId).length}
            </span>
          </Link>
        </div>
      )}
      <VaccinationsOperationalWorkspace
        coverage={coverage}
        attention={attention}
        recent={recentRecords}
      />
    </>
  );
}
