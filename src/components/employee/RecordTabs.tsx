import Link from "next/link";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { ageFrom, formatDate } from "@/lib/format";
import { hbvStatus, hbvTone } from "@/lib/clinical/hbv";
import { Chip, Meter } from "@/components/ui";
import styles from "./RecordTabs.module.css";

export type TabKey =
  | "overview"
  | "visits"
  | "labs"
  | "allergies"
  | "vaccines"
  | "education"
  | "notes";

type TimelineItem = {
  key: string;
  date: Date;
  label: string;
  detail: string;
  tone: "accent" | "info" | "ok" | "neutral";
};

export async function RecordTabs({
  employeeId,
  active,
  labels,
  counts,
}: {
  employeeId: string;
  active: TabKey;
  labels: Record<TabKey, string>;
  counts: Partial<Record<TabKey, number>>;
}) {
  const t = await getT();
  const ar = t.locale === "ar";
  const tabs: TabKey[] = ["overview", "visits", "labs", "allergies", "vaccines", "education", "notes"];

  // A deliberately small second query powers the persistent 360° side panel.
  // The record page already owns the detailed clinical payload; this query only
  // selects the handful of fields needed while the user moves between sections.
  const snapshot = await db.employee.findUnique({
    where: { id: employeeId },
    select: {
      name: true,
      department: true,
      jobTitle: true,
      nationalId: true,
      employeeNo: true,
      dob: true,
      bloodType: true,
      chronicConditions: true,
      currentMedications: true,
      visits: {
        where: { status: { not: "ENTERED_IN_ERROR" } },
        orderBy: { visitDate: "desc" },
        take: 1,
        select: { id: true, visitDate: true, chiefComplaint: true, diagnosis: true },
      },
      labResults: {
        where: { status: { not: "ENTERED_IN_ERROR" } },
        orderBy: [{ collectedAt: "desc" }, { createdAt: "desc" }],
        take: 16,
        select: {
          id: true,
          testCode: true,
          flag: true,
          valueNum: true,
          collectedAt: true,
          requiresReview: true,
          reviewedAt: true,
          criticalNotifiedAt: true,
        },
      },
      allergies: {
        where: { allergyStatus: "ACTIVE", status: { not: "ENTERED_IN_ERROR" } },
        orderBy: { recordedAt: "desc" },
        take: 4,
        select: { id: true, substance: true, severity: true },
      },
      vaccinations: {
        where: { status: "ACTIVE" },
        orderBy: { givenAt: "desc" },
        take: 12,
        select: { id: true, vaccineCode: true, doseNumber: true, givenAt: true },
      },
      notes: {
        where: { status: "ACTIVE" },
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: { id: true, body: true, createdAt: true },
      },
    },
  });

  const hepBDoses = snapshot?.vaccinations.filter((v) => v.vaccineCode === "HEP_B").length ?? 0;
  const hbv = hbvStatus(
    (snapshot?.labResults ?? []).map((lab) => ({
      testCode: lab.testCode,
      flag: lab.flag,
      valueNum: lab.valueNum,
      collectedAt: lab.collectedAt,
    })),
    hepBDoses,
    t.locale,
  );

  const severeAllergy =
    snapshot?.allergies.some((a) => a.severity === "SEVERE" || a.severity === "LIFE_THREATENING") ?? false;
  const openCritical =
    snapshot?.labResults.filter(
      (lab) =>
        (lab.flag === "CRITICAL_HIGH" || lab.flag === "CRITICAL_LOW") &&
        lab.criticalNotifiedAt === null,
    ).length ?? 0;
  const pendingReview =
    snapshot?.labResults.filter((lab) => lab.requiresReview && lab.reviewedAt === null).length ?? 0;

  const timeline: TimelineItem[] = [];
  const lastVisit = snapshot?.visits[0];
  const lastLab = snapshot?.labResults[0];
  const lastVaccine = snapshot?.vaccinations[0];
  const lastNote = snapshot?.notes[0];

  if (lastVisit) {
    timeline.push({
      key: `visit-${lastVisit.id}`,
      date: lastVisit.visitDate,
      label: ar ? "زيارة" : "Visit",
      detail: lastVisit.chiefComplaint ?? lastVisit.diagnosis ?? (ar ? "زيارة سريرية" : "Clinical visit"),
      tone: "accent",
    });
  }
  if (lastLab) {
    timeline.push({
      key: `lab-${lastLab.id}`,
      date: lastLab.collectedAt,
      label: ar ? "تحليل" : "Lab",
      detail: lastLab.testCode,
      tone: "info",
    });
  }
  if (lastVaccine) {
    timeline.push({
      key: `vaccine-${lastVaccine.id}`,
      date: lastVaccine.givenAt,
      label: ar ? "تطعيم" : "Vaccine",
      detail: `${lastVaccine.vaccineCode} · ${ar ? "جرعة" : "Dose"} ${lastVaccine.doseNumber}`,
      tone: "ok",
    });
  }
  if (lastNote) {
    timeline.push({
      key: `note-${lastNote.id}`,
      date: lastNote.createdAt,
      label: ar ? "ملاحظة" : "Note",
      detail: lastNote.body.length > 46 ? `${lastNote.body.slice(0, 46)}…` : lastNote.body,
      tone: "neutral",
    });
  }
  timeline.sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className={`${styles.anchors} no-print`}>
      <nav className={`${styles.navigator} glass`} aria-label={ar ? "أقسام ملف الموظف" : "Employee record sections"}>
        <div className={styles.identity}>
          <span className={styles.avatar} aria-hidden>
            {snapshot?.name.trim().charAt(0) || "•"}
          </span>
          <div className={styles.identityText}>
            <p className={styles.kicker}>{ar ? "ملف الموظف 360°" : "Employee 360°"}</p>
            <p className={styles.name}>{snapshot?.name ?? (ar ? "ملف الموظف" : "Employee record")}</p>
            <p className={styles.role}>{[snapshot?.jobTitle, snapshot?.department].filter(Boolean).join(" · ")}</p>
          </div>
        </div>

        <div className={styles.tabList}>
          {tabs.map((tab, index) => {
            const isActive = tab === active;
            const count = counts[tab];
            return (
              <Link
                key={tab}
                href={`/employees/${employeeId}?tab=${tab}`}
                prefetch={false}
                className={styles.tab}
                data-active={isActive}
                aria-current={isActive ? "page" : undefined}
              >
                <span className={styles.tabIndex}>{String(index + 1).padStart(2, "0")}</span>
                <span className={styles.tabLabel}>{labels[tab]}</span>
                {count !== undefined && count > 0 && <span className={`${styles.count} num`}>{count}</span>}
              </Link>
            );
          })}
        </div>

        <div className={styles.navFoot}>
          <span className={styles.liveDot} />
          <span>{ar ? "ملف حي ومتصل بالسجل السريري" : "Live clinical record"}</span>
        </div>
      </nav>

      <aside className={`${styles.snapshot} glass-strong`} aria-label={ar ? "الملخص السريري" : "Clinical snapshot"}>
        <div className={styles.snapshotHeader}>
          <div>
            <p className={styles.kicker}>{ar ? "نظرة ثابتة" : "Persistent view"}</p>
            <h2>{ar ? "الملخص السريري" : "Clinical snapshot"}</h2>
          </div>
          <span className={styles.snapshotPulse} title={ar ? "متصل" : "Live"} />
        </div>

        <div className={styles.signalGrid}>
          <div className={styles.signal}>
            <span>{ar ? "العمر" : "Age"}</span>
            <strong className="num">{ageFrom(snapshot?.dob ?? null) ?? "—"}</strong>
          </div>
          <div className={styles.signal}>
            <span>{ar ? "فصيلة الدم" : "Blood"}</span>
            <strong dir="ltr">{snapshot?.bloodType ?? "—"}</strong>
          </div>
          <div className={styles.signal}>
            <span>{ar ? "الزيارات" : "Visits"}</span>
            <strong className="num">{counts.visits ?? 0}</strong>
          </div>
          <div className={styles.signal}>
            <span>{ar ? "التحاليل" : "Labs"}</span>
            <strong className="num">{counts.labs ?? 0}</strong>
          </div>
        </div>

        {(openCritical > 0 || pendingReview > 0 || severeAllergy) && (
          <div className={styles.attention}>
            <p>{ar ? "يحتاج الانتباه" : "Needs attention"}</p>
            <div className={styles.attentionRows}>
              {openCritical > 0 && (
                <Link href={`/employees/${employeeId}?tab=labs`} prefetch={false}>
                  <span>{ar ? "نتائج حرجة غير مبلّغة" : "Unnotified critical labs"}</span>
                  <b className="num">{openCritical}</b>
                </Link>
              )}
              {pendingReview > 0 && (
                <Link href={`/employees/${employeeId}?tab=labs`} prefetch={false}>
                  <span>{ar ? "تحاليل تحتاج مراجعة" : "Labs awaiting review"}</span>
                  <b className="num">{pendingReview}</b>
                </Link>
              )}
              {severeAllergy && (
                <Link href={`/employees/${employeeId}?tab=allergies`} prefetch={false}>
                  <span>{ar ? "حساسية شديدة مسجلة" : "Severe allergy recorded"}</span>
                  <b>!</b>
                </Link>
              )}
            </div>
          </div>
        )}

        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <span>{ar ? "المناعة ضد التهاب الكبد B" : "Hepatitis B immunity"}</span>
            <Chip tone={hbvTone(hbv.status)} dot>
              {t(`hbv.${hbv.status}`)}
            </Chip>
          </div>
          <Meter value={hbv.status === "PROTECTED" ? 100 : hepBDoses > 0 ? Math.min(90, hepBDoses * 30) : 8} tone={hbv.status === "PROTECTED" ? "ok" : "warn"} />
        </div>

        {snapshot?.allergies.length ? (
          <div className={styles.section}>
            <p className={styles.sectionLabel}>{ar ? "الحساسية النشطة" : "Active allergies"}</p>
            <div className={styles.chipStack}>
              {snapshot.allergies.map((allergy) => (
                <Chip
                  key={allergy.id}
                  tone={allergy.severity === "SEVERE" || allergy.severity === "LIFE_THREATENING" ? "danger" : "warn"}
                >
                  {allergy.substance}
                </Chip>
              ))}
            </div>
          </div>
        ) : null}

        {(snapshot?.chronicConditions.length || snapshot?.currentMedications.length) ? (
          <div className={styles.section}>
            <p className={styles.sectionLabel}>{ar ? "خلفية سريرية" : "Clinical background"}</p>
            {snapshot.chronicConditions.length > 0 && (
              <p className={styles.clinicalLine}>
                <span>{ar ? "مزمنة" : "Chronic"}</span>
                <b>{snapshot.chronicConditions.slice(0, 2).join("، ")}</b>
              </p>
            )}
            {snapshot.currentMedications.length > 0 && (
              <p className={styles.clinicalLine}>
                <span>{ar ? "أدوية" : "Meds"}</span>
                <b>{snapshot.currentMedications.slice(0, 2).join("، ")}</b>
              </p>
            )}
          </div>
        ) : null}

        <div className={styles.section}>
          <p className={styles.sectionLabel}>{ar ? "آخر النشاط" : "Recent activity"}</p>
          {timeline.length === 0 ? (
            <p className={styles.empty}>{ar ? "لا يوجد نشاط مسجل بعد" : "No recorded activity yet"}</p>
          ) : (
            <ol className={styles.timeline}>
              {timeline.slice(0, 4).map((item) => (
                <li key={item.key} data-tone={item.tone}>
                  <span className={styles.timelineDot} />
                  <div>
                    <div className={styles.timelineTop}>
                      <b>{item.label}</b>
                      <time className="num">{formatDate(item.date, t.locale)}</time>
                    </div>
                    <p>{item.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className={styles.recordIdentity}>
          <span>{ar ? "الهوية" : "ID"}</span>
          <b className="num" dir="ltr">{snapshot?.nationalId ?? "—"}</b>
          {snapshot?.employeeNo && <small className="num">#{snapshot.employeeNo}</small>}
        </div>
      </aside>
    </div>
  );
}
