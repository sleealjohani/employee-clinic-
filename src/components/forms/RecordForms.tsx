"use client";

import { useActionState, useMemo, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { Field } from "@/components/ui";
import { CloseOnSuccess, FormError, SubmitRow } from "@/components/ui/Modal";
import {
  createAllergyAction,
  createEducationAction,
  createLabAction,
  createNoteAction,
  createVaccinationAction,
  createVisitAction,
  notifyCriticalAction,
  voidRecordAction,
  type ActionState,
} from "@/server/actions/clinical";
import { CATEGORY_LABEL, TESTS, TEST_BY_CODE, refFor, type TestCategory } from "@/lib/catalog/tests";
import { EDUCATION_TOPICS, INJECTION_SITES, VACCINES, VACCINE_BY_CODE } from "@/lib/catalog/vaccines";
import { toDateInput } from "@/lib/format";

const today = () => toDateInput(new Date());

export type PickerEmployee = { id: string; name: string; nationalId: string; gender: "MALE" | "FEMALE" | null };

function EmployeePicker({
  employees,
  value,
  onChange,
  label,
}: {
  employees: PickerEmployee[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <Field label={label} required>
      <select className="select" name="employeeId" value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">—</option>
        {employees.map((emp) => (
          <option key={emp.id} value={emp.id}>
            {emp.name} — {emp.nationalId}
          </option>
        ))}
      </select>
    </Field>
  );
}

function useAction(action: (p: ActionState, f: FormData) => Promise<ActionState>) {
  return useActionState<ActionState, FormData>(action, {});
}

// ---------------------------------------------------------------- visit

export function VisitForm({
  employeeId,
  employees,
}: {
  employeeId?: string;
  employees?: PickerEmployee[];
}) {
  const t = useT();
  const [state, formAction] = useAction(createVisitAction);
  const [selected, setSelected] = useState(employeeId ?? "");

  const vitals: [string, string, string, string?][] = [
    ["tempC", t("visit.temp"), "°C", "0.1"],
    ["systolic", t("visit.systolic"), "mmHg"],
    ["diastolic", t("visit.diastolic"), "mmHg"],
    ["pulse", t("visit.pulse"), "bpm"],
    ["respRate", t("visit.rr"), "/min"],
    ["spo2", t("visit.spo2"), "%"],
    ["weightKg", t("visit.weight"), "kg", "0.1"],
    ["heightCm", t("visit.height"), "cm", "0.1"],
  ];

  return (
    <form action={formAction}>
      <CloseOnSuccess ok={state.ok} />
      {employees ? (
        <div className="mb-3">
          <EmployeePicker
            employees={employees}
            value={selected}
            onChange={setSelected}
            label={t("common.selectEmployee")}
          />
        </div>
      ) : (
        <input type="hidden" name="employeeId" value={employeeId} />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("visit.date")} required>
          <input className="input" type="date" name="visitDate" defaultValue={today()} required />
        </Field>
        <Field label={t("visit.type")} required>
          <select className="select" name="type" defaultValue="ACUTE_CARE">
            {[
              "ACUTE_CARE",
              "FOLLOW_UP",
              "PRE_EMPLOYMENT",
              "PERIODIC",
              "INJURY",
              "EXPOSURE",
              "VACCINATION",
              "CONSULTATION",
              "OTHER",
            ].map((v) => (
              <option key={v} value={v}>
                {t(`visitType.${v}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-3">
        <Field label={t("visit.chief")}>
          <input className="input" name="chiefComplaint" />
        </Field>
      </div>

      <fieldset className="mt-4 rounded-xl border p-3">
        <legend className="px-1 text-xs font-bold" style={{ color: "var(--text-muted)" }}>
          {t("visit.vitals")}
        </legend>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {vitals.map(([name, label, unit, step]) => (
            <Field key={name} label={`${label} (${unit})`}>
              <input className="input num" name={name} type="number" step={step ?? "1"} inputMode="decimal" />
            </Field>
          ))}
        </div>
      </fieldset>

      <div className="mt-3 grid gap-3">
        <Field label={t("visit.diagnosis")}>
          <input className="input" name="diagnosis" />
        </Field>
        <Field label={t("visit.plan")}>
          <textarea className="textarea" name="plan" rows={2} />
        </Field>
        <Field label={t("common.notes")}>
          <textarea className="textarea" name="notes" rows={2} />
        </Field>
      </div>

      <FormError error={state.error} />
      <SubmitRow />
    </form>
  );
}

// ---------------------------------------------------------------- lab

export function LabForm({
  employeeId,
  sex,
  employees,
}: {
  employeeId?: string;
  sex?: "MALE" | "FEMALE" | null;
  employees?: PickerEmployee[];
}) {
  const t = useT();
  const [state, formAction] = useAction(createLabAction);
  const [code, setCode] = useState("");
  const [selected, setSelected] = useState(employeeId ?? "");

  const def = code ? TEST_BY_CODE[code] : undefined;
  // The reference range for several tests depends on sex, so it follows the picker.
  const effectiveSex = employees ? (employees.find((e) => e.id === selected)?.gender ?? null) : (sex ?? null);
  const range = useMemo(() => (def ? refFor(def, effectiveSex) : undefined), [def, effectiveSex]);

  const grouped = useMemo(() => {
    const map = new Map<TestCategory, typeof TESTS>();
    for (const test of TESTS) {
      const list = map.get(test.category) ?? [];
      list.push(test);
      map.set(test.category, list);
    }
    return [...map.entries()];
  }, []);

  return (
    <form action={formAction}>
      <CloseOnSuccess ok={state.ok} />
      {employees ? (
        <div className="mb-3">
          <EmployeePicker
            employees={employees}
            value={selected}
            onChange={setSelected}
            label={t("common.selectEmployee")}
          />
        </div>
      ) : (
        <input type="hidden" name="employeeId" value={employeeId} />
      )}
      <input type="hidden" name="resultType" value={def?.resultType ?? "QUANTITATIVE"} />

      <Field label={t("lab.test")} hint={t("lab.autoRef")} required>
        <select
          className="select"
          name="testCode"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        >
          <option value="">{t("lab.selectTest")}</option>
          {grouped.map(([category, tests]) => (
            <optgroup key={category} label={CATEGORY_LABEL[category][t.locale]}>
              {tests.map((test) => (
                <option key={test.code} value={test.code}>
                  {t.locale === "ar" ? test.nameAr : test.nameEn}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>

      {def && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {def.resultType === "QUANTITATIVE" ? (
            <>
              <Field label={t("lab.value")} required>
                <input className="input num" name="valueNum" type="number" step="any" inputMode="decimal" required />
              </Field>
              <Field label={t("lab.unit")}>
                <input className="input" name="unit" defaultValue={def.unit ?? ""} dir="ltr" />
              </Field>
              <Field label={`${t("lab.reference")} — ${t("common.of")}`}>
                <input
                  className="input num"
                  name="refLow"
                  type="number"
                  step="any"
                  defaultValue={range?.low ?? ""}
                  placeholder="min"
                />
              </Field>
              <Field label={`${t("lab.reference")} — ${t("action.next")}`}>
                <input
                  className="input num"
                  name="refHigh"
                  type="number"
                  step="any"
                  defaultValue={range?.high ?? ""}
                  placeholder="max"
                />
              </Field>
            </>
          ) : (
            <div className="sm:col-span-2">
              <Field label={t("lab.value")} required>
                <select className="select" name="valueText" defaultValue="" required>
                  <option value="" disabled>
                    —
                  </option>
                  <option value="Non-Reactive">{t("flag.NON_REACTIVE")}</option>
                  <option value="Reactive">{t("flag.REACTIVE")}</option>
                  <option value="Indeterminate">{t("flag.INDETERMINATE")}</option>
                </select>
              </Field>
            </div>
          )}

          <Field label={t("lab.collectedAt")}>
            <input className="input" type="date" name="collectedAt" defaultValue={today()} />
          </Field>
          <Field label={t("lab.verifiedAt")}>
            <input className="input" type="date" name="verifiedAt" />
          </Field>
          <Field label={t("lab.orderNo")}>
            <input className="input" name="orderNo" dir="ltr" />
          </Field>
          <Field label={t("lab.sampleNo")}>
            <input className="input" name="sampleNo" dir="ltr" />
          </Field>
          <Field label={t("lab.performedBy")}>
            <input className="input" name="performedBy" />
          </Field>
          <Field label={t("lab.verifiedBy")}>
            <input className="input" name="verifiedBy" />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t("lab.labName")}>
              <input className="input" name="labName" />
            </Field>
          </div>
        </div>
      )}

      <FormError error={state.error} />
      <SubmitRow />
    </form>
  );
}

// ---------------------------------------------------------------- allergy

export function AllergyForm({ employeeId }: { employeeId: string }) {
  const t = useT();
  const [state, formAction] = useAction(createAllergyAction);

  return (
    <form action={formAction}>
      <CloseOnSuccess ok={state.ok} />
      <input type="hidden" name="employeeId" value={employeeId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("allergy.type")} required>
          <select className="select" name="type" defaultValue="DRUG">
            {["DRUG", "FOOD", "ENVIRONMENT", "LATEX", "INSECT", "OTHER"].map((v) => (
              <option key={v} value={v}>
                {t(`allergyType.${v}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("allergy.substance")} required>
          <input className="input" name="substance" required />
        </Field>
        <Field label={t("allergy.severity")} required>
          <select className="select" name="severity" defaultValue="MODERATE">
            {["MILD", "MODERATE", "SEVERE", "LIFE_THREATENING"].map((v) => (
              <option key={v} value={v}>
                {t(`severity.${v}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("allergy.certainty")} required>
          <select className="select" name="certainty" defaultValue="SUSPECTED">
            {["CONFIRMED", "SUSPECTED"].map((v) => (
              <option key={v} value={v}>
                {t(`certainty.${v}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("allergy.state")} required>
          <select className="select" name="allergyStatus" defaultValue="ACTIVE">
            {["ACTIVE", "RESOLVED", "REFUTED"].map((v) => (
              <option key={v} value={v}>
                {t(`allergyStatus.${v}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-3 grid gap-3">
        <Field label={t("allergy.reaction")}>
          <input className="input" name="reaction" />
        </Field>
        <Field label={t("allergy.action")}>
          <input className="input" name="action" />
        </Field>
        <Field label={t("common.notes")}>
          <textarea className="textarea" name="notes" rows={2} />
        </Field>
      </div>

      <FormError error={state.error} />
      <SubmitRow />
    </form>
  );
}

// ---------------------------------------------------------------- vaccination

export function VaccinationForm({
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
  const [state, formAction] = useAction(createVaccinationAction);
  const [code, setCode] = useState(suggestedCode ?? "HEP_B");
  const [selected, setSelected] = useState(employeeId ?? "");
  const def = VACCINE_BY_CODE[code];

  return (
    <form action={formAction}>
      <CloseOnSuccess ok={state.ok} />
      {employees ? (
        <div className="mb-3">
          <EmployeePicker
            employees={employees}
            value={selected}
            onChange={setSelected}
            label={t("common.selectEmployee")}
          />
        </div>
      ) : (
        <input type="hidden" name="employeeId" value={employeeId} />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("vac.vaccine")} required>
          <select className="select" name="vaccineCode" value={code} onChange={(e) => setCode(e.target.value)}>
            {VACCINES.map((v) => (
              <option key={v.code} value={v.code}>
                {t.locale === "ar" ? v.nameAr : v.nameEn}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={t("vac.dose")}
          hint={def && def.doses > 1 ? `${t("vac.series")}: ${def.doses}` : undefined}
          required
        >
          <input
            className="input num"
            name="doseNumber"
            type="number"
            min={1}
            defaultValue={suggestedDose ?? 1}
            required
          />
        </Field>
        <Field label={t("vac.givenAt")} required>
          <input className="input" type="date" name="givenAt" defaultValue={today()} required />
        </Field>
        <Field label={t("vac.lot")}>
          <input className="input" name="lotNumber" dir="ltr" />
        </Field>
        <Field label={t("vac.site")}>
          <select className="select" name="site" defaultValue="">
            <option value="">—</option>
            {INJECTION_SITES.map((s) => (
              <option key={s.code} value={s.code}>
                {t.locale === "ar" ? s.ar : s.en}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("vac.provider")}>
          <input className="input" name="provider" />
        </Field>
        <Field label={t("vac.nextDue")} hint={t("common.optional")}>
          <input className="input" type="date" name="nextDueAt" />
        </Field>
      </div>

      {def?.note && (
        <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
          {t.locale === "ar" ? def.note.ar : def.note.en}
        </p>
      )}

      <div className="mt-3">
        <Field label={t("common.notes")}>
          <textarea className="textarea" name="notes" rows={2} />
        </Field>
      </div>

      <FormError error={state.error} />
      <SubmitRow />
    </form>
  );
}

// ---------------------------------------------------------------- education & note

export function EducationForm({ employeeId }: { employeeId: string }) {
  const t = useT();
  const [state, formAction] = useAction(createEducationAction);

  return (
    <form action={formAction}>
      <CloseOnSuccess ok={state.ok} />
      <input type="hidden" name="employeeId" value={employeeId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("edu.topic")} required>
          <input className="input" name="topic" list="edu-topics" required />
          <datalist id="edu-topics">
            {EDUCATION_TOPICS.map((topic) => (
              <option key={topic.code} value={t.locale === "ar" ? topic.ar : topic.en} />
            ))}
          </datalist>
        </Field>
        <Field label={t("edu.providedAt")} required>
          <input className="input" type="date" name="providedAt" defaultValue={today()} required />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("edu.method")}>
            <input className="input" name="method" />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={t("common.notes")}>
            <textarea className="textarea" name="notes" rows={2} />
          </Field>
        </div>
      </div>

      <FormError error={state.error} />
      <SubmitRow />
    </form>
  );
}

export function NoteForm({ employeeId }: { employeeId: string }) {
  const t = useT();
  const [state, formAction] = useAction(createNoteAction);

  return (
    <form action={formAction}>
      <CloseOnSuccess ok={state.ok} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <Field label={t("note.body")} required>
        <textarea className="textarea" name="body" rows={5} required />
      </Field>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPinned" value="true" />
        {t("note.pin")}
      </label>
      <FormError error={state.error} />
      <SubmitRow />
    </form>
  );
}

// ---------------------------------------------------------------- critical result

export function CriticalNotifyForm({ labId }: { labId: string }) {
  const t = useT();
  const [state, formAction] = useAction(notifyCriticalAction);

  return (
    <form action={formAction}>
      <CloseOnSuccess ok={state.ok} />
      <input type="hidden" name="id" value={labId} />
      <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
        {t("lab.notifyHint")}
      </p>
      <div className="grid gap-3">
        <Field label={t("lab.notifiedTo")} required>
          <input className="input" name="notifiedTo" required />
        </Field>
        <Field label={t("lab.criticalActionTaken")} required>
          <textarea className="textarea" name="action" rows={3} required />
        </Field>
      </div>
      <FormError error={state.error} />
      <SubmitRow submitLabel={t("lab.criticalNotify")} />
    </form>
  );
}

// ---------------------------------------------------------------- correction

export function VoidRecordForm({ entity, id }: { entity: string; id: string }) {
  const t = useT();
  const [state, formAction] = useAction(voidRecordAction);

  return (
    <form action={formAction}>
      <CloseOnSuccess ok={state.ok} />
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="id" value={id} />
      <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
        {t("recordStatus.ENTERED_IN_ERROR")} — {t("audit.immutable")}
      </p>
      <Field label={t("common.reason")} required>
        <textarea className="textarea" name="reason" rows={3} required />
      </Field>
      <FormError error={state.error} />
      <SubmitRow submitLabel={t("action.void")} danger />
    </form>
  );
}
