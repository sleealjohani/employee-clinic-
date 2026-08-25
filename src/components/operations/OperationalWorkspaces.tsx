"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n/client";
import styles from "./OperationalWorkspaces.module.css";

type VisitRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string | null;
  dateKey: string;
  dateLabel: string;
  type: string;
  chiefComplaint: string | null;
  diagnosis: string | null;
  plan: string | null;
  notes: string | null;
  tempC: number | null;
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  respRate: number | null;
  spo2: number | null;
  weightKg: number | null;
  heightCm: number | null;
  bmi: number | null;
  abnormal: boolean;
};

type LabRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  dateKey: string;
  dateLabel: string;
  testCode: string;
  testName: string;
  value: string;
  reference: string;
  flag: string;
  criticalOpen: boolean;
  needsReview: boolean;
  reviewed: boolean;
  notified: boolean;
  orderNo: string | null;
  sampleNo: string | null;
  performedBy: string | null;
  verifiedBy: string | null;
  labName: string | null;
};

type VaccineCoverage = {
  code: string;
  name: string;
  complete: number;
  overdue: number;
  total: number;
  percent: number;
};

type VaccineAttention = {
  key: string;
  employeeId: string;
  employeeName: string;
  department: string | null;
  vaccineCode: string;
  vaccineName: string;
  dueDateKey: string;
  dueDateLabel: string;
  doseNumber: number;
  status: "overdue" | "dueSoon";
};

type VaccineRecent = {
  id: string;
  employeeId: string;
  employeeName: string;
  vaccineCode: string;
  vaccineName: string;
  doseNumber: number;
  dateKey: string;
  dateLabel: string;
  lotNumber: string | null;
  provider: string | null;
  site: string | null;
};

function EmptyDetail({ ar }: { ar: boolean }) {
  return (
    <div className={styles.empty}>
      <div>
        <b>{ar ? "لا توجد سجلات مطابقة" : "No matching records"}</b>
        <p>{ar ? "غيّر الفلاتر أو البحث لعرض نتائج أخرى." : "Adjust the filters or search to see other records."}</p>
      </div>
    </div>
  );
}

function MiniTag({ tone, children }: { tone?: "danger" | "warn" | "ok" | "accent"; children: React.ReactNode }) {
  return <span className={styles.miniTag} data-tone={tone}>{children}</span>;
}

function Metric({ label, value, tone }: { label: string; value: number | string; tone?: "danger" | "warn" | "ok" }) {
  return (
    <div className={`${styles.metric} lift specular`} data-tone={tone}>
      <div className={styles.metricTop}><span>{label}</span><span>●</span></div>
      <strong className="num">{value}</strong>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className={styles.search}>
      <span className={styles.searchIcon} aria-hidden />
      <input className="input" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function VisitsOperationalWorkspace({ records, todayKey }: { records: VisitRecord[]; todayKey: string }) {
  const t = useT();
  const ar = t.locale === "ar";
  const [query, setQuery] = useState("");
  const [queue, setQueue] = useState<"all" | "today" | "abnormal" | "followup">("all");
  const [type, setType] = useState("");
  const [selectedId, setSelectedId] = useState(records[0]?.id ?? "");

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return records.filter((record) => {
      if (queue === "today" && record.dateKey !== todayKey) return false;
      if (queue === "abnormal" && !record.abnormal) return false;
      if (queue === "followup" && record.type !== "FOLLOW_UP") return false;
      if (type && record.type !== type) return false;
      if (!needle) return true;
      return [record.employeeName, record.department ?? "", record.chiefComplaint ?? "", record.diagnosis ?? ""]
        .some((value) => value.toLocaleLowerCase().includes(needle));
    });
  }, [query, queue, records, todayKey, type]);

  useEffect(() => {
    if (!filtered.some((record) => record.id === selectedId)) setSelectedId(filtered[0]?.id ?? "");
  }, [filtered, selectedId]);

  const selected = filtered.find((record) => record.id === selectedId) ?? filtered[0];
  const types = useMemo(() => [...new Set(records.map((record) => record.type))], [records]);
  const todayCount = records.filter((record) => record.dateKey === todayKey).length;
  const abnormalCount = records.filter((record) => record.abnormal).length;
  const followUpCount = records.filter((record) => record.type === "FOLLOW_UP").length;

  return (
    <section className={styles.workspace}>
      <div className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <p className={styles.kicker}>{ar ? "تشغيل الزيارات" : "Visit operations"}</p>
            <h2>{ar ? "مركز تشغيل الزيارات" : "Visit operations center"}</h2>
          </div>
          <span className={styles.live}>{ar ? "تحديث مباشر" : "Live workspace"}</span>
        </div>
        <div className={`${styles.metrics} stagger`}>
          <Metric label={ar ? "ضمن الفترة" : "In range"} value={records.length} />
          <Metric label={ar ? "زيارات اليوم" : "Today"} value={todayCount} tone="ok" />
          <Metric label={ar ? "مؤشرات غير طبيعية" : "Abnormal vitals"} value={abnormalCount} tone={abnormalCount ? "warn" : "ok"} />
          <Metric label={ar ? "متابعات" : "Follow-ups"} value={followUpCount} />
        </div>
      </div>

      <div className={styles.toolbar}>
        <SearchBox value={query} onChange={setQuery} placeholder={ar ? "ابحث بالموظف، القسم، الشكوى أو التشخيص" : "Search employee, department, complaint or diagnosis"} />
        <div className={styles.queueTabs}>
          {([
            ["all", ar ? "الكل" : "All"],
            ["today", ar ? "اليوم" : "Today"],
            ["abnormal", ar ? "يحتاج انتباه" : "Attention"],
            ["followup", ar ? "متابعة" : "Follow-up"],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" data-active={queue === value} onClick={() => setQueue(value)}>{label}</button>
          ))}
        </div>
        <select className={`select ${styles.selector}`} value={type} onChange={(event) => setType(event.target.value)}>
          <option value="">{ar ? "كل أنواع الزيارة" : "All visit types"}</option>
          {types.map((value) => <option key={value} value={value}>{t(`visitType.${value}`)}</option>)}
        </select>
      </div>

      <div className={styles.board}>
        <div className={styles.listPane}>
          <div className={styles.listHead}><h3>{ar ? "قائمة التشغيل" : "Operational queue"}</h3><span className="num">{filtered.length}</span></div>
          {filtered.length === 0 ? <EmptyDetail ar={ar} /> : (
            <div className={`${styles.list} stagger`}>
              {filtered.map((record) => (
                <button key={record.id} type="button" className={styles.item} data-active={selected?.id === record.id} onClick={() => setSelectedId(record.id)}>
                  <div className={styles.itemTitle}><b>{record.employeeName}</b><time className="num">{record.dateLabel}</time></div>
                  <p className={styles.itemSub}>{record.chiefComplaint ?? record.diagnosis ?? record.department ?? "—"}</p>
                  <div className={styles.itemMeta}>
                    <MiniTag tone="accent">{t(`visitType.${record.type}`)}</MiniTag>
                    {record.abnormal && <MiniTag tone="warn">{t("visit.abnormalVitals")}</MiniTag>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.detailPane}>
          {!selected ? <EmptyDetail ar={ar} /> : (
            <article key={selected.id} className={styles.detailCard}>
              <div className={styles.detailHead}>
                <div><h3>{selected.employeeName}</h3><p>{selected.department ?? (ar ? "القسم غير مسجل" : "Department not recorded")} · {selected.dateLabel}</p></div>
                <div className={styles.detailValue}><strong>{t(`visitType.${selected.type}`)}</strong><small>{selected.abnormal ? (ar ? "مؤشرات تحتاج مراجعة" : "Vitals need review") : (ar ? "لا توجد إشارة حيوية بارزة" : "No highlighted vital signal")}</small></div>
              </div>
              <div className={styles.detailGrid}>
                <div className={styles.signalCard}><span>{t("visit.temp")}</span><strong className="num">{selected.tempC ?? "—"} {selected.tempC !== null ? "°C" : ""}</strong></div>
                <div className={styles.signalCard}><span>{t("visit.bp")}</span><strong className="num">{selected.systolic && selected.diastolic ? `${selected.systolic}/${selected.diastolic}` : "—"}</strong></div>
                <div className={styles.signalCard}><span>{t("visit.pulse")}</span><strong className="num">{selected.pulse ?? "—"}</strong></div>
                <div className={styles.signalCard}><span>{t("visit.spo2")}</span><strong className="num">{selected.spo2 ?? "—"}{selected.spo2 !== null ? "%" : ""}</strong></div>
                <div className={styles.signalCard}><span>{t("visit.rr")}</span><strong className="num">{selected.respRate ?? "—"}</strong></div>
                <div className={styles.signalCard}><span>{t("visit.bmi")}</span><strong className="num">{selected.bmi ?? "—"}</strong></div>
              </div>
              <div className={styles.textGrid}>
                <div className={styles.textCard}><span>{t("visit.chief")}</span><strong>{selected.chiefComplaint ?? "—"}</strong></div>
                <div className={styles.textCard}><span>{t("visit.diagnosis")}</span><strong>{selected.diagnosis ?? "—"}</strong></div>
                <div className={styles.textCard}><span>{t("visit.plan")}</span><strong>{selected.plan ?? "—"}</strong></div>
                <div className={styles.textCard}><span>{t("common.notes")}</span><strong>{selected.notes ?? "—"}</strong></div>
              </div>
              <div className={styles.detailActions}>
                <Link className="btn btn-primary btn-sm" href={`/employees/${selected.employeeId}?tab=visits`} prefetch={false}>{ar ? "فتح ملف 360°" : "Open 360° record"}</Link>
              </div>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}

function labTone(record: LabRecord): "danger" | "warn" | "ok" | "accent" {
  if (record.criticalOpen) return "danger";
  if (record.needsReview) return "warn";
  if (record.flag === "NORMAL" || record.flag === "NON_REACTIVE") return "ok";
  return "accent";
}

export function LabsOperationalWorkspace({
  records,
  initialQueue = "",
  initialTest = "",
  initialFlag = "",
  testOptions,
}: {
  records: LabRecord[];
  initialQueue?: string;
  initialTest?: string;
  initialFlag?: string;
  testOptions: { code: string; name: string }[];
}) {
  const t = useT();
  const ar = t.locale === "ar";
  const normalizedQueue = initialQueue === "critical" || initialQueue === "review" ? initialQueue : "all";
  const [query, setQuery] = useState("");
  const [queue, setQueue] = useState<"all" | "critical" | "review" | "abnormal">(normalizedQueue);
  const [test, setTest] = useState(initialTest);
  const [flag, setFlag] = useState(initialFlag);
  const [selectedId, setSelectedId] = useState(records[0]?.id ?? "");

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return records.filter((record) => {
      if (queue === "critical" && !record.criticalOpen) return false;
      if (queue === "review" && !record.needsReview) return false;
      if (queue === "abnormal" && ["NORMAL", "NON_REACTIVE"].includes(record.flag)) return false;
      if (test && record.testCode !== test) return false;
      if (flag && record.flag !== flag) return false;
      if (!needle) return true;
      return [record.employeeName, record.testName, record.testCode, record.value].some((value) => value.toLocaleLowerCase().includes(needle));
    });
  }, [flag, query, queue, records, test]);

  useEffect(() => {
    if (!filtered.some((record) => record.id === selectedId)) setSelectedId(filtered[0]?.id ?? "");
  }, [filtered, selectedId]);

  const selected = filtered.find((record) => record.id === selectedId) ?? filtered[0];
  const criticalCount = records.filter((record) => record.criticalOpen).length;
  const reviewCount = records.filter((record) => record.needsReview).length;
  const abnormalCount = records.filter((record) => !["NORMAL", "NON_REACTIVE"].includes(record.flag)).length;
  const flags = useMemo(() => [...new Set(records.map((record) => record.flag))], [records]);

  return (
    <section className={styles.workspace}>
      <div className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <p className={styles.kicker}>{ar ? "تشغيل المختبر" : "Lab operations"}</p>
            <h2>{ar ? "مركز تشغيل المختبر" : "Laboratory operations center"}</h2>
          </div>
          <span className={styles.live}>{ar ? "قائمة سريرية حية" : "Live clinical queue"}</span>
        </div>
        <div className={`${styles.metrics} stagger`}>
          <Metric label={ar ? "النتائج المحملة" : "Loaded results"} value={records.length} />
          <Metric label={ar ? "حرجة غير مبلّغة" : "Open critical"} value={criticalCount} tone={criticalCount ? "danger" : "ok"} />
          <Metric label={ar ? "تحتاج مراجعة" : "Needs review"} value={reviewCount} tone={reviewCount ? "warn" : "ok"} />
          <Metric label={ar ? "غير طبيعية" : "Abnormal"} value={abnormalCount} />
        </div>
      </div>

      <div className={styles.toolbar}>
        <SearchBox value={query} onChange={setQuery} placeholder={ar ? "ابحث بالموظف، الفحص، الكود أو النتيجة" : "Search employee, test, code or result"} />
        <div className={styles.queueTabs}>
          {([
            ["all", ar ? "الكل" : "All"],
            ["critical", ar ? "حرج" : "Critical"],
            ["review", ar ? "مراجعة" : "Review"],
            ["abnormal", ar ? "غير طبيعي" : "Abnormal"],
          ] as const).map(([value, label]) => <button key={value} type="button" data-active={queue === value} onClick={() => setQueue(value)}>{label}</button>)}
        </div>
        <select className={`select ${styles.selector}`} value={test} onChange={(event) => setTest(event.target.value)}>
          <option value="">{ar ? "كل الفحوصات" : "All tests"}</option>
          {testOptions.map((option) => <option key={option.code} value={option.code}>{option.name}</option>)}
        </select>
        <select className={`select ${styles.selector}`} value={flag} onChange={(event) => setFlag(event.target.value)}>
          <option value="">{ar ? "كل الحالات" : "All flags"}</option>
          {flags.map((value) => <option key={value} value={value}>{t(`flag.${value}`)}</option>)}
        </select>
      </div>

      <div className={styles.board}>
        <div className={styles.listPane}>
          <div className={styles.listHead}><h3>{ar ? "قائمة النتائج" : "Results queue"}</h3><span className="num">{filtered.length}</span></div>
          {filtered.length === 0 ? <EmptyDetail ar={ar} /> : (
            <div className={`${styles.list} stagger`}>
              {filtered.map((record) => (
                <button key={record.id} type="button" className={styles.item} data-active={selected?.id === record.id} onClick={() => setSelectedId(record.id)}>
                  <div className={styles.itemTitle}><b>{record.testName}</b><time className="num">{record.dateLabel}</time></div>
                  <p className={styles.itemSub}>{record.employeeName} · {record.value}</p>
                  <div className={styles.itemMeta}>
                    <MiniTag tone={labTone(record)}>{t(`flag.${record.flag}`)}</MiniTag>
                    {record.criticalOpen && <MiniTag tone="danger">{ar ? "تبليغ عاجل" : "Notify now"}</MiniTag>}
                    {record.needsReview && <MiniTag tone="warn">{t("lab.needsReview")}</MiniTag>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.detailPane}>
          {!selected ? <EmptyDetail ar={ar} /> : (
            <article key={selected.id} className={styles.detailCard}>
              <div className={styles.detailHead}>
                <div><h3>{selected.testName}</h3><p>{selected.employeeName} · {selected.dateLabel} · {selected.testCode}</p></div>
                <div className={styles.detailValue}><strong dir="ltr">{selected.value}</strong><small>{t(`flag.${selected.flag}`)}</small></div>
              </div>
              <div className={styles.detailGrid}>
                <div className={styles.signalCard}><span>{t("lab.reference")}</span><strong className="num" dir="ltr">{selected.reference}</strong></div>
                <div className={styles.signalCard}><span>{t("lab.orderNo")}</span><strong className="num">{selected.orderNo ?? "—"}</strong></div>
                <div className={styles.signalCard}><span>{t("lab.sampleNo")}</span><strong className="num">{selected.sampleNo ?? "—"}</strong></div>
                <div className={styles.signalCard}><span>{t("lab.performedBy")}</span><strong>{selected.performedBy ?? "—"}</strong></div>
                <div className={styles.signalCard}><span>{t("lab.verifiedBy")}</span><strong>{selected.verifiedBy ?? "—"}</strong></div>
                <div className={styles.signalCard}><span>{t("lab.labName")}</span><strong>{selected.labName ?? "—"}</strong></div>
              </div>
              {(selected.criticalOpen || selected.needsReview) && (
                <div className={styles.textGrid}>
                  {selected.criticalOpen && <div className={styles.textCard}><span>{ar ? "إجراء عاجل" : "Urgent action"}</span><strong>{ar ? "النتيجة الحرجة لم تُوثق عملية تبليغها بعد. افتح ملف الموظف لإتمام التبليغ وتسجيل الإجراء." : "This critical result has no documented notification yet. Open the employee record to complete notification and action documentation."}</strong></div>}
                  {selected.needsReview && <div className={styles.textCard}><span>{ar ? "المراجعة الطبية" : "Clinical review"}</span><strong>{ar ? "النتيجة ما زالت في قائمة المراجعة الطبية." : "This result is still awaiting clinical review."}</strong></div>}
                </div>
              )}
              <div className={styles.detailActions}>
                <Link className={selected.criticalOpen ? "btn btn-danger btn-sm" : "btn btn-primary btn-sm"} href={`/employees/${selected.employeeId}?tab=labs`} prefetch={false}>{selected.criticalOpen ? (ar ? "فتح وإتمام التبليغ" : "Open & notify") : (ar ? "فتح ملف 360°" : "Open 360° record")}</Link>
              </div>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}

export function VaccinationsOperationalWorkspace({
  coverage,
  attention,
  recent,
}: {
  coverage: VaccineCoverage[];
  attention: VaccineAttention[];
  recent: VaccineRecent[];
}) {
  const t = useT();
  const ar = t.locale === "ar";
  const [mode, setMode] = useState<"attention" | "recent">("attention");
  const [query, setQuery] = useState("");
  const [vaccine, setVaccine] = useState("");
  const [selectedKey, setSelectedKey] = useState(attention[0]?.key ?? recent[0]?.id ?? "");

  const filteredAttention = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return attention.filter((record) => {
      if (vaccine && record.vaccineCode !== vaccine) return false;
      if (!needle) return true;
      return [record.employeeName, record.department ?? "", record.vaccineName].some((value) => value.toLocaleLowerCase().includes(needle));
    });
  }, [attention, query, vaccine]);

  const filteredRecent = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return recent.filter((record) => {
      if (vaccine && record.vaccineCode !== vaccine) return false;
      if (!needle) return true;
      return [record.employeeName, record.vaccineName, record.provider ?? ""].some((value) => value.toLocaleLowerCase().includes(needle));
    });
  }, [query, recent, vaccine]);

  const activeList = mode === "attention" ? filteredAttention : filteredRecent;
  useEffect(() => {
    const keys = activeList.map((record) => "key" in record ? record.key : record.id);
    if (!keys.includes(selectedKey)) setSelectedKey(keys[0] ?? "");
  }, [activeList, selectedKey]);

  const selectedAttention = mode === "attention" ? filteredAttention.find((record) => record.key === selectedKey) ?? filteredAttention[0] : undefined;
  const selectedRecent = mode === "recent" ? filteredRecent.find((record) => record.id === selectedKey) ?? filteredRecent[0] : undefined;
  const overdueCount = attention.filter((record) => record.status === "overdue").length;
  const dueSoonCount = attention.filter((record) => record.status === "dueSoon").length;
  const averageCoverage = coverage.length ? Math.round(coverage.reduce((sum, item) => sum + item.percent, 0) / coverage.length) : 0;
  const vaccineOptions = coverage.map((item) => ({ code: item.code, name: item.name }));

  return (
    <section className={styles.workspace}>
      <div className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <p className={styles.kicker}>{ar ? "تشغيل التحصينات" : "Immunisation operations"}</p>
            <h2>{ar ? "مركز تشغيل التحصينات" : "Immunisation operations center"}</h2>
          </div>
          <span className={styles.live}>{ar ? "جاهزية مهنية" : "Occupational readiness"}</span>
        </div>
        <div className={`${styles.metrics} stagger`}>
          <Metric label={ar ? "متوسط التغطية" : "Average coverage"} value={`${averageCoverage}%`} tone={averageCoverage >= 90 ? "ok" : "warn"} />
          <Metric label={ar ? "متأخر" : "Overdue"} value={overdueCount} tone={overdueCount ? "danger" : "ok"} />
          <Metric label={ar ? "يستحق قريبًا" : "Due soon"} value={dueSoonCount} tone={dueSoonCount ? "warn" : "ok"} />
          <Metric label={ar ? "جرعات حديثة" : "Recent doses"} value={recent.length} />
        </div>
      </div>

      <div className={`${styles.coverage} stagger`}>
        {coverage.map((item) => (
          <div key={item.code} className={`${styles.coverageCard} lift`}>
            <div className={styles.coverageTop}><b>{item.name}</b><strong className="num">{item.percent}%</strong></div>
            <div className={styles.coverageTrack}><span className="meter-fill" style={{ width: `${item.percent}%` }} /></div>
            <div className={styles.coverageMeta}><span className="num">{item.complete}/{item.total}</span><span>{item.overdue > 0 ? `${ar ? "متأخر" : "overdue"}: ${item.overdue}` : (ar ? "لا يوجد متأخر" : "No overdue")}</span></div>
          </div>
        ))}
      </div>

      <div className={styles.toolbar}>
        <SearchBox value={query} onChange={setQuery} placeholder={ar ? "ابحث بالموظف، القسم أو اللقاح" : "Search employee, department or vaccine"} />
        <div className={styles.queueTabs}>
          <button type="button" data-active={mode === "attention"} onClick={() => setMode("attention")}>{ar ? "يحتاج إجراء" : "Needs action"}</button>
          <button type="button" data-active={mode === "recent"} onClick={() => setMode("recent")}>{ar ? "الجرعات الحديثة" : "Recent doses"}</button>
        </div>
        <select className={`select ${styles.selector}`} value={vaccine} onChange={(event) => setVaccine(event.target.value)}>
          <option value="">{ar ? "كل اللقاحات" : "All vaccines"}</option>
          {vaccineOptions.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
        </select>
      </div>

      <div className={styles.board}>
        <div className={styles.listPane}>
          <div className={styles.listHead}><h3>{mode === "attention" ? (ar ? "قائمة الاستحقاق" : "Due queue") : (ar ? "آخر الجرعات" : "Recent administrations")}</h3><span className="num">{activeList.length}</span></div>
          {activeList.length === 0 ? <EmptyDetail ar={ar} /> : mode === "attention" ? (
            <div className={`${styles.list} stagger`}>
              {filteredAttention.map((record) => (
                <button key={record.key} type="button" className={styles.item} data-active={selectedAttention?.key === record.key} onClick={() => setSelectedKey(record.key)}>
                  <div className={styles.itemTitle}><b>{record.employeeName}</b><time className="num">{record.dueDateLabel}</time></div>
                  <p className={styles.itemSub}>{record.vaccineName} · {record.department ?? "—"}</p>
                  <div className={styles.itemMeta}><MiniTag tone={record.status === "overdue" ? "danger" : "warn"}>{record.status === "overdue" ? (ar ? "متأخر" : "Overdue") : (ar ? "يستحق قريبًا" : "Due soon")}</MiniTag><MiniTag tone="accent">{ar ? "الجرعة" : "Dose"} {record.doseNumber}</MiniTag></div>
                </button>
              ))}
            </div>
          ) : (
            <div className={`${styles.list} stagger`}>
              {filteredRecent.map((record) => (
                <button key={record.id} type="button" className={styles.item} data-active={selectedRecent?.id === record.id} onClick={() => setSelectedKey(record.id)}>
                  <div className={styles.itemTitle}><b>{record.employeeName}</b><time className="num">{record.dateLabel}</time></div>
                  <p className={styles.itemSub}>{record.vaccineName}</p>
                  <div className={styles.itemMeta}><MiniTag tone="ok">{ar ? "جرعة" : "Dose"} {record.doseNumber}</MiniTag>{record.provider && <MiniTag>{record.provider}</MiniTag>}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.detailPane}>
          {mode === "attention" ? (!selectedAttention ? <EmptyDetail ar={ar} /> : (
            <article key={selectedAttention.key} className={styles.detailCard}>
              <div className={styles.detailHead}>
                <div><h3>{selectedAttention.employeeName}</h3><p>{selectedAttention.department ?? "—"}</p></div>
                <div className={styles.detailValue}><strong>{selectedAttention.vaccineName}</strong><small>{selectedAttention.status === "overdue" ? (ar ? "متأخر عن الاستحقاق" : "Past due") : (ar ? "موعد قريب" : "Upcoming")}</small></div>
              </div>
              <div className={styles.detailGrid}>
                <div className={styles.signalCard}><span>{t("vac.nextDue")}</span><strong className="num">{selectedAttention.dueDateLabel}</strong></div>
                <div className={styles.signalCard}><span>{t("vac.dose")}</span><strong className="num">{selectedAttention.doseNumber}</strong></div>
                <div className={styles.signalCard}><span>{ar ? "الحالة" : "Status"}</span><strong>{selectedAttention.status === "overdue" ? (ar ? "متأخر" : "Overdue") : (ar ? "يستحق قريبًا" : "Due soon")}</strong></div>
              </div>
              <div className={styles.detailActions}><Link className={selectedAttention.status === "overdue" ? "btn btn-danger btn-sm" : "btn btn-primary btn-sm"} href={`/employees/${selectedAttention.employeeId}?tab=vaccines`} prefetch={false}>{ar ? "فتح ملف التحصين" : "Open immunisation record"}</Link></div>
            </article>
          )) : (!selectedRecent ? <EmptyDetail ar={ar} /> : (
            <article key={selectedRecent.id} className={styles.detailCard}>
              <div className={styles.detailHead}>
                <div><h3>{selectedRecent.employeeName}</h3><p>{selectedRecent.dateLabel}</p></div>
                <div className={styles.detailValue}><strong>{selectedRecent.vaccineName}</strong><small>{ar ? "جرعة موثقة" : "Documented dose"}</small></div>
              </div>
              <div className={styles.detailGrid}>
                <div className={styles.signalCard}><span>{t("vac.dose")}</span><strong className="num">{selectedRecent.doseNumber}</strong></div>
                <div className={styles.signalCard}><span>{t("vac.lot")}</span><strong className="num">{selectedRecent.lotNumber ?? "—"}</strong></div>
                <div className={styles.signalCard}><span>{t("vac.provider")}</span><strong>{selectedRecent.provider ?? "—"}</strong></div>
                <div className={styles.signalCard}><span>{t("vac.site")}</span><strong>{selectedRecent.site ?? "—"}</strong></div>
              </div>
              <div className={styles.detailActions}><Link className="btn btn-primary btn-sm" href={`/employees/${selectedRecent.employeeId}?tab=vaccines`} prefetch={false}>{ar ? "فتح ملف 360°" : "Open 360° record"}</Link></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
