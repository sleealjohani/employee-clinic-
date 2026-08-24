import type { LabResult } from "@prisma/client";
import { Chip, KeyValue } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { CriticalNotifyForm, VoidRecordForm } from "@/components/forms/RecordForms";
import { ReviewLabButton } from "./ReviewLabButton";
import { flagTone, interpretLab, isCritical } from "@/lib/clinical/rules";
import { TEST_BY_CODE } from "@/lib/catalog/tests";
import { formatDate, formatDateTime, formatValue } from "@/lib/format";
import type { Translator } from "@/lib/i18n/core";

function labPresentation(lab: LabResult, t: Translator) {
  const def = TEST_BY_CODE[lab.testCode];
  const name = def ? (t.locale === "ar" ? def.nameAr : def.nameEn) : lab.testName;
  const tone = flagTone(lab.flag);
  const { interpretation, action } = interpretLab(lab.testCode, lab.flag, lab.valueNum, t.locale);
  const critical = isCritical(lab.flag, lab.testCode);
  const voided = lab.status === "ENTERED_IN_ERROR";

  const value =
    lab.resultType === "QUANTITATIVE"
      ? `${formatValue(lab.valueNum)}${lab.unit ? ` ${lab.unit}` : ""}`
      : (lab.valueText ?? "—");

  const range =
    lab.refText ??
    (lab.refLow !== null && lab.refHigh !== null
      ? `${lab.refLow} – ${lab.refHigh}`
      : lab.refLow !== null
        ? `≥ ${lab.refLow}`
        : lab.refHigh !== null
          ? `< ${lab.refHigh}`
          : "—");

  return { name, tone, interpretation, action, critical, voided, value, range };
}

export function LabResultDetails({
  lab,
  t,
  canWrite,
  canVoid,
}: {
  lab: LabResult;
  t: Translator;
  canWrite: boolean;
  canVoid: boolean;
}) {
  const { name, tone, interpretation, action, critical, voided, value, range } = labPresentation(lab, t);

  return (
    <article style={{ opacity: voided ? 0.55 : 1 }}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Chip tone={tone} dot>{t(`flag.${lab.flag}`)}</Chip>
            {critical && !lab.criticalNotifiedAt && <Chip tone="danger">{t("lab.critical")}</Chip>}
            {lab.requiresReview && !lab.reviewedAt && <Chip tone="warn">{t("lab.needsReview")}</Chip>}
            {voided && <Chip tone="neutral">{t("recordStatus.ENTERED_IN_ERROR")}</Chip>}
          </div>
          <h3 className="text-lg font-extrabold">{name}</h3>
          <p className="num mt-1 text-xl font-black" dir="ltr">{value}</p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>
            {formatDate(lab.collectedAt, t.locale)}
          </p>
        </div>
        <div className="rounded-xl border px-3 py-2 text-end" style={{ background: "var(--surface-2)" }}>
          <span className="block text-[0.58rem] font-bold" style={{ color: "var(--text-faint)" }}>{t("lab.reference")}</span>
          <strong className="num mt-1 block text-sm" dir="ltr">{range}</strong>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border p-3.5" style={{ background: "var(--surface-2)" }}>
          <KeyValue label={t("lab.interpretation")} value={interpretation} />
        </div>
        <div className="rounded-xl border p-3.5" style={{ background: "var(--surface-2)" }}>
          <KeyValue label={t("lab.action")} value={action} />
        </div>
      </section>

      <section className="mt-4">
        <p className="mb-2 text-[0.67rem] font-extrabold uppercase tracking-[0.06em]" style={{ color: "var(--text-faint)" }}>
          {t.locale === "ar" ? "بيانات المختبر" : "Laboratory details"}
        </p>
        <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-xl border p-3"><KeyValue label={t("lab.collectedAt")} value={formatDate(lab.collectedAt, t.locale)} mono /></div>
          <div className="rounded-xl border p-3"><KeyValue label={t("lab.verifiedAt")} value={formatDate(lab.verifiedAt, t.locale)} mono /></div>
          <div className="rounded-xl border p-3"><KeyValue label={t("lab.orderNo")} value={lab.orderNo ?? "—"} mono /></div>
          <div className="rounded-xl border p-3"><KeyValue label={t("lab.sampleNo")} value={lab.sampleNo ?? "—"} mono /></div>
          <div className="rounded-xl border p-3"><KeyValue label={t("lab.performedBy")} value={lab.performedBy ?? "—"} /></div>
          <div className="rounded-xl border p-3"><KeyValue label={t("lab.verifiedBy")} value={lab.verifiedBy ?? "—"} /></div>
          <div className="rounded-xl border p-3"><KeyValue label={t("lab.labName")} value={lab.labName ?? "—"} /></div>
          <div className="rounded-xl border p-3">
            <KeyValue
              label={t("lab.source")}
              value={
                lab.sourceAttachmentId ? (
                  <a
                    href={`/api/attachments/${lab.sourceAttachmentId}${lab.sourcePage ? `#page=${lab.sourcePage}` : ""}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--accent-text)", fontWeight: 700 }}
                  >
                    {t("lab.viewSource")}
                  </a>
                ) : (
                  t("lab.sourceManual")
                )
              }
            />
          </div>
        </dl>
      </section>

      {lab.criticalNotifiedAt && (
        <div className="mt-4 rounded-xl border px-3.5 py-3 text-xs" style={{ background: "var(--ok-soft)", color: "var(--ok)", borderColor: "color-mix(in srgb, var(--ok) 18%, var(--border))" }}>
          <strong>{t("lab.criticalNotify")}:</strong> {lab.criticalNotifiedTo} — {formatDateTime(lab.criticalNotifiedAt, t.locale)}
          <div className="mt-1" style={{ opacity: 0.9 }}>{lab.criticalAction}</div>
        </div>
      )}

      {lab.reviewedAt && (
        <p className="mt-3 text-xs" style={{ color: "var(--text-faint)" }}>
          {t("lab.reviewed")} — {formatDateTime(lab.reviewedAt, t.locale)}
        </p>
      )}

      {lab.voidReason && (
        <p className="mt-3 text-xs" style={{ color: "var(--danger)" }}>
          {t("common.reason")}: {lab.voidReason}
        </p>
      )}

      {canWrite && !voided && (
        <div className="mt-5 flex flex-wrap gap-2 border-t pt-4 no-print">
          {critical && !lab.criticalNotifiedAt && (
            <Modal
              title={t("lab.criticalNotify")}
              trigger={<button className="btn btn-danger btn-sm">{t("lab.criticalNotify")}</button>}
            >
              <CriticalNotifyForm labId={lab.id} />
            </Modal>
          )}
          {lab.requiresReview && !lab.reviewedAt && <ReviewLabButton labId={lab.id} label={t("lab.markReviewed")} />}
          {canVoid && (
            <Modal
              title={t("action.void")}
              trigger={<button className="btn btn-ghost btn-sm">{t("action.void")}</button>}
            >
              <VoidRecordForm entity="LabResult" id={lab.id} />
            </Modal>
          )}
        </div>
      )}
    </article>
  );
}

/**
 * Compact expandable row retained for global laboratory queues.
 * Employee 360 uses LabResultDetails inside the master-detail workspace.
 */
export function LabResultRow({
  lab,
  t,
  canWrite,
  canVoid,
  showEmployee,
  employeeName,
}: {
  lab: LabResult;
  t: Translator;
  canWrite: boolean;
  canVoid: boolean;
  showEmployee?: boolean;
  employeeName?: string;
}) {
  const { name, tone, critical, voided, value } = labPresentation(lab, t);

  return (
    <details className="group border-b last:border-b-0" style={{ opacity: voided ? 0.5 : 1 }}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 hover:bg-[var(--surface-2)]">
        <span className="min-w-[9rem] flex-1 text-sm font-semibold">
          {name}
          {showEmployee && employeeName && (
            <span className="block text-xs font-normal" style={{ color: "var(--text-faint)" }}>
              {employeeName}
            </span>
          )}
        </span>
        <span className="num min-w-[6rem] text-sm font-bold" dir="ltr">{value}</span>
        <Chip tone={tone} dot>{t(`flag.${lab.flag}`)}</Chip>
        {critical && !lab.criticalNotifiedAt && <Chip tone="danger">{t("lab.critical")}</Chip>}
        {lab.requiresReview && !lab.reviewedAt && <Chip tone="warn">{t("lab.needsReview")}</Chip>}
        {voided && <Chip tone="neutral">{t("recordStatus.ENTERED_IN_ERROR")}</Chip>}
        <span className="num ms-auto text-xs" style={{ color: "var(--text-faint)" }}>
          {formatDate(lab.collectedAt, t.locale)}
        </span>
      </summary>
      <div className="border-t px-4 py-4" style={{ background: "var(--surface-2)" }}>
        <LabResultDetails lab={lab} t={t} canWrite={canWrite} canVoid={canVoid} />
      </div>
    </details>
  );
}
