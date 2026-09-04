"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui";
import { CloseOnSuccess, FormError, SubmitRow } from "@/components/ui/Modal";
import { useT } from "@/lib/i18n/client";
import {
  createNeedleStickIncidentAction,
  updateNeedleStickIncidentAction,
  voidNeedleStickIncidentAction,
  type NeedleStickActionState,
} from "@/server/actions/needle-stick";

export type NeedleStickEmployeeOption = {
  id: string;
  name: string;
  nationalId: string;
  employeeNo: string | null;
  department: string | null;
};

export type NeedleStickIncidentInitial = {
  id: string;
  employeeId: string;
  department: string;
  nature: "NEEDLE_STICK" | "CUT" | "SPLASH" | "OTHER";
  otherNature: string;
  incidentAt: string;
  staffSignature: string;
  sourcePatientName: string;
  sourcePatientFileNo: string;
  sourceWard: string;
  sourceBloodBorneHistory: "UNKNOWN" | "NO" | "YES";
  sourceBloodBorneDetails: string;
  actionWashing: boolean;
  actionIrrigation: boolean;
  actionEmployeeClinic: boolean;
  actionImmunoglobulin: boolean;
  headOfDepartmentName: string;
  headOfDepartmentSignature: string;
  headOfDepartmentSignedAt: string;
  reportReceivedAt: string;
  patientHivResult: string;
  patientHbvResult: string;
  patientHcvResult: string;
  patientOtherResult: string;
  staffHivResult: string;
  staffHbvResult: string;
  staffHcvResult: string;
  staffOtherResult: string;
  recommendation: string;
  physicianName: string;
  physicianSignature: string;
  physicianSignedAt: string;
  completedAt: string;
  revision: number;
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="card card-pad">
      <legend className="sr-only">{title}</legend>
      <div className="mb-4 border-b pb-3">
        <h2 className="text-sm font-bold" style={{ color: "var(--text)" }}>
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {description}
          </p>
        )}
      </div>
      {children}
    </fieldset>
  );
}

function Checkbox({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked?: boolean;
}) {
  return (
    <label className="flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} />
      <span>{label}</span>
    </label>
  );
}

function SaveButton({ edit }: { edit: boolean }) {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending
        ? t("action.saving")
        : t(edit ? "needle.update" : "needle.register")}
    </button>
  );
}

export function NeedleStickIncidentForm({
  employees,
  preferredEmployeeId,
  defaultIncidentAt,
  initial,
}: {
  employees: NeedleStickEmployeeOption[];
  preferredEmployeeId?: string;
  defaultIncidentAt: string;
  initial?: NeedleStickIncidentInitial;
}) {
  const t = useT();
  const router = useRouter();
  const edit = !!initial;
  const action = edit
    ? updateNeedleStickIncidentAction
    : createNeedleStickIncidentAction;
  const [state, formAction] = useActionState<NeedleStickActionState, FormData>(
    action,
    {},
  );
  const startingEmployeeId =
    initial?.employeeId ||
    (preferredEmployeeId &&
    employees.some((item) => item.id === preferredEmployeeId)
      ? preferredEmployeeId
      : "");
  const [employeeId, setEmployeeId] = useState(startingEmployeeId);
  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === employeeId),
    [employees, employeeId],
  );
  const [department, setDepartment] = useState(
    initial?.department || selectedEmployee?.department || "",
  );
  const [nature, setNature] = useState(initial?.nature || "NEEDLE_STICK");
  const [history, setHistory] = useState(
    initial?.sourceBloodBorneHistory || "UNKNOWN",
  );

  useEffect(() => {
    if (state.ok && state.id) router.replace(`/needle-stick/${state.id}`);
  }, [router, state.id, state.ok]);

  return (
    <form action={formAction} className="space-y-4">
      {initial && (
        <>
          <input type="hidden" name="id" value={initial.id} />
          <input type="hidden" name="revision" value={initial.revision} />
        </>
      )}
      <input type="hidden" name="employeeId" value={employeeId} />

      <Section
        title={t("needle.staffSection")}
        description={t("needle.staffSectionHint")}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t("common.selectEmployee")} required>
            <select
              className="select"
              value={employeeId}
              disabled={edit}
              required
              onChange={(event) => {
                const id = event.target.value;
                const employee = employees.find((item) => item.id === id);
                setEmployeeId(id);
                setDepartment(employee?.department || "");
              }}
            >
              <option value="">—</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name} — {employee.nationalId}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("emp.department")}>
            <input
              className="input"
              name="department"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
            />
          </Field>
          {selectedEmployee && (
            <div className="rounded-xl border px-3 py-2.5 text-sm md:col-span-2">
              <strong>{selectedEmployee.name}</strong>
              <span className="num mx-2" dir="ltr">
                {selectedEmployee.nationalId}
              </span>
              {selectedEmployee.employeeNo && (
                <span className="num" dir="ltr">
                  · {selectedEmployee.employeeNo}
                </span>
              )}
            </div>
          )}
          <Field label={t("needle.nature")} required>
            <select
              className="select"
              name="nature"
              value={nature}
              onChange={(event) =>
                setNature(
                  event.target.value as
                    | "NEEDLE_STICK"
                    | "CUT"
                    | "SPLASH"
                    | "OTHER",
                )
              }
            >
              {(["NEEDLE_STICK", "CUT", "SPLASH", "OTHER"] as const).map(
                (value) => (
                  <option key={value} value={value}>
                    {t(`needle.nature.${value}`)}
                  </option>
                ),
              )}
            </select>
          </Field>
          <Field label={t("needle.incidentAt")} required>
            <input
              className="input num"
              type="datetime-local"
              name="incidentAt"
              defaultValue={initial?.incidentAt || defaultIncidentAt}
              required
            />
          </Field>
          {nature === "OTHER" && (
            <div className="md:col-span-2">
              <Field label={t("needle.otherNature")} required>
                <input
                  className="input"
                  name="otherNature"
                  defaultValue={initial?.otherNature}
                  required
                />
              </Field>
            </div>
          )}
          <div className="md:col-span-2">
            <Field
              label={t("needle.staffSignature")}
              hint={t("needle.typedSignatureHint")}
            >
              <input
                className="input"
                name="staffSignature"
                defaultValue={initial?.staffSignature}
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section title={t("needle.sourceSection")}>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label={t("needle.sourceName")}>
            <input
              className="input"
              name="sourcePatientName"
              defaultValue={initial?.sourcePatientName}
            />
          </Field>
          <Field label={t("needle.sourceFileNo")}>
            <input
              className="input num"
              name="sourcePatientFileNo"
              dir="ltr"
              defaultValue={initial?.sourcePatientFileNo}
            />
          </Field>
          <Field label={t("needle.sourceWard")}>
            <input
              className="input"
              name="sourceWard"
              defaultValue={initial?.sourceWard}
            />
          </Field>
          <Field label={t("needle.bloodBorneHistory")}>
            <select
              className="select"
              name="sourceBloodBorneHistory"
              value={history}
              onChange={(event) =>
                setHistory(event.target.value as typeof history)
              }
            >
              <option value="UNKNOWN">{t("needle.history.UNKNOWN")}</option>
              <option value="NO">{t("common.no")}</option>
              <option value="YES">{t("common.yes")}</option>
            </select>
          </Field>
          <div className="md:col-span-2">
            <Field label={t("needle.bloodBorneDetails")}>
              <input
                className="input"
                name="sourceBloodBorneDetails"
                defaultValue={initial?.sourceBloodBorneDetails}
                disabled={history === "NO"}
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section
        title={t("needle.actionsSection")}
        description={t("needle.actionsHint")}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Checkbox
            name="actionWashing"
            label={t("needle.action.washing")}
            checked={initial?.actionWashing}
          />
          <Checkbox
            name="actionIrrigation"
            label={t("needle.action.irrigation")}
            checked={initial?.actionIrrigation}
          />
          <Checkbox
            name="actionEmployeeClinic"
            label={t("needle.action.employeeClinic")}
            checked={initial?.actionEmployeeClinic}
          />
          <Checkbox
            name="actionImmunoglobulin"
            label={t("needle.action.immunoglobulin")}
            checked={initial?.actionImmunoglobulin}
          />
        </div>
      </Section>

      <Section title={t("needle.departmentHeadSection")}>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label={t("needle.departmentHeadName")}>
            <input
              className="input"
              name="headOfDepartmentName"
              defaultValue={initial?.headOfDepartmentName}
            />
          </Field>
          <Field
            label={t("needle.departmentHeadSignature")}
            hint={t("needle.typedSignatureHint")}
          >
            <input
              className="input"
              name="headOfDepartmentSignature"
              defaultValue={initial?.headOfDepartmentSignature}
            />
          </Field>
          <Field label={t("needle.signedAt")}>
            <input
              className="input num"
              type="datetime-local"
              name="headOfDepartmentSignedAt"
              defaultValue={initial?.headOfDepartmentSignedAt}
            />
          </Field>
        </div>
      </Section>

      <Section
        title={t("needle.clinicSection")}
        description={t("needle.clinicSectionHint")}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t("needle.reportReceivedAt")}>
            <input
              className="input num"
              type="datetime-local"
              name="reportReceivedAt"
              defaultValue={initial?.reportReceivedAt}
            />
          </Field>
          <div />
          <div className="md:col-span-2">
            <h3
              className="mb-2 text-xs font-bold"
              style={{ color: "var(--text-muted)" }}
            >
              {t("needle.patientResults")}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(["Hiv", "Hbv", "Hcv", "Other"] as const).map((test) => (
                <Field
                  key={test}
                  label={t(`needle.result.${test.toUpperCase()}`)}
                >
                  <input
                    className="input"
                    name={`patient${test}Result`}
                    defaultValue={initial?.[`patient${test}Result`]}
                  />
                </Field>
              ))}
            </div>
          </div>
          <div className="md:col-span-2">
            <h3
              className="mb-2 text-xs font-bold"
              style={{ color: "var(--text-muted)" }}
            >
              {t("needle.staffResults")}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(["Hiv", "Hbv", "Hcv", "Other"] as const).map((test) => (
                <Field
                  key={test}
                  label={t(`needle.result.${test.toUpperCase()}`)}
                >
                  <input
                    className="input"
                    name={`staff${test}Result`}
                    defaultValue={initial?.[`staff${test}Result`]}
                  />
                </Field>
              ))}
            </div>
          </div>
          <div className="md:col-span-2">
            <Field label={t("needle.recommendation")}>
              <textarea
                className="textarea"
                name="recommendation"
                rows={4}
                defaultValue={initial?.recommendation}
              />
            </Field>
          </div>
          <Field label={t("needle.physicianName")}>
            <input
              className="input"
              name="physicianName"
              defaultValue={initial?.physicianName}
            />
          </Field>
          <Field
            label={t("needle.physicianSignature")}
            hint={t("needle.typedSignatureHint")}
          >
            <input
              className="input"
              name="physicianSignature"
              defaultValue={initial?.physicianSignature}
            />
          </Field>
          <Field label={t("needle.physicianSignedAt")}>
            <input
              className="input num"
              type="datetime-local"
              name="physicianSignedAt"
              defaultValue={initial?.physicianSignedAt}
            />
          </Field>
        </div>
      </Section>

      <Section
        title={t("needle.recordSection")}
        description={t("needle.recordSectionHint")}
      >
        <Checkbox
          name="complete"
          label={t("needle.markComplete")}
          checked={!!initial?.completedAt}
        />
        {initial?.completedAt && (
          <div className="mt-3">
            <Field label={t("needle.amendReason")} required>
              <textarea
                className="textarea"
                name="amendReason"
                rows={2}
                required
              />
            </Field>
          </div>
        )}
      </Section>

      <FormError error={state.error} />
      <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-2xl border bg-[var(--surface-glass-strong)] px-4 py-3 shadow-lg backdrop-blur-xl">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {t("needle.saveHint")}
        </p>
        <SaveButton edit={edit} />
      </div>
    </form>
  );
}

export function VoidNeedleStickIncidentForm({
  incidentId,
}: {
  incidentId: string;
}) {
  const t = useT();
  const router = useRouter();
  const [state, formAction] = useActionState<NeedleStickActionState, FormData>(
    voidNeedleStickIncidentAction,
    {},
  );
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);
  return (
    <form action={formAction}>
      <CloseOnSuccess ok={state.ok} />
      <input type="hidden" name="id" value={incidentId} />
      <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
        {t("needle.voidHint")}
      </p>
      <Field label={t("common.reason")} required>
        <textarea className="textarea" name="reason" rows={3} required />
      </Field>
      <FormError error={state.error} />
      <SubmitRow submitLabel={t("action.void")} danger />
    </form>
  );
}
