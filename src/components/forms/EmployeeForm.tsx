"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { Card, Field, SectionTitle } from "@/components/ui";
import { createEmployeeAction, updateEmployeeAction, type ActionState } from "@/server/actions/employees";
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
};

function Submit() {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? t("action.saving") : t("action.save")}
    </button>
  );
}

export function EmployeeForm({
  values = {},
  departments = [],
  jobTitles = [],
}: {
  values?: EmployeeFormValues;
  departments?: string[];
  jobTitles?: string[];
}) {
  const t = useT();
  const isEdit = Boolean(values.id);
  const [state, formAction] = useActionState<ActionState, FormData>(
    isEdit ? updateEmployeeAction : createEmployeeAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      {isEdit && <input type="hidden" name="id" value={values.id} />}

      <Card>
        <SectionTitle>{t("emp.title")}</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("emp.nationalId")} hint={t("emp.invalidId")} required>
            <input
              className="input num"
              name="nationalId"
              dir="ltr"
              inputMode="numeric"
              maxLength={20}
              defaultValue={values.nationalId ?? ""}
              required
            />
          </Field>
          <Field label={t("emp.name")} required>
            <input className="input" name="name" defaultValue={values.name ?? ""} required />
          </Field>
          <Field label={t("emp.nameEn")}>
            <input className="input" name="nameEn" dir="ltr" defaultValue={values.nameEn ?? ""} />
          </Field>
          <Field label={t("emp.dob")}>
            <input className="input" type="date" name="dob" defaultValue={toDateInput(values.dob)} />
          </Field>
          <Field label={t("emp.gender")}>
            <select className="select" name="gender" defaultValue={values.gender ?? ""}>
              <option value="">—</option>
              <option value="MALE">{t("gender.MALE")}</option>
              <option value="FEMALE">{t("gender.FEMALE")}</option>
            </select>
          </Field>
          <Field label={t("emp.phone")}>
            <input className="input num" name="phone" dir="ltr" defaultValue={values.phone ?? ""} />
          </Field>
          <Field label={t("emp.email")}>
            <input className="input" name="email" type="email" dir="ltr" defaultValue={values.email ?? ""} />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionTitle>{t("emp.employmentStatus")}</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("emp.employeeNo")}>
            <input className="input num" name="employeeNo" dir="ltr" defaultValue={values.employeeNo ?? ""} />
          </Field>
          <Field label={t("emp.department")}>
            <input className="input" name="department" list="departments" defaultValue={values.department ?? ""} />
            <datalist id="departments">
              {departments.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </Field>
          <Field label={t("emp.jobTitle")}>
            <input className="input" name="jobTitle" list="jobtitles" defaultValue={values.jobTitle ?? ""} />
            <datalist id="jobtitles">
              {jobTitles.map((j) => (
                <option key={j} value={j} />
              ))}
            </datalist>
          </Field>
          <Field label={t("emp.hireDate")}>
            <input className="input" type="date" name="hireDate" defaultValue={toDateInput(values.hireDate)} />
          </Field>
          <Field label={t("emp.employmentStatus")}>
            <select className="select" name="employmentStatus" defaultValue={values.employmentStatus ?? "ACTIVE"}>
              {["ACTIVE", "ON_LEAVE", "SUSPENDED", "TERMINATED"].map((v) => (
                <option key={v} value={v}>
                  {t(`empst.${v}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <Card>
        <SectionTitle>{t("emp.summary")}</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("emp.bloodType")}>
            <select className="select" name="bloodType" defaultValue={values.bloodType ?? ""}>
              <option value="">—</option>
              {BLOOD_TYPES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("emp.chronic")} hint="افصل بفاصلة">
            <input className="input" name="chronicConditions" defaultValue={(values.chronicConditions ?? []).join("، ")} />
          </Field>
          <Field label={t("emp.medications")} hint="افصل بفاصلة">
            <input
              className="input"
              name="currentMedications"
              defaultValue={(values.currentMedications ?? []).join("، ")}
            />
          </Field>
        </div>
      </Card>

      {state.error && (
        <p
          className="rounded-lg px-3 py-2 text-xs font-semibold"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
          role="alert"
        >
          {t(state.error)}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Link href={isEdit ? `/employees/${values.id}` : "/employees"} className="btn btn-ghost">
          {t("action.cancel")}
        </Link>
        <Submit />
      </div>
    </form>
  );
}
