"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useT } from "@/lib/i18n/client";
import { Field } from "@/components/ui";
import { CloseOnSuccess, useModalClose } from "@/components/ui/Modal";
import { createLabAction, createVisitAction, type ActionState } from "@/server/actions/clinical";
import { CATEGORY_LABEL, TESTS, TEST_BY_CODE, refFor, type TestCategory } from "@/lib/catalog/tests";
import { toDateInput } from "@/lib/format";
import styles from "./SmartClinicalForm.module.css";

const today = () => toDateInput(new Date());

export type SmartPickerEmployee = {
  id: string;
  name: string;
  nationalId: string;
  gender: "MALE" | "FEMALE" | null;
};

type Step = 0 | 1 | 2;

function ActionSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? t("action.saving") : label}
    </button>
  );
}

function validateStage(form: HTMLFormElement | null, stage: Step) {
  if (!form) return true;
  const container = form.querySelector<HTMLElement>(`[data-smart-stage="${stage}"]`);
  if (!container) return true;
  const fields = Array.from(container.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea"));
  for (const field of fields) {
    if (!field.checkValidity()) {
      field.reportValidity();
      return false;
    }
  }
  return true;
}

function EmployeePicker({
  employees,
  value,
  onChange,
  label,
}: {
  employees: SmartPickerEmployee[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <Field label={label} required>
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

export function SmartVisitForm({
  employeeId,
  employees,
}: {
  employeeId?: string;
  employees?: SmartPickerEmployee[];
}) {
  const t = useT();
  const ar = t.locale === "ar";
  const close = useModalClose();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<ActionState, FormData>(createVisitAction, {});
  const [step, setStep] = useState<Step>(0);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState(employeeId ?? "");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");

  const calculatedBmi = useMemo(() => {
    const kg = Number(weight);
    const cm = Number(height);
    if (!kg || !cm) return null;
    return (kg / ((cm / 100) ** 2)).toFixed(1);
  }, [height, weight]);

  const steps = [
    { title: ar ? "الزيارة" : "Encounter", hint: ar ? "الموظف ونوع الزيارة" : "Employee & encounter" },
    { title: ar ? "المؤشرات الحيوية" : "Vitals", hint: ar ? "القياسات السريرية" : "Clinical measurements" },
    { title: ar ? "التقييم والخطة" : "Assessment", hint: ar ? "التشخيص والخطة" : "Diagnosis & plan" },
  ];

  const next = () => {
    if (!validateStage(formRef.current, step)) return;
    setStep(Math.min(2, step + 1) as Step);
  };

  const vitals: [string, string, string, string?][] = [
    ["tempC", t("visit.temp"), "°C", "0.1"],
    ["systolic", t("visit.systolic"), "mmHg"],
    ["diastolic", t("visit.diastolic"), "mmHg"],
    ["pulse", t("visit.pulse"), "bpm"],
    ["respRate", t("visit.rr"), "/min"],
    ["spo2", t("visit.spo2"), "%"],
  ];

  return (
    <form ref={formRef} action={formAction} className={styles.flow} onChange={() => setDirty(true)}>
      <CloseOnSuccess ok={state.ok} />
      {!employees && <input type="hidden" name="employeeId" value={employeeId} />}

      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>SMART VISIT FLOW</span>
          <h3>{ar ? "توثيق زيارة سريرية" : "Document clinical visit"}</h3>
          <p>{ar ? "ثلاث مراحل قصيرة تحافظ على سياق الزيارة وتفصل القياسات عن التقييم السريري." : "Three focused stages keep encounter context, measurements and clinical assessment clearly separated."}</p>
        </div>
        <span className={styles.status} data-dirty={dirty}>{dirty ? (ar ? "غير محفوظ" : "Unsaved") : (ar ? "جاهز" : "Ready")}</span>
      </div>

      <div className={styles.stepper}>
        {steps.map((item, index) => (
          <button
            key={item.title}
            type="button"
            className={styles.step}
            data-active={step === index}
            onClick={() => {
              const target = index as Step;
              if (target <= step || validateStage(formRef.current, step)) setStep(target);
            }}
          >
            <span className={styles.stepIndex}>{index + 1}</span>
            <span className={styles.stepText}><b>{item.title}</b><small>{item.hint}</small></span>
          </button>
        ))}
      </div>

      {state.error && <p className={styles.error} role="alert">{t(state.error)}</p>}

      <div className={styles.stage}>
        <section className={styles.panel} data-active={step === 0} data-smart-stage="0">
          <div className={styles.panelHead}>
            <div><h4>{ar ? "سياق الزيارة" : "Encounter context"}</h4><p>{ar ? "حدد الموظف ووقت ونوع الزيارة ثم دوّن سبب المراجعة." : "Choose the employee, date and encounter type, then capture the reason for review."}</p></div>
          </div>
          <div className={styles.grid2}>
            {employees && <EmployeePicker employees={employees} value={selected} onChange={setSelected} label={t("common.selectEmployee")} />}
            <Field label={t("visit.date")} required>
              <input className="input" type="date" name="visitDate" defaultValue={today()} required />
            </Field>
            <Field label={t("visit.type")} required>
              <select className="select" name="type" defaultValue="ACUTE_CARE" required>
                {["ACUTE_CARE", "FOLLOW_UP", "PRE_EMPLOYMENT", "PERIODIC", "INJURY", "EXPOSURE", "VACCINATION", "CONSULTATION", "OTHER"].map((value) => (
                  <option key={value} value={value}>{t(`visitType.${value}`)}</option>
                ))}
              </select>
            </Field>
            <div className={styles.full}>
              <Field label={t("visit.chief")}>
                <input className="input" name="chiefComplaint" placeholder={ar ? "سبب الزيارة أو الشكوى الرئيسية" : "Reason for visit or chief complaint"} />
              </Field>
            </div>
          </div>
        </section>

        <section className={styles.panel} data-active={step === 1} data-smart-stage="1">
          <div className={styles.panelHead}>
            <div><h4>{t("visit.vitals")}</h4><p>{ar ? "أدخل القياسات المتوفرة فقط؛ لا توجد حاجة لملء القيم غير المقاسة." : "Enter only measurements that were actually obtained."}</p></div>
            {calculatedBmi && <span className={styles.status}>BMI <b className="num">{calculatedBmi}</b></span>}
          </div>
          <div className={styles.grid4}>
            {vitals.map(([name, label, unit, increment]) => (
              <div key={name} className={styles.vitalCard}>
                <span className={styles.vitalUnit}>{unit}</span>
                <Field label={label}>
                  <input className="input num" name={name} type="number" step={increment ?? "1"} inputMode="decimal" />
                </Field>
              </div>
            ))}
            <div className={styles.vitalCard}>
              <span className={styles.vitalUnit}>kg</span>
              <Field label={t("visit.weight")}>
                <input className="input num" name="weightKg" type="number" step="0.1" inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} />
              </Field>
            </div>
            <div className={styles.vitalCard}>
              <span className={styles.vitalUnit}>cm</span>
              <Field label={t("visit.height")}>
                <input className="input num" name="heightCm" type="number" step="0.1" inputMode="decimal" value={height} onChange={(event) => setHeight(event.target.value)} />
              </Field>
            </div>
          </div>
        </section>

        <section className={styles.panel} data-active={step === 2} data-smart-stage="2">
          <div className={styles.panelHead}>
            <div><h4>{ar ? "التقييم السريري" : "Clinical assessment"}</h4><p>{ar ? "اختصر الاستنتاج السريري والخطة والمتابعة في مكان واحد." : "Capture the clinical conclusion, plan and follow-up notes together."}</p></div>
          </div>
          <div className={styles.grid2}>
            <div className={styles.full}><Field label={t("visit.diagnosis")}><input className="input" name="diagnosis" /></Field></div>
            <div className={styles.full}><Field label={t("visit.plan")}><textarea className="textarea" name="plan" rows={3} /></Field></div>
            <div className={styles.full}><Field label={t("common.notes")}><textarea className="textarea" name="notes" rows={3} /></Field></div>
          </div>
        </section>
      </div>

      <div className={styles.footer}>
        <div className={styles.progress}>
          <div className={styles.progressTop}><span>{ar ? "تقدم الزيارة" : "Visit progress"}</span><span className="num">{step + 1}/3</span></div>
          <div className={styles.track}><span style={{ width: `${((step + 1) / 3) * 100}%` }} /></div>
        </div>
        <div className={styles.actions}>
          {step === 0 ? (
            <button type="button" className="btn btn-ghost" onClick={close}>{t("action.cancel")}</button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setStep((step - 1) as Step)}>{ar ? "السابق" : "Back"}</button>
          )}
          {step < 2 ? <button type="button" className="btn btn-primary" onClick={next}>{ar ? "التالي" : "Next"}</button> : <ActionSubmit label={t("action.save")} />}
        </div>
      </div>
    </form>
  );
}

export function SmartLabForm({
  employeeId,
  sex,
  employees,
}: {
  employeeId?: string;
  sex?: "MALE" | "FEMALE" | null;
  employees?: SmartPickerEmployee[];
}) {
  const t = useT();
  const ar = t.locale === "ar";
  const close = useModalClose();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<ActionState, FormData>(createLabAction, {});
  const [step, setStep] = useState<Step>(0);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState(employeeId ?? "");
  const [code, setCode] = useState("");

  const def = code ? TEST_BY_CODE[code] : undefined;
  const effectiveSex = employees ? (employees.find((employee) => employee.id === selected)?.gender ?? null) : (sex ?? null);
  const range = useMemo(() => (def ? refFor(def, effectiveSex) : undefined), [def, effectiveSex]);
  const grouped = useMemo(() => {
    const map = new Map<TestCategory, typeof TESTS>();
    for (const test of TESTS) {
      const current = map.get(test.category) ?? [];
      current.push(test);
      map.set(test.category, current);
    }
    return [...map.entries()];
  }, []);

  const steps = [
    { title: ar ? "اختيار الفحص" : "Test", hint: ar ? "الموظف ونوع التحليل" : "Employee & test" },
    { title: ar ? "النتيجة والمرجع" : "Result", hint: ar ? "القيمة والمدى المرجعي" : "Value & reference" },
    { title: ar ? "العينة والتحقق" : "Provenance", hint: ar ? "المصدر والتوثيق" : "Source & verification" },
  ];

  const next = () => {
    if (!validateStage(formRef.current, step)) return;
    setStep(Math.min(2, step + 1) as Step);
  };

  return (
    <form ref={formRef} action={formAction} className={styles.flow} onChange={() => setDirty(true)}>
      <CloseOnSuccess ok={state.ok} />
      {!employees && <input type="hidden" name="employeeId" value={employeeId} />}
      <input type="hidden" name="resultType" value={def?.resultType ?? "QUANTITATIVE"} />

      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>SMART LAB FLOW</span>
          <h3>{ar ? "توثيق نتيجة مخبرية" : "Document laboratory result"}</h3>
          <p>{ar ? "اختر الفحص أولًا ليجهّز النظام نوع النتيجة والوحدة والمدى المرجعي تلقائيًا قبل التوثيق." : "Choose the test first so the result type, unit and reference interval can be prepared automatically."}</p>
        </div>
        <span className={styles.status} data-dirty={dirty}>{dirty ? (ar ? "غير محفوظ" : "Unsaved") : (ar ? "جاهز" : "Ready")}</span>
      </div>

      <div className={styles.stepper}>
        {steps.map((item, index) => (
          <button
            key={item.title}
            type="button"
            className={styles.step}
            data-active={step === index}
            onClick={() => {
              const target = index as Step;
              if (target <= step || validateStage(formRef.current, step)) setStep(target);
            }}
          >
            <span className={styles.stepIndex}>{index + 1}</span>
            <span className={styles.stepText}><b>{item.title}</b><small>{item.hint}</small></span>
          </button>
        ))}
      </div>

      {state.error && <p className={styles.error} role="alert">{t(state.error)}</p>}

      <div className={styles.stage}>
        <section className={styles.panel} data-active={step === 0} data-smart-stage="0">
          <div className={styles.panelHead}>
            <div><h4>{ar ? "الفحص والموظف" : "Test and employee"}</h4><p>{ar ? "اختيار الفحص يضبط حقول النتيجة والمدى المرجعي تلقائيًا." : "Selecting a test configures the result fields and reference interval automatically."}</p></div>
          </div>
          <div className={styles.grid2}>
            {employees && <EmployeePicker employees={employees} value={selected} onChange={setSelected} label={t("common.selectEmployee")} />}
            <Field label={t("lab.test")} hint={t("lab.autoRef")} required>
              <select className="select" name="testCode" value={code} onChange={(event) => setCode(event.target.value)} required>
                <option value="">{t("lab.selectTest")}</option>
                {grouped.map(([category, tests]) => (
                  <optgroup key={category} label={CATEGORY_LABEL[category][t.locale]}>
                    {tests.map((test) => <option key={test.code} value={test.code}>{ar ? test.nameAr : test.nameEn}</option>)}
                  </optgroup>
                ))}
              </select>
            </Field>
          </div>
          {def && (
            <div className={styles.summary}>
              <div><span>{ar ? "نوع النتيجة" : "Result type"}</span><strong>{def.resultType === "QUANTITATIVE" ? (ar ? "رقمية" : "Quantitative") : (ar ? "وصفية" : "Qualitative")}</strong></div>
              <div><span>{t("lab.unit")}</span><strong dir="ltr">{def.unit ?? "—"}</strong></div>
              <div><span>{t("lab.reference")}</span><strong className="num" dir="ltr">{range?.low != null || range?.high != null ? `${range?.low ?? "—"} – ${range?.high ?? "—"}` : "—"}</strong></div>
            </div>
          )}
        </section>

        <section className={styles.panel} data-active={step === 1} data-smart-stage="1">
          <div className={styles.panelHead}>
            <div><h4>{ar ? "النتيجة والمدى المرجعي" : "Result and reference"}</h4><p>{ar ? "سجّل القيمة كما ظهرت من المختبر وراجع المجال المرجعي المقترح." : "Record the reported value and verify the suggested reference interval."}</p></div>
          </div>
          {def ? (
            <>
              {(range?.low != null || range?.high != null) && (
                <div className={styles.refCard}><span>{ar ? "المدى المرجعي المقترح" : "Suggested reference interval"}</span><strong className="num" dir="ltr">{range?.low ?? "—"} — {range?.high ?? "—"} {def.unit ?? ""}</strong></div>
              )}
              <div className={styles.grid2}>
                {def.resultType === "QUANTITATIVE" ? (
                  <>
                    <Field label={t("lab.value")} required><input key={`${code}-value`} className="input num" name="valueNum" type="number" step="any" inputMode="decimal" required /></Field>
                    <Field label={t("lab.unit")}><input key={`${code}-unit`} className="input" name="unit" defaultValue={def.unit ?? ""} dir="ltr" /></Field>
                    <Field label={`${t("lab.reference")} — min`}><input key={`${code}-low`} className="input num" name="refLow" type="number" step="any" defaultValue={range?.low ?? ""} /></Field>
                    <Field label={`${t("lab.reference")} — max`}><input key={`${code}-high`} className="input num" name="refHigh" type="number" step="any" defaultValue={range?.high ?? ""} /></Field>
                  </>
                ) : (
                  <div className={styles.full}>
                    <Field label={t("lab.value")} required>
                      <select key={`${code}-text`} className="select" name="valueText" defaultValue="" required>
                        <option value="" disabled>—</option>
                        <option value="Non-Reactive">{t("flag.NON_REACTIVE")}</option>
                        <option value="Reactive">{t("flag.REACTIVE")}</option>
                        <option value="Indeterminate">{t("flag.INDETERMINATE")}</option>
                      </select>
                    </Field>
                  </div>
                )}
                <Field label={t("lab.collectedAt")}><input className="input" type="date" name="collectedAt" defaultValue={today()} /></Field>
                <Field label={t("lab.verifiedAt")}><input className="input" type="date" name="verifiedAt" /></Field>
              </div>
            </>
          ) : (
            <p className={styles.error}>{ar ? "اختر الفحص في المرحلة الأولى أولًا." : "Choose a test in the first stage before entering a result."}</p>
          )}
        </section>

        <section className={styles.panel} data-active={step === 2} data-smart-stage="2">
          <div className={styles.panelHead}>
            <div><h4>{ar ? "العينة والمصدر والتحقق" : "Sample, source and verification"}</h4><p>{ar ? "أكمل بيانات التتبع التي تساعد لاحقًا في مراجعة مصدر النتيجة." : "Complete provenance details that support later result review and traceability."}</p></div>
          </div>
          <div className={styles.grid2}>
            <Field label={t("lab.orderNo")}><input className="input" name="orderNo" dir="ltr" /></Field>
            <Field label={t("lab.sampleNo")}><input className="input" name="sampleNo" dir="ltr" /></Field>
            <Field label={t("lab.performedBy")}><input className="input" name="performedBy" /></Field>
            <Field label={t("lab.verifiedBy")}><input className="input" name="verifiedBy" /></Field>
            <div className={styles.full}><Field label={t("lab.labName")}><input className="input" name="labName" /></Field></div>
          </div>
        </section>
      </div>

      <div className={styles.footer}>
        <div className={styles.progress}>
          <div className={styles.progressTop}><span>{ar ? "تقدم التحليل" : "Lab progress"}</span><span className="num">{step + 1}/3</span></div>
          <div className={styles.track}><span style={{ width: `${((step + 1) / 3) * 100}%` }} /></div>
        </div>
        <div className={styles.actions}>
          {step === 0 ? (
            <button type="button" className="btn btn-ghost" onClick={close}>{t("action.cancel")}</button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setStep((step - 1) as Step)}>{ar ? "السابق" : "Back"}</button>
          )}
          {step < 2 ? <button type="button" className="btn btn-primary" onClick={next}>{ar ? "التالي" : "Next"}</button> : <ActionSubmit label={t("action.save")} />}
        </div>
      </div>
    </form>
  );
}
