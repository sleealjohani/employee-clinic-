import type { LabFlag, Comparison } from "@prisma/client";
import { sameUnit } from "./numeric";
/**
 * Conservative record summary, not a diagnosis or occupational clearance.
 * Standard three-dose series only; alternative products require clinician review.
 * References: CDC hepatitis-b/hcp/infection-control and Pink Book chapter 10.
 * Never infer infection from a reactive screening test, or non-response from row counts.
 */
export type HbvStatus =
  | "PROTECTED"
  | "REVIEW_REQUIRED"
  | "SERIES_INCOMPLETE"
  | "NO_DATA";
export type HbvLab = {
  testCode: string;
  flag: LabFlag;
  valueNum: number | null;
  collectedAt: Date | null;
  unit?: string | null;
  comparator?: Comparison;
  reviewedAt?: Date | null;
};
export type HbvDose = { doseNumber: number; givenAt: Date };
export type HbvResult = {
  status: HbvStatus;
  basis: string[];
  antiHbsValue: number | null;
  doses: number;
};
const DAY = 86400000;
export function hbvStatus(
  labs: HbvLab[],
  doseInput: HbvDose[] | number,
  locale: "ar" | "en" = "ar",
): HbvResult {
  const ar = locale === "ar",
    doses = typeof doseInput === "number" ? [] : doseInput;
  const ordered = [...labs].sort(
    (a, b) => (b.collectedAt?.getTime() || 0) - (a.collectedAt?.getTime() || 0),
  );
  const anti = ordered.find((l) => l.testCode === "ANTI_HBS"),
    hbsag = ordered.find((l) => l.testCode === "HBSAG");
  const recorded = new Set(doses.map((d) => d.doseNumber)).size;
  const result = (status: HbvStatus, basis: string[]): HbvResult => ({
    status,
    basis,
    antiHbsValue: anti?.valueNum ?? null,
    doses: recorded,
  });
  if (hbsag?.flag === "REACTIVE")
    return result("REVIEW_REQUIRED", [
      ar
        ? "فحص HBsAg تفاعلي؛ يلزم تقييم الطبيب والتأكيد."
        : "Reactive HBsAg screening requires clinical assessment and confirmation.",
    ]);
  if (!doses.length && !anti) return result("NO_DATA", []);
  const series = [1, 2, 3].map(
    (n) =>
      doses
        .filter(
          (d) => d.doseNumber === n && Number.isFinite(d.givenAt.getTime()),
        )
        .sort((a, b) => a.givenAt.getTime() - b.givenAt.getTime())[0],
  );
  const complete =
    series.every(Boolean) &&
    series[1].givenAt.getTime() - series[0].givenAt.getTime() >= 28 * DAY &&
    series[2].givenAt.getTime() - series[1].givenAt.getTime() >= 56 * DAY &&
    series[2].givenAt.getTime() - series[0].givenAt.getTime() >= 112 * DAY;
  if (complete) {
    // Preserve a documented historical response when a later titre has waned.
    const response = ordered.find(
      (l) =>
        l.testCode === "ANTI_HBS" &&
        l.reviewedAt &&
        l.collectedAt &&
        l.valueNum !== null &&
        Number.isFinite(l.valueNum) &&
        (sameUnit(l.unit, "mIU/mL") || sameUnit(l.unit, "IU/L")) &&
        (!l.comparator ||
          l.comparator === "EQ" ||
          l.comparator === "GE" ||
          l.comparator === "GT") &&
        l.valueNum >= 10 &&
        l.collectedAt.getTime() - series[2].givenAt.getTime() >= 28 * DAY &&
        l.collectedAt.getTime() - series[2].givenAt.getTime() <= 62 * DAY,
    );
    if (response)
      return result("PROTECTED", [
        ar
          ? "استجابة موثقة بعد سلسلة من ثلاث جرعات؛ تُراجع الظروف السريرية عند الحاجة."
          : "Documented response after a three-dose series; clinical circumstances require individual assessment.",
      ]);
  }
  if (anti || recorded >= 3)
    return result("REVIEW_REQUIRED", [
      ar
        ? "يلزم التحقق من توقيت الفحص والوحدة وسجل الجرعات قبل تقرير الحالة."
        : "Verify test timing, units and vaccination history before determining status.",
    ]);
  return result("SERIES_INCOMPLETE", [
    ar
      ? "سجل سلسلة التطعيم غير مكتمل."
      : "Vaccination series documentation is incomplete.",
  ]);
}
export function hbvTone(
  status: HbvStatus,
): "ok" | "warn" | "danger" | "neutral" {
  return status === "PROTECTED"
    ? "ok"
    : status === "NO_DATA"
      ? "neutral"
      : "warn";
}
