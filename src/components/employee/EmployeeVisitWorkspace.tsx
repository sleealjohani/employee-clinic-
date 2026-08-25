import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { getT } from "@/lib/i18n";
import { bmi, formatDate } from "@/lib/format";
import { vitalOutOfRange } from "@/lib/clinical/rules";
import { Chip, Empty, KeyValue } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { VoidRecordForm } from "@/components/forms/RecordForms";
import { SmartVisitForm } from "@/components/forms/SmartClinicalForms";
import { IconPlus } from "@/components/layout/icons";
import { ClinicalMasterDetail, type MasterDetailItem } from "./ClinicalMasterDetail";

export async function EmployeeVisitWorkspace({ employeeId }: { employeeId: string }) {
  const [user, t, visits] = await Promise.all([
    requireUser(),
    getT(),
    db.visit.findMany({
      where: { employeeId, status: { not: "ENTERED_IN_ERROR" } },
      orderBy: { visitDate: "desc" },
    }),
  ]);

  const ar = t.locale === "ar";
  const canWrite = can(user.role, "clinical.write");
  const canVoid = can(user.role, "clinical.void");

  const items: MasterDetailItem[] = visits.map((visit) => {
    const abnormal =
      vitalOutOfRange("tempC", visit.tempC) ||
      vitalOutOfRange("systolic", visit.systolic) ||
      vitalOutOfRange("diastolic", visit.diastolic) ||
      vitalOutOfRange("pulse", visit.pulse) ||
      vitalOutOfRange("spo2", visit.spo2);

    return {
      id: visit.id,
      title: formatDate(visit.visitDate, t.locale),
      subtitle: visit.chiefComplaint ?? visit.diagnosis ?? (ar ? "زيارة سريرية" : "Clinical visit"),
      meta: t(`visitType.${visit.type}`),
      tone: abnormal ? "warn" : "accent",
      badges: abnormal ? [{ label: t("visit.abnormalVitals"), tone: "warn" }] : [],
    };
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-[1.2rem] border px-4 py-3" style={{ background: "color-mix(in srgb, var(--surface-glass) 88%, transparent)", borderColor: "var(--glass-border)" }}>
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--accent-text)" }}>
            VISIT WORKSPACE
          </p>
          <h2 className="mt-1 text-base font-extrabold">{ar ? "سجل الزيارات" : "Visit history"}</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>
            {ar ? "اختر الزيارة من القائمة لتظهر تفاصيلها فورًا دون فتح وإغلاق السجلات." : "Select a visit to reveal its details instantly without expanding rows."}
          </p>
        </div>
        {canWrite && (
          <Modal
            title={t("visit.new")}
            wide
            trigger={
              <button className="btn btn-primary btn-sm">
                <IconPlus /> {t("visit.new")}
              </button>
            }
          >
            <SmartVisitForm employeeId={employeeId} />
          </Modal>
        )}
      </div>

      {visits.length === 0 ? (
        <Empty title={t("common.empty")} hint={t("common.emptyHint")} />
      ) : (
        <ClinicalMasterDetail
          items={items}
          searchPlaceholder={ar ? "ابحث داخل الزيارات…" : "Search visits…"}
          emptyLabel={ar ? "لا توجد زيارة مطابقة" : "No matching visit"}
        >
          {visits.map((visit) => {
            const abnormal =
              vitalOutOfRange("tempC", visit.tempC) ||
              vitalOutOfRange("systolic", visit.systolic) ||
              vitalOutOfRange("diastolic", visit.diastolic) ||
              vitalOutOfRange("pulse", visit.pulse) ||
              vitalOutOfRange("spo2", visit.spo2);
            const calculatedBmi = bmi(visit.weightKg, visit.heightCm);

            return (
              <article key={visit.id}>
                <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b pb-4">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Chip tone="accent">{t(`visitType.${visit.type}`)}</Chip>
                      {abnormal && <Chip tone="warn">{t("visit.abnormalVitals")}</Chip>}
                    </div>
                    <h3 className="text-lg font-extrabold">{formatDate(visit.visitDate, t.locale)}</h3>
                    <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                      {visit.chiefComplaint ?? visit.diagnosis ?? (ar ? "زيارة سريرية" : "Clinical visit")}
                    </p>
                  </div>
                  <span className="rounded-xl border px-2.5 py-1 text-[0.65rem] font-bold" style={{ color: "var(--text-faint)", background: "var(--surface-2)" }}>
                    {ar ? "سجل زيارة" : "Visit record"}
                  </span>
                </header>

                <section>
                  <p className="mb-2 text-[0.67rem] font-extrabold uppercase tracking-[0.06em]" style={{ color: "var(--text-faint)" }}>
                    {ar ? "المؤشرات الحيوية" : "Vitals"}
                  </p>
                  <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border p-3" style={{ background: "var(--surface-2)" }}><KeyValue label={t("visit.temp")} value={visit.tempC ?? "—"} mono /></div>
                    <div className="rounded-xl border p-3" style={{ background: "var(--surface-2)" }}><KeyValue label={t("visit.bp")} value={visit.systolic && visit.diastolic ? `${visit.systolic}/${visit.diastolic}` : "—"} mono /></div>
                    <div className="rounded-xl border p-3" style={{ background: "var(--surface-2)" }}><KeyValue label={t("visit.pulse")} value={visit.pulse ?? "—"} mono /></div>
                    <div className="rounded-xl border p-3" style={{ background: "var(--surface-2)" }}><KeyValue label={t("visit.spo2")} value={visit.spo2 ?? "—"} mono /></div>
                    <div className="rounded-xl border p-3" style={{ background: "var(--surface-2)" }}><KeyValue label={t("visit.rr")} value={visit.respRate ?? "—"} mono /></div>
                    <div className="rounded-xl border p-3" style={{ background: "var(--surface-2)" }}><KeyValue label={t("visit.weight")} value={visit.weightKg ?? "—"} mono /></div>
                    <div className="rounded-xl border p-3" style={{ background: "var(--surface-2)" }}><KeyValue label={t("visit.height")} value={visit.heightCm ?? "—"} mono /></div>
                    <div className="rounded-xl border p-3" style={{ background: "var(--surface-2)" }}><KeyValue label={t("visit.bmi")} value={calculatedBmi ?? "—"} mono /></div>
                  </dl>
                </section>

                <section className="mt-5 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border p-3.5"><KeyValue label={t("visit.chief")} value={visit.chiefComplaint ?? "—"} /></div>
                  <div className="rounded-xl border p-3.5"><KeyValue label={t("visit.diagnosis")} value={visit.diagnosis ?? "—"} /></div>
                  <div className="rounded-xl border p-3.5"><KeyValue label={t("visit.plan")} value={visit.plan ?? "—"} /></div>
                  <div className="rounded-xl border p-3.5"><KeyValue label={t("common.notes")} value={visit.notes ?? "—"} /></div>
                </section>

                {canVoid && (
                  <div className="mt-5 border-t pt-4 no-print">
                    <Modal
                      title={t("action.void")}
                      trigger={<button className="btn btn-ghost btn-sm">{t("action.void")}</button>}
                    >
                      <VoidRecordForm entity="Visit" id={visit.id} />
                    </Modal>
                  </div>
                )}
              </article>
            );
          })}
        </ClinicalMasterDetail>
      )}
    </div>
  );
}
