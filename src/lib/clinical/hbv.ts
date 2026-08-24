import type { LabFlag } from "@prisma/client";

/**
 * Hepatitis B protection status for a healthcare worker.
 *
 * Counting doses is not enough: protection is decided by the Anti-HBs titre.
 * ≥ 10 mIU/mL is protective; below that after two complete series the worker is
 * a non-responder and must be flagged permanently, because they stay
 * susceptible after any exposure no matter how many further doses they get.
 */

export type HbvStatus =
  | "PROTECTED"
  | "NON_RESPONDER"
  | "SUSCEPTIBLE"
  | "INFECTED"
  | "SERIES_INCOMPLETE"
  | "NO_DATA";

export type HbvLab = {
  testCode: string;
  flag: LabFlag;
  valueNum: number | null;
  collectedAt: Date | null;
};

export type HbvResult = {
  status: HbvStatus;
  basis: string[];
  antiHbsValue: number | null;
  doses: number;
};

const PROTECTIVE_TITRE = 10;

function latest(labs: HbvLab[], code: string): HbvLab | undefined {
  return labs
    .filter((l) => l.testCode === code)
    .sort((a, b) => (b.collectedAt?.getTime() ?? 0) - (a.collectedAt?.getTime() ?? 0))[0];
}

export function hbvStatus(labs: HbvLab[], hepBDoses: number, locale: "ar" | "en" = "ar"): HbvResult {
  const ar = locale === "ar";
  const basis: string[] = [];

  const hbsag = latest(labs, "HBSAG");
  const antiHbs = latest(labs, "ANTI_HBS");
  const antiHbsValue = antiHbs?.valueNum ?? null;

  if (hbsag?.flag === "REACTIVE") {
    basis.push(ar ? "HBsAg إيجابي" : "HBsAg reactive");
    return { status: "INFECTED", basis, antiHbsValue, doses: hepBDoses };
  }

  if (antiHbsValue !== null) {
    basis.push(`Anti-HBs = ${antiHbsValue} mIU/mL`);
    if (antiHbsValue >= PROTECTIVE_TITRE) {
      return { status: "PROTECTED", basis, antiHbsValue, doses: hepBDoses };
    }
    basis.push(ar ? `عدد الجرعات المسجّلة: ${hepBDoses}` : `${hepBDoses} recorded doses`);
    // Two full series (6 doses) with a titre still under 10 defines a non-responder.
    if (hepBDoses >= 6) {
      return { status: "NON_RESPONDER", basis, antiHbsValue, doses: hepBDoses };
    }
    if (hepBDoses >= 3) {
      return { status: "SUSCEPTIBLE", basis, antiHbsValue, doses: hepBDoses };
    }
    return { status: "SERIES_INCOMPLETE", basis, antiHbsValue, doses: hepBDoses };
  }

  if (hepBDoses > 0) {
    basis.push(ar ? `عدد الجرعات المسجّلة: ${hepBDoses}` : `${hepBDoses} recorded doses`);
    basis.push(ar ? "لا يوجد فحص Anti-HBs" : "No Anti-HBs result");
    return {
      status: hepBDoses >= 3 ? "SUSCEPTIBLE" : "SERIES_INCOMPLETE",
      basis,
      antiHbsValue,
      doses: hepBDoses,
    };
  }

  return { status: "NO_DATA", basis, antiHbsValue, doses: hepBDoses };
}

export function hbvTone(status: HbvStatus): "ok" | "warn" | "danger" | "neutral" {
  switch (status) {
    case "PROTECTED":
      return "ok";
    case "INFECTED":
    case "NON_RESPONDER":
      return "danger";
    case "SUSCEPTIBLE":
    case "SERIES_INCOMPLETE":
      return "warn";
    default:
      return "neutral";
  }
}
