"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { IconAllergy, IconEmployees, IconLab, IconSearch, IconVisit } from "@/components/layout/icons";
import { initials } from "@/lib/format";
import styles from "./EmployeeDirectoryWorkspace.module.css";

export type DirectoryEmployee = {
  id: string;
  name: string;
  nameEn: string | null;
  nationalId: string;
  employeeNo: string | null;
  department: string | null;
  jobTitle: string | null;
  bloodType: string | null;
  age: number | null;
  isArchived: boolean;
  completeness: number;
  visitsCount: number;
  labsCount: number;
  allergyCount: number;
  severeAllergy: boolean;
  lastVisit: string | null;
};

type FilterKey = "all" | "attention" | "incomplete";
type ViewKey = "workspace" | "cards";

export function EmployeeDirectoryWorkspace({
  employees,
  locale,
}: {
  employees: DirectoryEmployee[];
  locale: "ar" | "en";
}) {
  const ar = locale === "ar";
  const [selectedId, setSelectedId] = useState(employees[0]?.id ?? "");
  const [localQuery, setLocalQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [view, setView] = useState<ViewKey>("workspace");

  const filtered = useMemo(() => {
    const q = localQuery.trim().toLowerCase();
    return employees.filter((employee) => {
      const haystack = [
        employee.name,
        employee.nameEn,
        employee.nationalId,
        employee.employeeNo,
        employee.department,
        employee.jobTitle,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (q && !haystack.includes(q)) return false;
      if (filter === "attention" && !employee.severeAllergy) return false;
      if (filter === "incomplete" && employee.completeness >= 100) return false;
      return true;
    });
  }, [employees, filter, localQuery]);

  const selected =
    filtered.find((employee) => employee.id === selectedId) ?? filtered[0] ?? employees[0] ?? null;

  return (
    <section className={styles.directory}>
      <div className={`${styles.toolbar} glass`}>
        <div className={styles.localSearch}>
          <IconSearch size={16} />
          <input
            value={localQuery}
            onChange={(event) => setLocalQuery(event.target.value)}
            placeholder={ar ? "فلترة النتائج الظاهرة…" : "Filter visible results…"}
            aria-label={ar ? "فلترة النتائج الظاهرة" : "Filter visible results"}
          />
          <span className="num">{filtered.length}</span>
        </div>

        <div className={styles.filterGroup} aria-label={ar ? "تصفية الموظفين" : "Employee filters"}>
          <button type="button" data-active={filter === "all"} onClick={() => setFilter("all")}>
            {ar ? "الكل" : "All"}
          </button>
          <button type="button" data-active={filter === "attention"} onClick={() => setFilter("attention")}>
            {ar ? "تنبيه" : "Attention"}
          </button>
          <button type="button" data-active={filter === "incomplete"} onClick={() => setFilter("incomplete")}>
            {ar ? "غير مكتمل" : "Incomplete"}
          </button>
        </div>

        <div className={styles.viewSwitch}>
          <button type="button" data-active={view === "workspace"} onClick={() => setView("workspace")}>
            {ar ? "مساحة عمل" : "Workspace"}
          </button>
          <button type="button" data-active={view === "cards"} onClick={() => setView("cards")}>
            {ar ? "بطاقات" : "Cards"}
          </button>
        </div>
      </div>

      {view === "cards" ? (
        <div className={`${styles.cardGrid} stagger`}>
          {filtered.map((employee) => (
            <Link key={employee.id} href={`/employees/${employee.id}`} className={`${styles.employeeCard} glass specular`}>
              <div className={styles.cardHead}>
                <span className={styles.avatar}>{initials(employee.name)}</span>
                <div>
                  <strong>{employee.name}</strong>
                  <small>{employee.jobTitle ?? (ar ? "بدون مسمى وظيفي" : "No job title")}</small>
                </div>
              </div>
              <div className={styles.cardMeta}>
                <span>{employee.department ?? "—"}</span>
                <span className="num" dir="ltr">{employee.employeeNo ? `#${employee.employeeNo}` : employee.nationalId}</span>
              </div>
              <div className={styles.cardSignals}>
                <span><IconVisit size={14} /><b className="num">{employee.visitsCount}</b></span>
                <span><IconLab size={14} /><b className="num">{employee.labsCount}</b></span>
                {employee.allergyCount > 0 && (
                  <span data-danger={employee.severeAllergy}><IconAllergy size={14} /><b className="num">{employee.allergyCount}</b></span>
                )}
              </div>
              <div className={styles.progressTrack} aria-label={`${employee.completeness}%`}>
                <span className="meter-fill" style={{ width: `${employee.completeness}%` }} />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className={styles.workspace}>
          <div className={`${styles.master} glass`}>
            <div className={styles.masterHeader}>
              <div>
                <span className={styles.eyebrow}>{ar ? "دليل الموظفين" : "Employee directory"}</span>
                <h2>{ar ? "دليل الموظفين" : "Employee directory"}</h2>
              </div>
              <IconEmployees size={20} />
            </div>

            <div className={`${styles.list} stagger`} role="listbox" aria-label={ar ? "الموظفون" : "Employees"}>
              {filtered.map((employee) => {
                const active = selected?.id === employee.id;
                return (
                  <button
                    key={employee.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    data-selected={active}
                    className={styles.person}
                    onClick={() => setSelectedId(employee.id)}
                  >
                    <span className={styles.personAvatar}>{initials(employee.name)}</span>
                    <span className={styles.personBody}>
                      <strong>{employee.name}</strong>
                      <small>{[employee.jobTitle, employee.department].filter(Boolean).join(" · ") || "—"}</small>
                    </span>
                    <span className={styles.personSignal} data-alert={employee.severeAllergy || employee.completeness < 70} />
                  </button>
                );
              })}

              {filtered.length === 0 && (
                <p className={styles.empty}>{ar ? "لا توجد نتائج مطابقة" : "No matching employees"}</p>
              )}
            </div>
          </div>

          <div className={`${styles.preview} glass-strong`}>
            {selected ? (
              <div key={selected.id} className={styles.previewMotion}>
                <header className={styles.profileHeader}>
                  <div className={styles.profileIdentity}>
                    <span className={styles.largeAvatar}>{initials(selected.name)}</span>
                    <div>
                      <span className={styles.eyebrow}>{ar ? "معاينة سريعة" : "Quick preview"}</span>
                      <h2>{selected.name}</h2>
                      <p>{[selected.jobTitle, selected.department].filter(Boolean).join(" · ") || "—"}</p>
                    </div>
                  </div>

                  <Link href={`/employees/${selected.id}`} className="btn btn-primary btn-sm">
                    {ar ? "فتح ملف 360°" : "Open 360° record"}
                  </Link>
                </header>

                <div className={styles.identityStrip}>
                  <div><span>{ar ? "الهوية" : "National ID"}</span><b className="num" dir="ltr">{selected.nationalId}</b></div>
                  <div><span>{ar ? "الرقم الوظيفي" : "Employee no."}</span><b className="num" dir="ltr">{selected.employeeNo ?? "—"}</b></div>
                  <div><span>{ar ? "العمر" : "Age"}</span><b className="num">{selected.age ?? "—"}</b></div>
                  <div><span>{ar ? "فصيلة الدم" : "Blood group"}</span><b dir="ltr">{selected.bloodType ?? "—"}</b></div>
                </div>

                <div className={`${styles.metricGrid} stagger`}>
                  <div className={styles.metric}>
                    <span className={styles.metricIcon}><IconVisit size={17} /></span>
                    <div><small>{ar ? "الزيارات" : "Visits"}</small><strong className="num">{selected.visitsCount}</strong></div>
                  </div>
                  <div className={styles.metric}>
                    <span className={styles.metricIcon}><IconLab size={17} /></span>
                    <div><small>{ar ? "التحاليل" : "Labs"}</small><strong className="num">{selected.labsCount}</strong></div>
                  </div>
                  <div className={styles.metric} data-danger={selected.severeAllergy}>
                    <span className={styles.metricIcon}><IconAllergy size={17} /></span>
                    <div><small>{ar ? "الحساسيات" : "Allergies"}</small><strong className="num">{selected.allergyCount}</strong></div>
                  </div>
                </div>

                <section className={styles.completeness}>
                  <div className={styles.sectionTitle}>
                    <div>
                      <span>{ar ? "جاهزية الملف" : "Record readiness"}</span>
                      <small>{ar ? "اكتمال البيانات الأساسية المطلوبة" : "Required core data completeness"}</small>
                    </div>
                    <strong className="num">{selected.completeness}%</strong>
                  </div>
                  <div className={styles.bigProgress}>
                    <span className="meter-fill" style={{ width: `${selected.completeness}%` }} />
                  </div>
                </section>

                {(selected.severeAllergy || selected.completeness < 70 || selected.isArchived) && (
                  <section className={styles.attention}>
                    <span className={styles.eyebrow}>{ar ? "يحتاج الانتباه" : "Needs attention"}</span>
                    {selected.severeAllergy && <p>{ar ? "يوجد تنبيه حساسية شديدة في الملف." : "A severe allergy alert is recorded."}</p>}
                    {selected.completeness < 70 && <p>{ar ? "الملف يحتاج استكمال بيانات أساسية." : "Core employee data needs completion."}</p>}
                    {selected.isArchived && <p>{ar ? "هذا الموظف مؤرشف." : "This employee is archived."}</p>}
                  </section>
                )}

                <footer className={styles.previewFooter}>
                  <div>
                    <span>{ar ? "آخر زيارة" : "Last visit"}</span>
                    <b>{selected.lastVisit ?? (ar ? "لا توجد زيارة" : "No visit")}</b>
                  </div>
                  <div className={styles.quickLinks}>
                    <Link href={`/employees/${selected.id}?tab=visits`}>{ar ? "الزيارات" : "Visits"}</Link>
                    <Link href={`/employees/${selected.id}?tab=labs`}>{ar ? "التحاليل" : "Labs"}</Link>
                    <Link href={`/employees/${selected.id}?tab=vaccines`}>{ar ? "التطعيمات" : "Vaccines"}</Link>
                  </div>
                </footer>
              </div>
            ) : (
              <p className={styles.empty}>{ar ? "اختر موظفًا لعرض ملخصه" : "Select an employee to preview"}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
