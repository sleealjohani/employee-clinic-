"use client";
import { useActionState, useEffect, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { Field } from "@/components/ui";
import { SubmitButton } from "@/components/ui/ActionForm";
import {
  createEmployeeAction,
  updateEmployeeAction,
} from "@/server/actions/employees";
import { BLOOD_TYPES } from "@/lib/catalog/vaccines";
import { toDateInput } from "@/lib/format";

export type EmployeeFormValues = {
  id?: string;
  nationalId?: string;
  name?: string;
  nameEn?: string | null;
  dob?: Date | string | null;
  gender?: string | null;
  phone?: string | null;
  email?: string | null;
  employeeNo?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  employmentStatus?: string;
  hireDate?: Date | string | null;
  bloodType?: string | null;
  chronicConditions?: string[];
  currentMedications?: string[];
  nationality?: string | null;
  qualification?: string | null;
  employmentType?: string | null;
  assignedFacility?: string | null;
  workLocation?: string | null;
  personnelNotes?: string | null;
  updatedAt?: Date | string;
};
export function EmployeeForm({
  values = {},
  departments = [],
  jobTitles = [],
}: {
  values?: EmployeeFormValues;
  departments?: string[];
  jobTitles?: string[];
}) {
  const t = useT(),
    edit = Boolean(values.id);
  const [data, setData] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(
      Object.entries(values).map(([k, v]) => [
        k,
        typeof v === "string" ? v : "",
      ]),
    ),
    dob: toDateInput(values.dob),
    hireDate: toDateInput(values.hireDate),
    employmentStatus: values.employmentStatus || "ACTIVE",
    chronicConditions: (values.chronicConditions || []).join("، "),
    currentMedications: (values.currentMedications || []).join("، "),
  }));
  const [dirty, setDirty] = useState(false);
  const [state, action] = useActionState(
    edit ? updateEmployeeAction : createEmployeeAction,
    {},
  );
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function change(
    event: ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) {
    const { name, value } = event.target;
    setData((prev) => ({ ...prev, [name]: value }));
    setDirty(true);
  }
  function input(name: string, type = "text", required = false, list?: string) {
    return (
      <Field key={name} label={t("emp." + name)} required={required}>
        <input
          className="input"
          name={name}
          type={type}
          value={data[name] || ""}
          onChange={change}
          required={required}
          list={list}
          maxLength={name === "nationalId" ? 10 : 200}
          max={type === "date" ? toDateInput(new Date()) : undefined}
          dir={
            ["nationalId", "employeeNo", "phone", "email", "nameEn"].includes(
              name,
            )
              ? "ltr"
              : undefined
          }
          aria-invalid={Boolean(state.fieldErrors?.[name])}
        />
      </Field>
    );
  }
  return (
    <form action={action} className="stack">
      {edit && (
        <>
          <input type="hidden" name="id" value={values.id} />
          <input
            type="hidden"
            name="updatedAt"
            value={
              values.updatedAt ? new Date(values.updatedAt).toISOString() : ""
            }
          />
        </>
      )}
      <div className="card card-pad">
        <h2 className="section-heading">{t("v2.identityContact")}</h2>
        <div className="form-grid">
          {input("nationalId", "text", true)}
          {input("name", "text", true)}
          {input("nameEn")}
          {input("dob", "date")}
          <Field label={t("emp.gender")}>
            <select
              className="select"
              name="gender"
              value={data.gender || ""}
              onChange={change}
            >
              <option value="">—</option>
              {["MALE", "FEMALE"].map((v) => (
                <option key={v} value={v}>
                  {t("gender." + v)}
                </option>
              ))}
            </select>
          </Field>
          {input("phone", "tel")}
          {input("email", "email")}
          {input("nationality")}
        </div>
      </div>
      <div className="card card-pad">
        <h2 className="section-heading">{t("v2.employmentProfile")}</h2>
        <div className="form-grid">
          {input("employeeNo")}
          {input("department", "text", false, "departments")}
          {input("jobTitle", "text", false, "jobtitles")}
          {input("hireDate", "date")}
          <Field label={t("emp.employmentStatus")}>
            <select
              className="select"
              name="employmentStatus"
              value={data.employmentStatus}
              onChange={change}
            >
              {["ACTIVE", "ON_LEAVE", "SUSPENDED", "TERMINATED"].map((v) => (
                <option key={v} value={v}>
                  {t("empst." + v)}
                </option>
              ))}
            </select>
          </Field>
          {input("qualification")}
          {input("employmentType")}
          {input("assignedFacility")}
          {input("workLocation")}
          <Field label={t("emp.personnelNotes")}>
            <textarea
              className="textarea"
              name="personnelNotes"
              value={data.personnelNotes || ""}
              onChange={change}
              maxLength={2000}
            />
          </Field>
        </div>
        <datalist id="departments">
          {departments.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <datalist id="jobtitles">
          {jobTitles.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </div>
      <div className="card card-pad">
        <h2 className="section-heading">{t("v2.healthSummary")}</h2>
        <div className="form-grid">
          <Field label={t("emp.bloodType")}>
            <select
              className="select"
              name="bloodType"
              value={data.bloodType || ""}
              onChange={change}
            >
              <option value="">—</option>
              {BLOOD_TYPES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          {["chronicConditions", "currentMedications"].map((name, index) => (
            <Field
              key={name}
              label={t(index === 0 ? "emp.chronic" : "emp.medications")}
              hint={t("v2.commaSeparated")}
            >
              <textarea
                className="textarea"
                name={name}
                value={data[name] || ""}
                onChange={change}
                maxLength={4000}
              />
            </Field>
          ))}
        </div>
      </div>
      <div className="sticky-actions card card-pad">
        <div aria-live="polite">
          {state.error ? (
            <p role="alert" className="form-error">
              {t(state.error)}
            </p>
          ) : (
            <span className="muted">
              {dirty ? t("v2.unsaved") : t("v2.profilePrivacy")}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            className="btn btn-ghost"
            href={edit ? "/employees/" + values.id : "/employees"}
          >
            {t("action.cancel")}
          </Link>
          <SubmitButton />
        </div>
      </div>
    </form>
  );
}
