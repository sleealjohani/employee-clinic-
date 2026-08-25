"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { Field } from "@/components/ui";
import { createEmployeeAction, updateEmployeeAction, type ActionState } from "@/server/actions/employees";
import { BLOOD_TYPES } from "@/lib/catalog/vaccines";
import { toDateInput } from "@/lib/format";
import styles from "./SmartForm.module.css";

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

type Step = 0 | 1 | 2;

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
  const ar = t.locale === "ar";
  const isEdit = Boolean(values.id);
  const [step, setStep] = useState<Step>(0);
  const [dirty, setDirty] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(
    isEdit ? updateEmployeeAction : createEmployeeAction,
    {},
  );

  const steps = useMemo(
    () => [
      {
        title: ar ? "الهوية والتواصل" : "Identity & contact",
        hint: ar ? "البيانات الأساسية" : "Core profile",
      },
      {
        title: ar ? "العمل والتكليف" : "Employment",
        hint: ar ? "القسم والمسمى والحالة" : "Department, title & status",
      },
      {
        title: ar ? "الملخص الصحي" : "Health summary",
        hint: ar ? "بيانات صحية مختصرة" : "Compact health profile",
      },
    ],
    [ar],
  );

  const progress = ((step + 1) / steps.length) * 100;
  const cancelHref = isEdit ? `/employees/${values.id}` : "/employees";

  return (
    <form action={formAction} onChange={() => setDirty(true)}>
      {isEdit && <input type="hidden" name="id" value={values.id} />}

      <div className={styles.shell}>
        <div className={styles.header}>
          <div>
            <span className={styles.eyebrow}>SMART EMPLOYEE FORM</span>
            <h2>{isEdit ? (ar ? "تحديث ملف الموظف" : "Update employee record") : (ar ? "إنشاء ملف موظف" : "Create employee record")}</h2>
            <p>
              {ar
                ? "نموذج مقسّم إلى مراحل واضحة حتى تبقى البيانات الإدارية والصحية مرتبة وسهلة المراجعة قبل الحفظ."
                : "A focused multi-step form that keeps administrative and health data easy to review before saving."}
            </p>
          </div>
          <span className={styles.dirty} data-dirty={dirty}>
            {dirty ? (ar ? "تغييرات غير محفوظة" : "Unsaved changes") : (ar ? "جاهز للتعبئة" : "Ready")}
          </span>
        </div>

        <div className={styles.stepper}>
          {steps.map((item, index) => (
            <button
              key={item.title}
              type="button"
              className={styles.step}
              data-active={step === index}
              onClick={() => setStep(index as Step)}
            >
              <span className={styles.stepIndex}>{index + 1}</span>
              <span className={styles.stepText}>
                <b>{item.title}</b>
                <small>{item.hint}</small>
              </span>
            </button>
          ))}
        </div>

        {state.error && (
          <p className={styles.error} role="alert">
            {t(state.error)}
          </p>
        )}

        <div className={styles.body}>
          {step === 0 && (
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <h3>{ar ? "الهوية والتواصل" : "Identity and contact"}</h3>
                  <p>{ar ? "ابدأ بالمعلومات التي تعرّف الموظف وتسمح بالتواصل معه." : "Start with the employee's identifying and contact information."}</p>
                </div>
              </div>

              <div className={styles.fields}>
                <div className={styles.field4}>
                  <Field label={t("emp.nationalId")} hint={t("emp.invalidId")} required>
                    <input className="input num" name="nationalId" dir="ltr" inputMode="numeric" maxLength={20} defaultValue={values.nationalId ?? ""} required />
                  </Field>
                </div>
                <div className={styles.field4}>
                  <Field label={t("emp.name")} required>
                    <input className="input" name="name" defaultValue={values.name ?? ""} required />
                  </Field>
                </div>
                <div className={styles.field4}>
                  <Field label={t("emp.nameEn")}>
                    <input className="input" name="nameEn" dir="ltr" defaultValue={values.nameEn ?? ""} />
                  </Field>
                </div>
                <div className={styles.field4}>
                  <Field label={t("emp.dob")}>
                    <input className="input" type="date" name="dob" defaultValue={toDateInput(values.dob)} />
                  </Field>
                </div>
                <div className={styles.field4}>
                  <Field label={t("emp.gender")}>
                    <select className="select" name="gender" defaultValue={values.gender ?? ""}>
                      <option value="">—</option>
                      <option value="MALE">{t("gender.MALE")}</option>
                      <option value="FEMALE">{t("gender.FEMALE")}</option>
                    </select>
                  </Field>
                </div>
                <div className={styles.field4}>
                  <Field label={t("emp.phone")}>
                    <input className="input num" name="phone" dir="ltr" inputMode="tel" defaultValue={values.phone ?? ""} />
                  </Field>
                </div>
                <div className={styles.field6}>
                  <Field label={t("emp.email")}>
                    <input className="input" name="email" type="email" dir="ltr" defaultValue={values.email ?? ""} />
                  </Field>
                </div>
              </div>
            </section>
          )}

          {step === 1 && (
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <h3>{ar ? "بيانات العمل" : "Employment profile"}</h3>
                  <p>{ar ? "اربط الملف بموقع الموظف الوظيفي الحالي وحالته." : "Connect the record to the employee's current organizational context."}</p>
                </div>
              </div>

              <div className={styles.fields}>
                <div className={styles.field4}>
                  <Field label={t("emp.employeeNo")}>
                    <input className="input num" name="employeeNo" dir="ltr" defaultValue={values.employeeNo ?? ""} />
                  </Field>
                </div>
                <div className={styles.field4}>
                  <Field label={t("emp.department")}>
                    <input className="input" name="department" list="departments" defaultValue={values.department ?? ""} />
                    <datalist id="departments">
                      {departments.map((department) => <option key={department} value={department} />)}
                    </datalist>
                  </Field>
                </div>
                <div className={styles.field4}>
                  <Field label={t("emp.jobTitle")}>
                    <input className="input" name="jobTitle" list="jobtitles" defaultValue={values.jobTitle ?? ""} />
                    <datalist id="jobtitles">
                      {jobTitles.map((jobTitle) => <option key={jobTitle} value={jobTitle} />)}
                    </datalist>
                  </Field>
                </div>
                <div className={styles.field6}>
                  <Field label={t("emp.hireDate")}>
                    <input className="input" type="date" name="hireDate" defaultValue={toDateInput(values.hireDate)} />
                  </Field>
                </div>
                <div className={styles.field6}>
                  <Field label={t("emp.employmentStatus")}>
                    <select className="select" name="employmentStatus" defaultValue={values.employmentStatus ?? "ACTIVE"}>
                      {["ACTIVE", "ON_LEAVE", "SUSPENDED", "TERMINATED"].map((value) => (
                        <option key={value} value={value}>{t(`empst.${value}`)}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <h3>{ar ? "الملخص الصحي" : "Health summary"}</h3>
                  <p>{ar ? "معلومات مختصرة تظهر لاحقًا في Clinical Snapshot داخل ملف 360°." : "Compact details surfaced later in the 360° Clinical Snapshot."}</p>
                </div>
              </div>

              <div className={styles.fields}>
                <div className={styles.field4}>
                  <Field label={t("emp.bloodType")}>
                    <select className="select" name="bloodType" defaultValue={values.bloodType ?? ""}>
                      <option value="">—</option>
                      {BLOOD_TYPES.map((bloodType) => <option key={bloodType} value={bloodType}>{bloodType}</option>)}
                    </select>
                  </Field>
                </div>
                <div className={styles.field4}>
                  <Field label={t("emp.chronic")} hint={ar ? "افصل بين العناصر بفاصلة" : "Separate items with commas"}>
                    <input className="input" name="chronicConditions" defaultValue={(values.chronicConditions ?? []).join("، ")} />
                  </Field>
                </div>
                <div className={styles.field4}>
                  <Field label={t("emp.medications")} hint={ar ? "افصل بين العناصر بفاصلة" : "Separate items with commas"}>
                    <input className="input" name="currentMedications" defaultValue={(values.currentMedications ?? []).join("، ")} />
                  </Field>
                </div>
              </div>
            </section>
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.progress}>
            <div className={styles.progressTop}>
              <span>{ar ? "تقدم النموذج" : "Form progress"}</span>
              <span className="num">{step + 1}/{steps.length}</span>
            </div>
            <div className={styles.track}><span style={{ width: `${progress}%` }} /></div>
          </div>

          <div className={styles.actions}>
            {step === 0 ? (
              <Link href={cancelHref} className="btn btn-ghost">{t("action.cancel")}</Link>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => setStep((step - 1) as Step)}>
                {ar ? "السابق" : "Back"}
              </button>
            )}

            {step < 2 ? (
              <button type="button" className="btn btn-primary" onClick={() => setStep((step + 1) as Step)}>
                {ar ? "التالي" : "Next"}
              </button>
            ) : (
              <Submit />
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
