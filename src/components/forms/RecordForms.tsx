"use client";

import { useActionState, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { Field } from "@/components/ui";
import { CloseOnSuccess, FormError, SubmitRow } from "@/components/ui/Modal";
import {
  createAllergyAction,
  createEducationAction,
  createNoteAction,
  createVaccinationAction,
  notifyCriticalAction,
  voidRecordAction,
  type ActionState,
} from "@/server/actions/clinical";
import {
  EDUCATION_TOPICS,
  INJECTION_SITES,
  VACCINES,
  VACCINE_BY_CODE,
} from "@/lib/catalog/vaccines";
import { toDateInput } from "@/lib/format";

const today = () => toDateInput(new Date());

export type PickerEmployee = {
  id: string;
  name: string;
  nationalId: string;
  gender: "MALE" | "FEMALE" | null;
};

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
      <select
        className="select"
        name="employeeId"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      >
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

function useAction(
  action: (p: ActionState, f: FormData) => Promise<ActionState>,
) {
  return useActionState<ActionState, FormData>(action, {});
}

// ---------------------------------------------------------------- visit

export {
  SmartVisitForm as VisitForm,
  SmartLabForm as LabForm,
} from "./SmartClinicalForms";

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
            {["DRUG", "FOOD", "ENVIRONMENT", "LATEX", "INSECT", "OTHER"].map(
              (v) => (
                <option key={v} value={v}>
                  {t(`allergyType.${v}`)}
                </option>
              ),
            )}
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
          <select
            className="select"
            name="vaccineCode"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          >
            {VACCINES.map((v) => (
              <option key={v.code} value={v.code}>
                {t.locale === "ar" ? v.nameAr : v.nameEn}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={t("vac.dose")}
          hint={
            def && def.doses > 1
              ? `${t("vac.series")}: ${def.doses}`
              : undefined
          }
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
          <input
            className="input"
            type="date"
            name="givenAt"
            defaultValue={today()}
            required
          />
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
              <option
                key={topic.code}
                value={t.locale === "ar" ? topic.ar : topic.en}
              />
            ))}
          </datalist>
        </Field>
        <Field label={t("edu.providedAt")} required>
          <input
            className="input"
            type="date"
            name="providedAt"
            defaultValue={today()}
            required
          />
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
