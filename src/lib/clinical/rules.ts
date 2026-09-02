import type { Comparison, Gender, LabFlag, ResultType } from "@prisma/client";
import { sameUnit } from "./numeric";
import { refFor, TEST_BY_CODE, type TestDef } from "@/lib/catalog/tests";

/**
 * The interpretation layer.
 *
 * Everything clinically meaningful — is a value abnormal, is someone immune,
 * does a result need a clinician — is decided *here*, by fixed rules, from the
 * value and its reference range. Extraction models supply numbers and units and
 * nothing else. That keeps interpretation auditable, explainable and identical
 * every time it runs.
 */

const REACTIVE_TERMS = [
  "reactive",
  "positive",
  "pos",
  "detected",
  "present",
  "abnormal",
  "إيجابي",
  "ايجابي",
  "موجب",
  "متفاعل",
];

const NON_REACTIVE_TERMS = [
  "non reactive",
  "nonreactive",
  "non-reactive",
  "negative",
  "neg",
  "not detected",
  "none detected",
  "absent",
  "normal",
  "سلبي",
  "سالب",
  "غير متفاعل",
  "لا يوجد",
];

const INDETERMINATE_TERMS = [
  "indeterminate",
  "equivocal",
  "borderline",
  "grey zone",
  "غير حاسم",
  "حدي",
];

export function normaliseQualitative(
  raw: string | null | undefined,
): "REACTIVE" | "NON_REACTIVE" | "INDETERMINATE" | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  const match = (term: string) =>
    new RegExp(
      `(^|[^\\p{L}\\p{N}])${term.replace(/[- ]/g, "[- ]?")}(?=$|[^\\p{L}\\p{N}])`,
      "u",
    ).test(v);
  if (INDETERMINATE_TERMS.some(match)) return "INDETERMINATE";
  if (["not reactive", ...NON_REACTIVE_TERMS].some(match))
    return "NON_REACTIVE";
  if (REACTIVE_TERMS.some(match)) return "REACTIVE";
  return null;
}

export type FlagInput = {
  testCode: string;
  resultType: ResultType;
  valueNum?: number | null;
  valueText?: string | null;
  refLow?: number | null;
  refHigh?: number | null;
  sex?: Gender | null;
  unit?: string | null;
  comparator?: Comparison;
};

export function computeFlag(input: FlagInput): LabFlag {
  const def = TEST_BY_CODE[input.testCode];

  if (input.resultType === "QUALITATIVE") {
    const q = normaliseQualitative(input.valueText);
    if (q === null) return "UNKNOWN";
    return q;
  }

  const v = input.valueNum;
  if (v === null || v === undefined || !Number.isFinite(v)) return "UNKNOWN";

  const catalogue =
    def && sameUnit(input.unit, def.unit)
      ? refFor(def, input.sex ?? null)
      : undefined;
  // An explicit range printed on the report always wins over the catalogue default.
  const low = input.refLow ?? catalogue?.low;
  const high = input.refHigh ?? catalogue?.high;
  const criticalLow = catalogue?.criticalLow;
  const criticalHigh = catalogue?.criticalHigh;

  const op = input.comparator ?? "EQ";
  if (op === "LT" || op === "LE") {
    if (criticalLow !== undefined && v <= criticalLow) return "CRITICAL_LOW";
    if (low !== undefined && (v < low || (op === "LT" && v === low)))
      return "LOW";
    return "UNKNOWN";
  }
  if (op === "GT" || op === "GE") {
    if (criticalHigh !== undefined && v >= criticalHigh) return "CRITICAL_HIGH";
    if (high !== undefined && (v > high || (op === "GT" && v === high)))
      return "HIGH";
    return "UNKNOWN";
  }

  if (criticalLow !== undefined && v <= criticalLow) return "CRITICAL_LOW";
  if (criticalHigh !== undefined && v >= criticalHigh) return "CRITICAL_HIGH";
  if (low !== undefined && v < low) return "LOW";
  if (high !== undefined && v > high) return "HIGH";
  if (low === undefined && high === undefined) return "UNKNOWN";
  return "NORMAL";
}

export const ABNORMAL_FLAGS: LabFlag[] = [
  "LOW",
  "HIGH",
  "CRITICAL_LOW",
  "CRITICAL_HIGH",
  "REACTIVE",
  "INDETERMINATE",
];

export const CRITICAL_FLAGS: LabFlag[] = ["CRITICAL_LOW", "CRITICAL_HIGH"];

export function isAbnormal(flag: LabFlag): boolean {
  return ABNORMAL_FLAGS.includes(flag);
}

export function isCritical(flag: LabFlag, testCode: string): boolean {
  if (CRITICAL_FLAGS.includes(flag)) return true;
  // A reactive blood-borne-virus screen is handled with the same urgency.
  const def = TEST_BY_CODE[testCode];
  return flag === "REACTIVE" && Boolean(def?.sensitive);
}

/** Does this result have to reach a clinician before it is considered handled? */
export function requiresReview(flag: LabFlag, testCode: string): boolean {
  if (flag === "UNKNOWN") return true;
  const def = TEST_BY_CODE[testCode];
  if (CRITICAL_FLAGS.includes(flag)) return true;
  if (flag === "INDETERMINATE") return true;
  if (!def) return isAbnormal(flag);
  if (def.reviewWhenAbnormal && isAbnormal(flag)) return true;
  if (def.sensitive && flag === "REACTIVE") return true;
  return false;
}

export function flagTone(flag: LabFlag): "ok" | "warn" | "danger" | "neutral" {
  switch (flag) {
    case "NORMAL":
    case "NON_REACTIVE":
      return "ok";
    case "LOW":
    case "HIGH":
    case "INDETERMINATE":
      return "warn";
    case "CRITICAL_LOW":
    case "CRITICAL_HIGH":
    case "REACTIVE":
      return "danger";
    default:
      return "neutral";
  }
}

/** Plain-language interpretation and the action it implies. Rule-derived, never model-derived. */
export function interpretLab(
  testCode: string,
  flag: LabFlag,
  valueNum: number | null | undefined,
  locale: "ar" | "en",
): { interpretation: string; action: string } {
  const def: TestDef | undefined = TEST_BY_CODE[testCode];
  const ar = locale === "ar";

  if (testCode === "ANTI_HBS" && valueNum !== null && valueNum !== undefined) {
    return {
      interpretation: ar
        ? "يُراجع مع الوحدة والسجل التطعيمي"
        : "Review alongside units and vaccination history",
      action: ar
        ? "يعتمد الطبيب التقييم وخطة المتابعة"
        : "A clinician confirms the assessment and follow-up plan",
    };
  }

  if (flag === "REACTIVE") {
    return {
      interpretation: ar ? "نتيجة إيجابية" : "Reactive result",
      action: def?.sensitive
        ? ar
          ? "تحويل عاجل للطبيب مع الحفاظ على السرّية"
          : "Urgent clinician referral, confidentiality maintained"
        : ar
          ? "مراجعة الطبيب"
          : "Clinician review",
    };
  }

  if (flag === "NON_REACTIVE") {
    return {
      interpretation: ar ? "نتيجة سلبية" : "Non-reactive",
      action: ar ? "لا إجراء" : "No action",
    };
  }

  if (flag === "CRITICAL_HIGH" || flag === "CRITICAL_LOW") {
    return {
      interpretation: ar ? "قيمة حرجة" : "Critical value",
      action: ar
        ? "تبليغ فوري وتوثيق من تم تبليغه والإجراء"
        : "Notify immediately and record who was told and what was done",
    };
  }

  if (flag === "HIGH" || flag === "LOW") {
    return {
      interpretation: ar
        ? flag === "HIGH"
          ? "أعلى من المدى المرجعي"
          : "أقل من المدى المرجعي"
        : flag === "HIGH"
          ? "Above the reference range"
          : "Below the reference range",
      action: def?.reviewWhenAbnormal
        ? ar
          ? "عرض على الطبيب"
          : "Refer to clinician"
        : ar
          ? "متابعة روتينية"
          : "Routine follow-up",
    };
  }

  if (flag === "INDETERMINATE") {
    return {
      interpretation: ar ? "نتيجة غير حاسمة" : "Indeterminate",
      action: ar ? "إعادة الفحص" : "Repeat the test",
    };
  }

  if (flag === "NORMAL") {
    return {
      interpretation: ar ? "ضمن المدى الطبيعي" : "Within range",
      action: ar ? "لا إجراء" : "No action",
    };
  }

  return {
    interpretation: ar
      ? "لا يمكن تفسيرها آلياً"
      : "Cannot be interpreted automatically",
    action: ar
      ? "تحقق من القيمة والمدى المرجعي"
      : "Check the value and reference range",
  };
}

// ---------------------------------------------------------------- vital signs

export type VitalKey =
  | "tempC"
  | "systolic"
  | "diastolic"
  | "pulse"
  | "respRate"
  | "spo2";

const VITAL_RANGES: Record<VitalKey, { low: number; high: number }> = {
  tempC: { low: 36.0, high: 37.5 },
  systolic: { low: 90, high: 139 },
  diastolic: { low: 60, high: 89 },
  pulse: { low: 60, high: 100 },
  respRate: { low: 12, high: 20 },
  spo2: { low: 95, high: 100 },
};

export function vitalOutOfRange(
  key: VitalKey,
  value: number | null | undefined,
): boolean {
  if (value === null || value === undefined) return false;
  const r = VITAL_RANGES[key];
  return value < r.low || value > r.high;
}

export function vitalRangeText(key: VitalKey): string {
  const r = VITAL_RANGES[key];
  return `${r.low} – ${r.high}`;
}

// ---------------------------------------------------------------- record completeness

export const COMPLETENESS_FIELDS = [
  "nationalId",
  "name",
  "dob",
  "gender",
  "phone",
  "employeeNo",
  "department",
  "jobTitle",
  "hireDate",
  "bloodType",
] as const;

export type CompletenessField = (typeof COMPLETENESS_FIELDS)[number];

export const COMPLETENESS_LABELS: Record<
  CompletenessField,
  { ar: string; en: string }
> = {
  nationalId: { ar: "رقم الهوية", en: "National ID" },
  name: { ar: "الاسم", en: "Name" },
  dob: { ar: "تاريخ الميلاد", en: "Date of birth" },
  gender: { ar: "الجنس", en: "Sex" },
  phone: { ar: "الجوال", en: "Mobile" },
  employeeNo: { ar: "الرقم الوظيفي", en: "Employee number" },
  department: { ar: "القسم", en: "Department" },
  jobTitle: { ar: "المسمى الوظيفي", en: "Job title" },
  hireDate: { ar: "تاريخ التعيين", en: "Hire date" },
  bloodType: { ar: "فصيلة الدم", en: "Blood group" },
};

/**
 * "Record completeness" is meaningless without a written definition, so here it is:
 * the share of the ten fields above that carry a value. Nothing else counts.
 */
export function completeness(
  employee: Partial<Record<CompletenessField, unknown>>,
): {
  score: number;
  missing: CompletenessField[];
} {
  const missing = COMPLETENESS_FIELDS.filter((f) => {
    const v = employee[f];
    return v === null || v === undefined || v === "";
  });
  return {
    score: Math.round(
      ((COMPLETENESS_FIELDS.length - missing.length) /
        COMPLETENESS_FIELDS.length) *
        100,
    ),
    missing,
  };
}
