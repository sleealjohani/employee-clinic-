import { db } from "@/lib/db";
import { requirePath } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { getT } from "@/lib/i18n";
import { bmi, formatDate, startOfDay, toDateInput } from "@/lib/format";
import { vitalOutOfRange } from "@/lib/clinical/rules";
import { Card, Chip, PageHeader } from "@/components/ui";
import { DownloadLink } from "@/components/ui/DownloadLink";
import { Modal } from "@/components/ui/Modal";
import { SmartVisitForm } from "@/components/forms/SmartClinicalForms";
import { VisitsOperationalWorkspace } from "@/components/operations/OperationalWorkspaces";
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
  const initialType = params.type ?? "";

  const [visits, employees] = await Promise.all([
    db.visit.findMany({
      where: {
        status: { not: "ENTERED_IN_ERROR" },
        visitDate: { gte: from, lte: to },
      },
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

  const records = visits.map((visit) => {
    const abnormal =
      vitalOutOfRange("tempC", visit.tempC) ||
      vitalOutOfRange("systolic", visit.systolic) ||
      vitalOutOfRange("diastolic", visit.diastolic) ||
      vitalOutOfRange("pulse", visit.pulse) ||
      vitalOutOfRange("spo2", visit.spo2);
    return {
      id: visit.id,
      employeeId: visit.employee.id,
      employeeName: visit.employee.name,
      department: visit.employee.department,
      dateKey: toDateInput(visit.visitDate),
      dateLabel: formatDate(visit.visitDate, t.locale),
      type: visit.type,
      chiefComplaint: visit.chiefComplaint,
      diagnosis: visit.diagnosis,
      plan: visit.plan,
      notes: visit.notes,
      tempC: visit.tempC,
      systolic: visit.systolic,
      diastolic: visit.diastolic,
      pulse: visit.pulse,
      respRate: visit.respRate,
      spo2: visit.spo2,
      weightKg: visit.weightKg,
      heightCm: visit.heightCm,
      bmi: bmi(visit.weightKg, visit.heightCm),
      abnormal,
    };
  });

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
                trigger={<button className="btn btn-primary"><IconPlus /> {t("visit.new")}</button>}
              >
                <SmartVisitForm employees={employees} />
              </Modal>
            )}
          </>
        }
      />

      <Card className="mb-4 glass">
        <form method="get" className="flex flex-wrap items-end gap-2.5">
          <div>
            <label className="label" htmlFor="from">{t("rep.from")}</label>
            <input id="from" className="input" type="date" name="from" defaultValue={toDateInput(from)} />
          </div>
          <div>
            <label className="label" htmlFor="to">{t("rep.to")}</label>
            <input id="to" className="input" type="date" name="to" defaultValue={toDateInput(to)} />
          </div>
          {initialType && <input type="hidden" name="type" value={initialType} />}
          <button type="submit" className="btn btn-ghost">{t("action.filter")}</button>
        </form>
      </Card>

      <VisitsOperationalWorkspace records={records} todayKey={toDateInput(new Date())} />
    </>
  );
}
