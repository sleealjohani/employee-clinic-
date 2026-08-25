import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { getT } from "@/lib/i18n";
import { TEST_BY_CODE } from "@/lib/catalog/tests";
import { flagTone, isCritical } from "@/lib/clinical/rules";
import { formatDate, formatValue } from "@/lib/format";
import { Empty } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { SmartLabForm } from "@/components/forms/SmartClinicalForms";
import { IconPlus } from "@/components/layout/icons";
import { LabResultDetails } from "./LabResultRow";
import { ClinicalMasterDetail, type MasterDetailItem } from "./ClinicalMasterDetail";

export async function EmployeeLabWorkspace({
  employeeId,
  sex,
}: {
  employeeId: string;
  sex: "MALE" | "FEMALE" | null;
}) {
  const [user, t, labs] = await Promise.all([
    requireUser(),
    getT(),
    db.labResult.findMany({
      where: { employeeId },
      orderBy: [{ collectedAt: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const ar = t.locale === "ar";
  const canWrite = can(user.role, "clinical.write");
  const canVoid = can(user.role, "clinical.void");

  const items: MasterDetailItem[] = labs.map((lab) => {
    const def = TEST_BY_CODE[lab.testCode];
    const name = def ? (ar ? def.nameAr : def.nameEn) : lab.testName;
    const value =
      lab.resultType === "QUANTITATIVE"
        ? `${formatValue(lab.valueNum)}${lab.unit ? ` ${lab.unit}` : ""}`
        : (lab.valueText ?? "—");
    const critical = isCritical(lab.flag, lab.testCode);
    const voided = lab.status === "ENTERED_IN_ERROR";
    const badges: MasterDetailItem["badges"] = [
      { label: t(`flag.${lab.flag}`), tone: flagTone(lab.flag) },
    ];

    if (critical && !lab.criticalNotifiedAt) badges.push({ label: t("lab.critical"), tone: "danger" });
    if (lab.requiresReview && !lab.reviewedAt) badges.push({ label: t("lab.needsReview"), tone: "warn" });
    if (voided) badges.push({ label: t("recordStatus.ENTERED_IN_ERROR"), tone: "neutral" });

    return {
      id: lab.id,
      title: name,
      subtitle: value,
      meta: formatDate(lab.collectedAt, t.locale),
      tone: critical && !lab.criticalNotifiedAt ? "danger" : lab.requiresReview && !lab.reviewedAt ? "warn" : flagTone(lab.flag),
      badges,
    };
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-[1.2rem] border px-4 py-3" style={{ background: "color-mix(in srgb, var(--surface-glass) 88%, transparent)", borderColor: "var(--glass-border)" }}>
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--accent-text)" }}>
            LAB WORKSPACE
          </p>
          <h2 className="mt-1 text-base font-extrabold">{ar ? "سجل التحاليل" : "Laboratory history"}</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>
            {ar ? "اختر التحليل من القائمة؛ النتيجة والتفسير والإجراءات تظهر فورًا في مساحة واحدة." : "Select a result to reveal the value, interpretation, provenance, and actions in one workspace."}
          </p>
        </div>
        {canWrite && (
          <Modal
            title={t("lab.new")}
            wide
            trigger={
              <button className="btn btn-primary btn-sm">
                <IconPlus /> {t("lab.new")}
              </button>
            }
          >
            <SmartLabForm employeeId={employeeId} sex={sex} />
          </Modal>
        )}
      </div>

      {labs.length === 0 ? (
        <Empty title={t("common.empty")} hint={t("common.emptyHint")} />
      ) : (
        <ClinicalMasterDetail
          items={items}
          searchPlaceholder={ar ? "ابحث باسم التحليل أو النتيجة…" : "Search test or result…"}
          emptyLabel={ar ? "لا توجد نتيجة مطابقة" : "No matching result"}
        >
          {labs.map((lab) => (
            <LabResultDetails key={lab.id} lab={lab} t={t} canWrite={canWrite} canVoid={canVoid} />
          ))}
        </ClinicalMasterDetail>
      )}
    </div>
  );
}
