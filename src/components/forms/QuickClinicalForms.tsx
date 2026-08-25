"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useT } from "@/lib/i18n/client";
import { Field } from "@/components/ui";
import { CloseOnSuccess, useModalClose } from "@/components/ui/Modal";
import {
  createAllergyAction,
  createEducationAction,
  createNoteAction,
  createVaccinationAction,
  type ActionState,
} from "@/server/actions/clinical";
import {
  EDUCATION_TOPICS,
  INJECTION_SITES,
  VACCINES,
  VACCINE_BY_CODE,
} from "@/lib/catalog/vaccines";
import { toDateInput } from "@/lib/format";
import styles from "./QuickClinicalForm.module.css";

const today = () => toDateInput(new Date());

type PickerEmployee = {
  id: string;
  name: string;
  nationalId: string;
  gender: "MALE" | "FEMALE" | null;
};

function addMonths(dateText: string, months: number) {
  if (!dateText || !Number.isFinite(months)) return "";
  const [year, month, day] = dateText.split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(year, month - 1, day);
  date.setMonth(date.getMonth() + months);
  return toDateInput(date);
}

function QuickSubmit({ label }: { label: string }) {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary" type="submit" disabled={pending}>
      {pending ? t("action.saving") : label}
    </button>
  );
}

function Footer({ submitLabel }: { submitLabel: string }) {
  const t = useT();
  const close = useModalClose();
  return (
    <div className={styles.footer}>
      <button className="btn btn-ghost" type="button" onClick={close}>
        {t("action.cancel")}
      </button>
      <QuickSubmit label={submitLabel} />
    </div>
  );
}

function ErrorMessage({ error }: { error?: string }) {
  const t = useT();
  if (!error) return null;
  return <p className={styles.error} role="alert">{t(error)}</p>;
}

function EmployeePicker({
  employees,
  value,
  onChange,
}: {
  employees: PickerEmployee[];
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  return (
    <Field label={t("common.selectEmployee")} required>
      <select className="select" name="employeeId" value={value} onChange={(event) => onChange(event.target.value)} required>
        <option value="">—</option>
        {employees.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.name} — {employee.nationalId}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function QuickVaccinationForm({
  employeeId,
  suggestedCode,
  suggestedDose,
  employees,
}: {
  employeeId?: string;
  suggestedCode?: string;
  suggestedDose?: number;
  employees?: PickerEmployee[];
}) {
  const t = useT();
  const ar = t.locale === "ar";
  const [state, formAction] = useActionState<ActionState, FormData>(createVaccinationAction, {});
  const [selected, setSelected] = useState(employeeId ?? "");
  const [code, setCode] = useState(suggestedCode ?? "HEP_B");
  const [dose, setDose] = useState(String(suggestedDose ?? 1));
  const [givenAt, setGivenAt] = useState(today());
  const [nextDueOverride, setNextDueOverride] = useState("");
  const [dueTouched, setDueTouched] = useState(false);

  const def = VACCINE_BY_CODE[code];
  const suggestedDue = useMemo(() => {
    if (!def) return "";
    const doseNumber = Math.max(1, Number(dose) || 1);
    const interval = doseNumber < def.doses
      ? def.intervalsMonths[doseNumber - 1]
      : def.boosterMonths;
    return interval ? addMonths(givenAt, interval) : "";
  }, [def, dose, givenAt]);
  const nextDue = dueTouched ? nextDueOverride : suggestedDue;

  return (
    <form action={formAction} className={styles.quick}>
      <CloseOnSuccess ok={state.ok} />
      {!employees && <input type="hidden" name="employeeId" value={employeeId} />}

      <div className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.eyebrow}>{ar ? "تحصين سريع" : "Quick immunisation"}</span>
          <h3>{ar ? "تسجيل جرعة تطعيم" : "Record vaccine dose"}</h3>
        </div>
        <span className={styles.signal} data-tone={def?.occupational ? "warn" : "ok"}>
          {def?.occupational ? (ar ? "تحصين مهني" : "Occupational") : (ar ? "تحصين عام" : "General")}
        </span>
      </div>

      <div className={styles.surface}>
        <div className={styles.sectionHead}>
          <div>
            <h4>{ar ? "بيانات الجرعة" : "Dose details"}</h4>
            <p>{ar ? "سجل ما تم إعطاؤه فعليًا، ثم راجع تاريخ الجرعة التالية." : "Capture the administered dose, then review the suggested next due date."}</p>
          </div>
        </div>

        <div className={styles.grid2}>
          {employees && <EmployeePicker employees={employees} value={selected} onChange={setSelected} />}
          <Field label={t("vac.vaccine")} required>
            <select className="select" name="vaccineCode" value={code} onChange={(event) => { setCode(event.target.value); setDueTouched(false); }} required>
              {VACCINES.map((vaccine) => (
                <option key={vaccine.code} value={vaccine.code}>
                  {ar ? vaccine.nameAr : vaccine.nameEn}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("vac.dose")} hint={def && def.doses > 1 ? `${t("vac.series")}: ${def.doses}` : undefined} required>
            <input className="input num" name="doseNumber" type="number" min={1} value={dose} onChange={(event) => { setDose(event.target.value); setDueTouched(false); }} required />
          </Field>
          <Field label={t("vac.givenAt")} required>
            <input className="input" type="date" name="givenAt" value={givenAt} onChange={(event) => { setGivenAt(event.target.value); setDueTouched(false); }} required />
          </Field>
          <Field label={t("vac.nextDue")} hint={ar ? "محسوب من جدول اللقاح ويمكن تعديله" : "Suggested from the vaccine schedule; editable"}>
            <input className="input" type="date" name="nextDueAt" value={nextDue} onChange={(event) => { setDueTouched(true); setNextDueOverride(event.target.value); }} />
          </Field>
          <Field label={t("vac.lot")}>
            <input className="input" name="lotNumber" dir="ltr" />
          </Field>
          <Field label={t("vac.site")}>
            <select className="select" name="site" defaultValue="">
              <option value="">—</option>
              {INJECTION_SITES.map((site) => (
                <option key={site.code} value={site.code}>{ar ? site.ar : site.en}</option>
              ))}
            </select>
          </Field>
          <Field label={t("vac.provider")}>
            <input className="input" name="provider" />
          </Field>
          <div className={styles.full}>
            <Field label={t("common.notes")}>
              <textarea className="textarea" name="notes" rows={2} />
            </Field>
          </div>
        </div>

        {def && (
          <div className={styles.infoCard}>
            <span>{ar ? "جدول اللقاح" : "Vaccine schedule"}</span>
            <strong>{def.doses} {ar ? "جرعة" : "dose(s)"}{suggestedDue ? ` · ${ar ? "الاستحقاق المقترح" : "Suggested due"}: ${suggestedDue}` : ""}</strong>
          </div>
        )}
        {def?.note && <div className={styles.riskCard}><span>{ar ? "ملاحظة سريرية" : "Clinical note"}</span><strong>{ar ? def.note.ar : def.note.en}</strong></div>}
      </div>

      <ErrorMessage error={state.error} />
      <Footer submitLabel={t("action.save")} />
    </form>
  );
}

export function QuickAllergyForm({ employeeId }: { employeeId: string }) {
  const t = useT();
  const ar = t.locale === "ar";
  const [state, formAction] = useActionState<ActionState, FormData>(createAllergyAction, {});
  const [severity, setSeverity] = useState("MODERATE");
  const [substance, setSubstance] = useState("");

  const tone = severity === "SEVERE" || severity === "LIFE_THREATENING" ? "danger" : severity === "MODERATE" ? "warn" : "ok";

  return (
    <form action={formAction} className={styles.quick}>
      <CloseOnSuccess ok={state.ok} />
      <input type="hidden" name="employeeId" value={employeeId} />

      <div className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.eyebrow}>{ar ? "سلامة الحساسية" : "Allergy safety"}</span>
          <h3>{ar ? "تسجيل حساسية" : "Record allergy"}</h3>
        </div>
        <span className={styles.signal} data-tone={tone}>{t(`severity.${severity}`)}</span>
      </div>

      <div className={styles.surface}>
        <div className={styles.grid2}>
          <Field label={t("allergy.substance")} required>
            <input className="input" name="substance" value={substance} onChange={(event) => setSubstance(event.target.value)} required autoFocus />
          </Field>
          <Field label={t("allergy.type")} required>
            <select className="select" name="type" defaultValue="DRUG" required>
              {["DRUG", "FOOD", "ENVIRONMENT", "LATEX", "INSECT", "OTHER"].map((value) => <option key={value} value={value}>{t(`allergyType.${value}`)}</option>)}
            </select>
          </Field>
          <Field label={t("allergy.severity")} required>
            <select className="select" name="severity" value={severity} onChange={(event) => setSeverity(event.target.value)} required>
              {["MILD", "MODERATE", "SEVERE", "LIFE_THREATENING"].map((value) => <option key={value} value={value}>{t(`severity.${value}`)}</option>)}
            </select>
          </Field>
          <Field label={t("allergy.certainty")} required>
            <select className="select" name="certainty" defaultValue="SUSPECTED" required>
              {["CONFIRMED", "SUSPECTED"].map((value) => <option key={value} value={value}>{t(`certainty.${value}`)}</option>)}
            </select>
          </Field>
          <Field label={t("allergy.state")} required>
            <select className="select" name="allergyStatus" defaultValue="ACTIVE" required>
              {["ACTIVE", "RESOLVED", "REFUTED"].map((value) => <option key={value} value={value}>{t(`allergyStatus.${value}`)}</option>)}
            </select>
          </Field>
          <Field label={t("allergy.reaction")}>
            <input className="input" name="reaction" />
          </Field>
          <div className={styles.full}><Field label={t("allergy.action")}><input className="input" name="action" /></Field></div>
          <div className={styles.full}><Field label={t("common.notes")}><textarea className="textarea" name="notes" rows={2} /></Field></div>
        </div>

        <div className={styles.riskCard} data-tone={tone}>
          <span>{ar ? "معاينة التنبيه" : "Alert preview"}</span>
          <strong>{substance.trim() || (ar ? "المادة المسببة" : "Allergen")} · {t(`severity.${severity}`)}</strong>
        </div>
      </div>

      <ErrorMessage error={state.error} />
      <Footer submitLabel={t("action.save")} />
    </form>
  );
}

export function QuickEducationForm({ employeeId }: { employeeId: string }) {
  const t = useT();
  const ar = t.locale === "ar";
  const [state, formAction] = useActionState<ActionState, FormData>(createEducationAction, {});
  const [topic, setTopic] = useState("");
  const [method, setMethod] = useState("");
  const methodChoices = ar ? ["جلسة فردية", "شرح مباشر", "منشور تثقيفي", "عرض توعوي"] : ["One-to-one", "Verbal counselling", "Handout", "Education session"];

  return (
    <form action={formAction} className={styles.quick}>
      <CloseOnSuccess ok={state.ok} />
      <input type="hidden" name="employeeId" value={employeeId} />

      <div className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.eyebrow}>{ar ? "تثقيف صحي" : "Health education"}</span>
          <h3>{ar ? "توثيق تثقيف صحي" : "Document health education"}</h3>
        </div>
        <span className={styles.signal} data-tone={topic ? "ok" : undefined}>{topic ? (ar ? "الموضوع محدد" : "Topic selected") : (ar ? "إدخال سريع" : "Quick entry")}</span>
      </div>

      <div className={styles.surface}>
        <div className={styles.quickChoices} aria-label={ar ? "مواضيع شائعة" : "Common topics"}>
          {EDUCATION_TOPICS.filter((item) => item.code !== "OTHER").map((item) => {
            const label = ar ? item.ar : item.en;
            return <button key={item.code} type="button" className={styles.quickChoice} data-active={topic === label} onClick={() => setTopic(label)}>{label}</button>;
          })}
        </div>

        <div className={styles.grid2}>
          <Field label={t("edu.topic")} required>
            <input className="input" name="topic" value={topic} onChange={(event) => setTopic(event.target.value)} list="quick-edu-topics" required />
            <datalist id="quick-edu-topics">
              {EDUCATION_TOPICS.map((item) => <option key={item.code} value={ar ? item.ar : item.en} />)}
            </datalist>
          </Field>
          <Field label={t("edu.providedAt")} required>
            <input className="input" type="date" name="providedAt" defaultValue={today()} required />
          </Field>
          <div className={styles.full}>
            <Field label={t("edu.method")}>
              <input className="input" name="method" value={method} onChange={(event) => setMethod(event.target.value)} />
            </Field>
            <div className={`${styles.quickChoices} mt-2`}>
              {methodChoices.map((choice) => <button key={choice} type="button" className={styles.quickChoice} data-active={method === choice} onClick={() => setMethod(choice)}>{choice}</button>)}
            </div>
          </div>
          <div className={styles.full}><Field label={t("common.notes")}><textarea className="textarea" name="notes" rows={2} /></Field></div>
        </div>
      </div>

      <ErrorMessage error={state.error} />
      <Footer submitLabel={t("action.save")} />
    </form>
  );
}

export function QuickNoteForm({ employeeId }: { employeeId: string }) {
  const t = useT();
  const ar = t.locale === "ar";
  const [state, formAction] = useActionState<ActionState, FormData>(createNoteAction, {});
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);

  return (
    <form action={formAction} className={styles.quick}>
      <CloseOnSuccess ok={state.ok} />
      <input type="hidden" name="employeeId" value={employeeId} />

      <div className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.eyebrow}>{ar ? "ملاحظة سريرية" : "Clinical note"}</span>
          <h3>{ar ? "إضافة ملاحظة سريرية" : "Add clinical note"}</h3>
        </div>
        <span className={styles.signal} data-tone={pinned ? "warn" : undefined}>{pinned ? t("note.pinned") : `${body.length}`}</span>
      </div>

      <div className={styles.surface}>
        <Field label={t("note.body")} required>
          <textarea className="textarea" name="body" rows={6} value={body} onChange={(event) => setBody(event.target.value)} required autoFocus />
        </Field>

        <div className={styles.pin}>
          <div className={styles.pinText}>
            <b>{t("note.pin")}</b>
            <small>{ar ? "اجعل الملاحظة في أعلى قائمة الملاحظات عند الحاجة." : "Keep this note at the top of the notes list when clinically useful."}</small>
          </div>
          <label className={styles.switch}>
            <input type="checkbox" name="isPinned" value="true" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
            <span aria-hidden />
          </label>
        </div>
      </div>

      <ErrorMessage error={state.error} />
      <Footer submitLabel={t("action.save")} />
    </form>
  );
}
