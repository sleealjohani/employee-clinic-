"use client";
import { useActionState, useState, type ChangeEvent } from "react";
import type { Visit } from "@prisma/client";
import { useT } from "@/lib/i18n/client";
import { Field } from "@/components/ui";
import { CloseOnSuccess } from "@/components/ui/Modal";
import { SubmitButton } from "@/components/ui/ActionForm";
import {
  createVisitAction,
  saveVisitAction,
  createLabAction,
} from "@/server/actions/clinical";
import { TESTS, TEST_BY_CODE } from "@/lib/catalog/tests";
import { clinicDay } from "@/lib/clinic-config";
import { bmi } from "@/lib/format";
export type SmartPickerEmployee = {
  id: string;
  name: string;
  nationalId: string;
  gender: "MALE" | "FEMALE" | null;
};
const VISIT_TYPES = [
  "ACUTE_CARE",
  "FOLLOW_UP",
  "PRE_EMPLOYMENT",
  "PERIODIC",
  "INJURY",
  "EXPOSURE",
  "VACCINATION",
  "CONSULTATION",
  "OTHER",
];
const VITALS = [
  ["tempC", "temp", "°C", 20, 50, "0.1"],
  ["systolic", "systolic", "mmHg", 0, 350, "1"],
  ["diastolic", "diastolic", "mmHg", 0, 250, "1"],
  ["pulse", "pulse", "bpm", 0, 300, "1"],
  ["respRate", "rr", "/min", 0, 100, "1"],
  ["spo2", "spo2", "%", 0, 100, "1"],
  ["weightKg", "weight", "kg", 1, 800, "0.1"],
  ["heightCm", "height", "cm", 20, 300, "0.1"],
] as const;
function Feedback({ state }: { state: { error?: string; ok?: boolean } }) {
  const t = useT();
  return (
    <div aria-live="polite">
      {state.error && (
        <p className="form-error" role="alert">
          {t(state.error)}
        </p>
      )}
      {state.ok && <p className="form-success">{t("v2.saved")}</p>}
    </div>
  );
}
function EmployeeSelect({
  employees,
  value,
  onChange,
}: {
  employees: SmartPickerEmployee[];
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
}) {
  const t = useT();
  return (
    <Field label={t("common.selectEmployee")} required>
      <select
        className="select"
        name="employeeId"
        value={value}
        onChange={onChange}
        required
      >
        <option value="">—</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name} — {e.nationalId}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function SmartVisitForm({
  employeeId,
  employees,
  visit,
}: {
  employeeId?: string;
  employees?: SmartPickerEmployee[];
  visit?: Visit;
}) {
  const t = useT(),
    edit = Boolean(visit);
  const [state, action] = useActionState(
    edit ? saveVisitAction : createVisitAction,
    {},
  );
  const [data, setData] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(
      Object.entries(visit || {}).map(([k, v]) => [
        k,
        v === null ? "" : String(v),
      ]),
    ),
    employeeId: employeeId || visit?.employeeId || "",
    type: visit?.type || "ACUTE_CARE",
    visitDate: new Date(
      (visit?.visitDate ? new Date(visit.visitDate).getTime() : Date.now()) +
        3 * 3600000,
    )
      .toISOString()
      .slice(0, 16),
  }));
  const [complete, setComplete] = useState(false);
  function change(
    event: ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) {
    const { name, value } = event.target;
    setData((p) => ({ ...p, [name]: value }));
  }
  return (
    <form action={action} className="stack">
      {!edit && <CloseOnSuccess ok={state.ok} />}
      {visit && (
        <>
          <input type="hidden" name="id" value={visit.id} />
          <input type="hidden" name="revision" value={visit.revision} />
        </>
      )}
      {employees ? (
        <EmployeeSelect
          employees={employees}
          value={data.employeeId}
          onChange={change}
        />
      ) : (
        <input type="hidden" name="employeeId" value={data.employeeId} />
      )}
      <div className="form-grid">
        <Field label={t("visit.date")} required>
          <input
            className="input"
            type="datetime-local"
            name="visitDate"
            value={data.visitDate}
            onChange={change}
            required
          />
        </Field>
        <Field label={t("visit.type")}>
          <select
            className="select"
            name="type"
            value={data.type}
            onChange={change}
          >
            {VISIT_TYPES.map((v) => (
              <option key={v} value={v}>
                {t("visitType." + v)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={t("visit.chief")} required={complete}>
        <textarea
          className="textarea"
          name="chiefComplaint"
          value={data.chiefComplaint || ""}
          onChange={change}
          maxLength={4000}
          required={complete}
        />
      </Field>
      <fieldset className="card card-pad">
        <legend className="section-heading">{t("visit.vitals")}</legend>
        <div className="form-grid">
          {VITALS.map(([name, label, unit, min, max, step]) => (
            <Field key={name} label={t("visit." + label) + " (" + unit + ")"}>
              <input
                className="input num"
                dir="ltr"
                type="number"
                name={name}
                value={data[name] || ""}
                onChange={change}
                min={min}
                max={max}
                step={step}
              />
            </Field>
          ))}
        </div>
        <p className="muted">
          {t("visit.bmi")}:{" "}
          <b dir="ltr">
            {bmi(Number(data.weightKg), Number(data.heightCm)) ?? "—"}
          </b>
        </p>
      </fieldset>
      {["diagnosis", "plan", "notes"].map((name) => (
        <Field
          key={name}
          label={t(name === "notes" ? "common.notes" : "visit." + name)}
          required={name === "plan" && complete}
        >
          <textarea
            className="textarea"
            name={name}
            value={data[name] || ""}
            onChange={change}
            rows={3}
            maxLength={name === "notes" ? 8000 : 4000}
            required={name === "plan" && complete}
          />
        </Field>
      ))}
      {edit && !visit?.completedAt && (
        <label className="check-line">
          <input
            type="checkbox"
            name="complete"
            checked={complete}
            onChange={(e) => setComplete(e.target.checked)}
          />
          {t("v2.completeVisit")}
        </label>
      )}
      {visit?.completedAt && (
        <Field label={t("v2.amendReason")} required>
          <input
            className="input"
            name="amendReason"
            value={data.amendReason || ""}
            onChange={change}
            required
            minLength={3}
            maxLength={1000}
          />
        </Field>
      )}
      <Feedback state={state} />
      <SubmitButton
        label={complete ? t("v2.completeVisit") : t("action.save")}
      />
    </form>
  );
}
export function SmartLabForm({
  employeeId,
  employees,
  visitId,
}: {
  employeeId?: string;
  sex?: "MALE" | "FEMALE" | null;
  employees?: SmartPickerEmployee[];
  visitId?: string;
}) {
  const t = useT();
  const [state, action] = useActionState(createLabAction, {});
  const [data, setData] = useState<Record<string, string>>({
    employeeId: employeeId || "",
    testCode: "",
    resultType: "QUANTITATIVE",
    comparator: "EQ",
    collectedAt: clinicDay(),
  });
  function change(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setData((p) =>
      name === "testCode"
        ? {
            ...p,
            testCode: value,
            resultType: TEST_BY_CODE[value]?.resultType || "QUANTITATIVE",
            unit: TEST_BY_CODE[value]?.unit || "",
            refLow: "",
            refHigh: "",
            valueNum: "",
            valueText: "",
            comparator: "EQ",
          }
        : { ...p, [name]: value },
    );
  }
  const numeric = data.resultType === "QUANTITATIVE";
  return (
    <form action={action} className="stack">
      <CloseOnSuccess ok={state.ok} />
      {visitId && <input type="hidden" name="visitId" value={visitId} />}
      {employees ? (
        <EmployeeSelect
          employees={employees}
          value={data.employeeId}
          onChange={change}
        />
      ) : (
        <input type="hidden" name="employeeId" value={data.employeeId} />
      )}
      <Field label={t("lab.test")} required>
        <select
          className="select"
          name="testCode"
          value={data.testCode}
          onChange={change}
          required
        >
          <option value="">{t("lab.selectTest")}</option>
          {TESTS.map((v) => (
            <option key={v.code} value={v.code}>
              {t.locale === "ar" ? v.nameAr : v.nameEn}
            </option>
          ))}
        </select>
      </Field>
      <div className="form-grid">
        <Field label={t("v2.resultType")}>
          <select
            className="select"
            name="resultType"
            value={data.resultType}
            onChange={change}
          >
            <option value="QUANTITATIVE">{t("lab.quantitative")}</option>
            <option value="QUALITATIVE">{t("lab.qualitative")}</option>
          </select>
        </Field>
        {numeric ? (
          <>
            <Field label={t("v2.comparator")}>
              <select
                className="select num"
                name="comparator"
                value={data.comparator}
                onChange={change}
                dir="ltr"
              >
                {Object.entries({
                  EQ: "=",
                  LT: "<",
                  LE: "≤",
                  GT: ">",
                  GE: "≥",
                }).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("lab.value")} required>
              <input
                className="input num"
                dir="ltr"
                name="valueNum"
                type="number"
                step="any"
                value={data.valueNum || ""}
                onChange={change}
                required
              />
            </Field>
            <Field label={t("lab.unit")} hint={t("v2.printedUnit")}>
              <input
                className="input"
                dir="ltr"
                name="unit"
                value={data.unit || ""}
                onChange={change}
                maxLength={80}
              />
            </Field>
            {["refLow", "refHigh"].map((name) => (
              <Field key={name} label={t("v2." + name)}>
                <input
                  className="input num"
                  dir="ltr"
                  type="number"
                  step="any"
                  name={name}
                  value={data[name] || ""}
                  onChange={change}
                />
              </Field>
            ))}
          </>
        ) : (
          <Field label={t("lab.value")} required>
            <input
              className="input"
              name="valueText"
              value={data.valueText || ""}
              onChange={change}
              required
              maxLength={200}
            />
          </Field>
        )}
        {[
          "collectedAt",
          "verifiedAt",
          "refText",
          "orderNo",
          "sampleNo",
          "performedBy",
          "verifiedBy",
          "labName",
        ].map((name) => (
          <Field key={name} label={t("lab." + name)}>
            <input
              className="input"
              name={name}
              type={name.endsWith("At") ? "date" : "text"}
              max={name.endsWith("At") ? clinicDay() : undefined}
              value={data[name] || ""}
              onChange={change}
              maxLength={200}
            />
          </Field>
        ))}
      </div>
      <p className="muted">{t("v2.reviewBeforeReleaseHint")}</p>
      <Feedback state={state} />
      <SubmitButton />
    </form>
  );
}
