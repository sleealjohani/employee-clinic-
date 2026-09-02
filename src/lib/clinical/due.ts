import type { LabFlag } from "@prisma/client";
import { TEST_BY_CODE } from "@/lib/catalog/tests";
import { OCCUPATIONAL_VACCINES, VACCINE_BY_CODE } from "@/lib/catalog/vaccines";
import { addMonths, daysBetween, startOfDay } from "@/lib/format";
import { requiresReview, isCritical } from "./rules";

/**
 * The due engine — what turns this from an archive into a working tool.
 *
 * It answers "who needs something done, and when was it due", producing a list
 * of names and actions rather than a percentage nobody can act on.
 */

export type DueKind =
  | "VACCINE"
  | "LAB_FOLLOWUP"
  | "CRITICAL"
  | "REVIEW"
  | "PROFILE";
export type DueUrgency = "OVERDUE" | "DUE" | "SOON";

export type DueItem = {
  id: string;
  kind: DueKind;
  urgency: DueUrgency;
  employeeId: string;
  employeeName: string;
  department: string | null;
  title: string;
  detail: string;
  dueDate: Date | null;
  daysLate: number;
  href: string;
};

export type DueEmployeeInput = {
  id: string;
  name: string;
  department: string | null;
  missingFields: string[];
  vaccinations: {
    vaccineCode: string;
    doseNumber: number;
    givenAt: Date;
    nextDueAt: Date | null;
  }[];
  labs: {
    id: string;
    testCode: string;
    flag: LabFlag;
    collectedAt: Date | null;
    requiresReview: boolean;
    reviewedAt: Date | null;
    criticalNotifiedAt: Date | null;
  }[];
};

const SOON_WINDOW_DAYS = 30;

function urgencyFor(dueDate: Date, today: Date): DueUrgency | null {
  const late = daysBetween(today, startOfDay(dueDate));
  if (late > 0) return "OVERDUE";
  if (late === 0) return "DUE";
  if (-late <= SOON_WINDOW_DAYS) return "SOON";
  return null;
}

/** Next dose date for one vaccine series, or null when nothing is outstanding. */
export function nextVaccineDue(
  vaccineCode: string,
  doses: { doseNumber: number; givenAt: Date; nextDueAt: Date | null }[],
): { dueDate: Date; nextDose: number } | null {
  const def = VACCINE_BY_CODE[vaccineCode];
  if (!def) return null;

  const sorted = [...doses].sort(
    (a, b) => a.givenAt.getTime() - b.givenAt.getTime(),
  );
  const doseNumbers = new Set(sorted.map((d) => d.doseNumber));
  let given = 0;
  while (doseNumbers.has(given + 1)) given++;

  if (sorted.length === 0) {
    return { dueDate: startOfDay(), nextDose: 1 };
  }

  const last = sorted[sorted.length - 1];
  // An explicit clinician-set date always wins over the computed schedule.
  if (last.nextDueAt)
    return {
      dueDate: last.nextDueAt,
      nextDose: Math.max(given, ...doseNumbers) + 1,
    };

  if (given < def.doses) {
    if (given === 0) return { dueDate: startOfDay(), nextDose: 1 };
    const previous = sorted.filter((d) => d.doseNumber === given).at(-1)!;
    const gap = def.intervalsMonths[given - 1] ?? 1;
    return { dueDate: addMonths(previous.givenAt, gap), nextDose: given + 1 };
  }

  if (def.boosterMonths) {
    return {
      dueDate: addMonths(last.givenAt, def.boosterMonths),
      nextDose: given + 1,
    };
  }

  return null;
}

export function computeDueItems(
  employees: DueEmployeeInput[],
  locale: "ar" | "en" = "ar",
  today = startOfDay(),
): DueItem[] {
  const ar = locale === "ar";
  const items: DueItem[] = [];

  for (const emp of employees) {
    const base = {
      employeeId: emp.id,
      employeeName: emp.name,
      department: emp.department,
      href: `/employees/${emp.id}`,
    };

    // --- immunisation
    for (const vac of OCCUPATIONAL_VACCINES) {
      const doses = emp.vaccinations.filter((v) => v.vaccineCode === vac.code);
      const next = nextVaccineDue(vac.code, doses);
      if (!next) continue;
      const urgency = urgencyFor(next.dueDate, today);
      if (!urgency) continue;
      items.push({
        ...base,
        id: `vac-${emp.id}-${vac.code}`,
        kind: "VACCINE",
        urgency,
        title: ar ? vac.nameAr : vac.nameEn,
        detail: ar ? `الجرعة رقم ${next.nextDose}` : `Dose ${next.nextDose}`,
        dueDate: next.dueDate,
        daysLate: Math.max(0, daysBetween(today, startOfDay(next.dueDate))),
      });
    }

    // --- unclosed critical results
    for (const lab of emp.labs) {
      if (!isCritical(lab.flag, lab.testCode) || lab.criticalNotifiedAt)
        continue;
      const def = TEST_BY_CODE[lab.testCode];
      items.push({
        ...base,
        id: `crit-${lab.id}`,
        kind: "CRITICAL",
        urgency: "OVERDUE",
        title: ar ? "نتيجة حرجة لم تُبلَّغ" : "Critical result not notified",
        detail: def ? (ar ? def.nameAr : def.nameEn) : lab.testCode,
        dueDate: lab.collectedAt,
        daysLate: lab.collectedAt
          ? Math.max(0, daysBetween(today, startOfDay(lab.collectedAt)))
          : 0,
        href: `/employees/${emp.id}?tab=labs`,
      });
    }

    // --- results still waiting on a clinician
    for (const lab of emp.labs) {
      if (lab.reviewedAt) continue;
      if (!lab.requiresReview && !requiresReview(lab.flag, lab.testCode))
        continue;
      if (isCritical(lab.flag, lab.testCode) && !lab.criticalNotifiedAt)
        continue; // already listed above
      const def = TEST_BY_CODE[lab.testCode];
      items.push({
        ...base,
        id: `rev-${lab.id}`,
        kind: "REVIEW",
        urgency: "DUE",
        title: ar ? "بانتظار مراجعة الطبيب" : "Awaiting clinician review",
        detail: def ? (ar ? def.nameAr : def.nameEn) : lab.testCode,
        dueDate: lab.collectedAt,
        daysLate: lab.collectedAt
          ? Math.max(0, daysBetween(today, startOfDay(lab.collectedAt)))
          : 0,
        href: `/employees/${emp.id}?tab=labs`,
      });
    }

    // --- periodic repeats
    const latestByTest = new Map<string, Date>();
    for (const lab of emp.labs) {
      if (!lab.collectedAt) continue;
      const prev = latestByTest.get(lab.testCode);
      if (!prev || lab.collectedAt > prev)
        latestByTest.set(lab.testCode, lab.collectedAt);
    }
    for (const [code, when] of latestByTest) {
      const def = TEST_BY_CODE[code];
      if (!def?.repeatMonths) continue;
      const dueDate = addMonths(when, def.repeatMonths);
      const urgency = urgencyFor(dueDate, today);
      if (!urgency) continue;
      items.push({
        ...base,
        id: `rep-${emp.id}-${code}`,
        kind: "LAB_FOLLOWUP",
        urgency,
        title: ar ? `إعادة ${def.nameAr}` : `Repeat ${def.nameEn}`,
        detail: ar
          ? `آخر فحص قبل ${def.repeatMonths} شهراً`
          : `Last done ${def.repeatMonths} months ago`,
        dueDate,
        daysLate: Math.max(0, daysBetween(today, startOfDay(dueDate))),
        href: `/employees/${emp.id}?tab=labs`,
      });
    }

    // --- incomplete record
    if (emp.missingFields.length > 0) {
      items.push({
        ...base,
        id: `prof-${emp.id}`,
        kind: "PROFILE",
        urgency: "SOON",
        title: ar ? "ملف غير مكتمل" : "Incomplete record",
        detail: ar
          ? `${emp.missingFields.length} حقل ناقص`
          : `${emp.missingFields.length} missing field(s)`,
        dueDate: null,
        daysLate: 0,
      });
    }
  }

  const rank: Record<DueUrgency, number> = { OVERDUE: 0, DUE: 1, SOON: 2 };
  const kindRank: Record<DueKind, number> = {
    CRITICAL: 0,
    REVIEW: 1,
    VACCINE: 2,
    LAB_FOLLOWUP: 3,
    PROFILE: 4,
  };
  return items.sort(
    (a, b) =>
      rank[a.urgency] - rank[b.urgency] ||
      kindRank[a.kind] - kindRank[b.kind] ||
      b.daysLate - a.daysLate,
  );
}
