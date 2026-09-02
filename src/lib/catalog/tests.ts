import type { Gender, ResultType } from "@prisma/client";

/**
 * Controlled vocabulary for laboratory tests.
 *
 * This exists so "HBsAg", "Hepatitis B Surface Antigen" and "الأجسام السطحية"
 * can never become three different rows. Every result — typed or extracted —
 * must resolve to one of these codes, and the extractor is given exactly this
 * list as a closed enum.
 */

export type RefRange = {
  low?: number;
  high?: number;
  criticalLow?: number;
  criticalHigh?: number;
};

export type TestCategory = "SEROLOGY" | "HEMATOLOGY" | "CHEMISTRY" | "VITAMIN" | "SCREENING";

export type TestDef = {
  code: string;
  nameAr: string;
  nameEn: string;
  category: TestCategory;
  resultType: ResultType;
  unit?: string;
  ref?: RefRange;
  refBySex?: Record<Gender, RefRange>;
  /** For qualitative tests: which outcome is the clinically abnormal one. */
  abnormalIs?: "REACTIVE" | "NON_REACTIVE";
  /** Extra confidentiality: never shown in aggregate exports, access is logged. */
  sensitive?: boolean;
  /** Any abnormal value on this test is routed to a clinician. */
  reviewWhenAbnormal?: boolean;
  /** Suggested repeat interval in months, used by the due engine. */
  repeatMonths?: number;
  /** Free-text spellings the extractor may see on a printed report. */
  aliases: string[];
};

export const TESTS: TestDef[] = [
  // ---------------------------------------------------------------- serology
  {
    code: "HBSAG",
    nameAr: "المستضد السطحي لالتهاب الكبد B",
    nameEn: "HBsAg",
    category: "SEROLOGY",
    resultType: "QUALITATIVE",
    abnormalIs: "REACTIVE",
    sensitive: true,
    reviewWhenAbnormal: true,
    // "hep bs ag" is how the MOH Regional Laboratory of Qurayyat prints it, and
    // it is far enough from "hbs ag" that neither the alias index nor the
    // printed-report matcher recognised it.
    aliases: ["hbsag", "hbs ag", "hep bs ag", "hepatitis b surface antigen", "australia antigen", "hbv surface antigen"],
  },
  {
    code: "ANTI_HBS",
    nameAr: "الأجسام المضادة للمستضد السطحي (Anti-HBs)",
    nameEn: "Anti-HBs",
    category: "SEROLOGY",
    resultType: "QUANTITATIVE",
    unit: "mIU/mL",
    // ≥10 mIU/mL is the accepted protection threshold; there is no upper limit.
    ref: { low: 10 },
    reviewWhenAbnormal: false,
    aliases: ["anti-hbs", "anti hbs", "hbsab", "hbs ab", "hepatitis b surface antibody", "hbsag antibody"],
  },
  {
    code: "ANTI_HBC_TOTAL",
    nameAr: "الأجسام المضادة الكلية للنواة (Anti-HBc Total)",
    nameEn: "Anti-HBc Total",
    category: "SEROLOGY",
    resultType: "QUALITATIVE",
    abnormalIs: "REACTIVE",
    sensitive: true,
    reviewWhenAbnormal: true,
    aliases: ["anti-hbc", "anti hbc", "hbcab", "hepatitis b core antibody", "anti-hbc total"],
  },
  {
    code: "ANTI_HCV",
    nameAr: "الأجسام المضادة لالتهاب الكبد C",
    nameEn: "Anti-HCV",
    category: "SEROLOGY",
    resultType: "QUALITATIVE",
    abnormalIs: "REACTIVE",
    sensitive: true,
    reviewWhenAbnormal: true,
    aliases: ["anti-hcv", "anti hcv", "hcv ab", "hepatitis c antibody", "hcv antibody"],
  },
  {
    code: "HIV_AGAB",
    nameAr: "فحص فيروس نقص المناعة (Ag/Ab)",
    nameEn: "HIV Ag/Ab",
    category: "SEROLOGY",
    resultType: "QUALITATIVE",
    abnormalIs: "REACTIVE",
    sensitive: true,
    reviewWhenAbnormal: true,
    aliases: ["hiv", "hiv ag/ab", "hiv combo", "hiv 1/2", "hiv antigen antibody", "hiv duo"],
  },

  // ---------------------------------------------------------------- haematology
  {
    code: "WBC",
    nameAr: "كريات الدم البيضاء",
    nameEn: "WBC",
    category: "HEMATOLOGY",
    resultType: "QUANTITATIVE",
    unit: "10^3/µL",
    ref: { low: 4.0, high: 11.0, criticalLow: 2.0, criticalHigh: 30.0 },
    aliases: ["wbc", "white blood cells", "leukocytes", "total leucocyte count", "tlc"],
  },
  {
    code: "RBC",
    nameAr: "كريات الدم الحمراء",
    nameEn: "RBC",
    category: "HEMATOLOGY",
    resultType: "QUANTITATIVE",
    unit: "10^6/µL",
    refBySex: { MALE: { low: 4.5, high: 5.9 }, FEMALE: { low: 4.1, high: 5.1 } },
    aliases: ["rbc", "red blood cells", "erythrocytes"],
  },
  {
    code: "HGB",
    nameAr: "الهيموغلوبين",
    nameEn: "Haemoglobin",
    category: "HEMATOLOGY",
    resultType: "QUANTITATIVE",
    unit: "g/dL",
    refBySex: {
      MALE: { low: 13.0, high: 17.0, criticalLow: 7.0, criticalHigh: 20.0 },
      FEMALE: { low: 12.0, high: 15.5, criticalLow: 7.0, criticalHigh: 20.0 },
    },
    reviewWhenAbnormal: true,
    aliases: ["hgb", "hb", "haemoglobin", "hemoglobin"],
  },
  {
    code: "HCT",
    nameAr: "الهيماتوكريت",
    nameEn: "Haematocrit",
    category: "HEMATOLOGY",
    resultType: "QUANTITATIVE",
    unit: "%",
    refBySex: { MALE: { low: 40, high: 52 }, FEMALE: { low: 36, high: 46 } },
    aliases: ["hct", "haematocrit", "hematocrit", "pcv"],
  },
  {
    code: "PLT",
    nameAr: "الصفائح الدموية",
    nameEn: "Platelets",
    category: "HEMATOLOGY",
    resultType: "QUANTITATIVE",
    unit: "10^3/µL",
    ref: { low: 150, high: 450, criticalLow: 50, criticalHigh: 1000 },
    reviewWhenAbnormal: true,
    aliases: ["plt", "platelet", "platelets", "platelet count"],
  },
  {
    code: "MCV",
    nameAr: "متوسط حجم الكرية",
    nameEn: "MCV",
    category: "HEMATOLOGY",
    resultType: "QUANTITATIVE",
    unit: "fL",
    ref: { low: 80, high: 100 },
    aliases: ["mcv", "mean corpuscular volume"],
  },
  {
    code: "MCH",
    nameAr: "متوسط هيموغلوبين الكرية",
    nameEn: "MCH",
    category: "HEMATOLOGY",
    resultType: "QUANTITATIVE",
    unit: "pg",
    ref: { low: 27, high: 33 },
    aliases: ["mch", "mean corpuscular haemoglobin"],
  },
  {
    code: "MCHC",
    nameAr: "تركيز هيموغلوبين الكرية",
    nameEn: "MCHC",
    category: "HEMATOLOGY",
    resultType: "QUANTITATIVE",
    unit: "g/dL",
    ref: { low: 32, high: 36 },
    aliases: ["mchc"],
  },
  {
    code: "NEUT_PCT",
    nameAr: "العدلات %",
    nameEn: "Neutrophils %",
    category: "HEMATOLOGY",
    resultType: "QUANTITATIVE",
    unit: "%",
    ref: { low: 40, high: 70 },
    aliases: ["neutrophils", "neut %", "neutrophil %", "segmented neutrophils"],
  },
  {
    code: "LYMPH_PCT",
    nameAr: "اللمفاويات %",
    nameEn: "Lymphocytes %",
    category: "HEMATOLOGY",
    resultType: "QUANTITATIVE",
    unit: "%",
    ref: { low: 20, high: 45 },
    aliases: ["lymphocytes", "lymph %", "lymphocyte %"],
  },

  // ---------------------------------------------------------------- chemistry
  {
    code: "HBA1C",
    nameAr: "السكر التراكمي",
    nameEn: "HbA1c",
    category: "CHEMISTRY",
    resultType: "QUANTITATIVE",
    unit: "%",
    ref: { low: 4.0, high: 5.6, criticalHigh: 10.0 },
    reviewWhenAbnormal: true,
    repeatMonths: 6,
    aliases: ["hba1c", "hb a1c", "glycated haemoglobin", "glycosylated hemoglobin", "a1c"],
  },
  {
    code: "FBS",
    nameAr: "سكر الدم الصائم",
    nameEn: "Fasting blood glucose",
    category: "CHEMISTRY",
    resultType: "QUANTITATIVE",
    unit: "mg/dL",
    ref: { low: 70, high: 99, criticalLow: 50, criticalHigh: 400 },
    reviewWhenAbnormal: true,
    aliases: ["fbs", "fasting blood sugar", "fasting glucose", "glucose fasting"],
  },
  {
    code: "ALT",
    nameAr: "إنزيم الكبد ALT",
    nameEn: "ALT (SGPT)",
    category: "CHEMISTRY",
    resultType: "QUANTITATIVE",
    unit: "U/L",
    ref: { low: 7, high: 56, criticalHigh: 500 },
    reviewWhenAbnormal: true,
    aliases: ["alt", "sgpt", "alanine aminotransferase"],
  },
  {
    code: "AST",
    nameAr: "إنزيم الكبد AST",
    nameEn: "AST (SGOT)",
    category: "CHEMISTRY",
    resultType: "QUANTITATIVE",
    unit: "U/L",
    ref: { low: 10, high: 40, criticalHigh: 500 },
    reviewWhenAbnormal: true,
    aliases: ["ast", "sgot", "aspartate aminotransferase"],
  },
  {
    code: "CREATININE",
    nameAr: "الكرياتينين",
    nameEn: "Creatinine",
    category: "CHEMISTRY",
    resultType: "QUANTITATIVE",
    unit: "mg/dL",
    ref: { low: 0.6, high: 1.3, criticalHigh: 4.0 },
    reviewWhenAbnormal: true,
    aliases: ["creatinine", "s. creatinine", "serum creatinine"],
  },
  {
    code: "TSH",
    nameAr: "هرمون الغدة الدرقية",
    nameEn: "TSH",
    category: "CHEMISTRY",
    resultType: "QUANTITATIVE",
    unit: "mIU/L",
    ref: { low: 0.4, high: 4.0 },
    reviewWhenAbnormal: true,
    aliases: ["tsh", "thyroid stimulating hormone"],
  },
  {
    code: "CHOL_TOTAL",
    nameAr: "الكوليسترول الكلي",
    nameEn: "Total cholesterol",
    category: "CHEMISTRY",
    resultType: "QUANTITATIVE",
    unit: "mg/dL",
    ref: { high: 200 },
    aliases: ["cholesterol", "total cholesterol", "t. cholesterol"],
  },
  {
    code: "TRIGLYCERIDES",
    nameAr: "الدهون الثلاثية",
    nameEn: "Triglycerides",
    category: "CHEMISTRY",
    resultType: "QUANTITATIVE",
    unit: "mg/dL",
    ref: { high: 150 },
    aliases: ["triglycerides", "tg"],
  },

  // ---------------------------------------------------------------- vitamins
  {
    code: "VIT_D",
    nameAr: "فيتامين د (25-OH)",
    nameEn: "Vitamin D (25-OH)",
    category: "VITAMIN",
    resultType: "QUANTITATIVE",
    unit: "ng/mL",
    ref: { low: 30, high: 100, criticalLow: 10 },
    repeatMonths: 6,
    aliases: ["vitamin d", "25-oh vitamin d", "25 hydroxy vitamin d", "vit d", "vitamin d3"],
  },
  {
    code: "VIT_B12",
    nameAr: "فيتامين ب١٢",
    nameEn: "Vitamin B12",
    category: "VITAMIN",
    resultType: "QUANTITATIVE",
    unit: "pg/mL",
    ref: { low: 200, high: 900 },
    aliases: ["vitamin b12", "b12", "cobalamin"],
  },

  // ---------------------------------------------------------------- screening
  {
    code: "TB_IGRA",
    nameAr: "فحص الدرن (IGRA)",
    nameEn: "TB IGRA",
    category: "SCREENING",
    resultType: "QUALITATIVE",
    abnormalIs: "REACTIVE",
    reviewWhenAbnormal: true,
    repeatMonths: 12,
    aliases: ["igra", "quantiferon", "tb gold", "t-spot", "tuberculosis igra"],
  },
  {
    code: "STOOL_CULTURE",
    nameAr: "مزرعة البراز",
    nameEn: "Stool culture",
    category: "SCREENING",
    resultType: "QUALITATIVE",
    abnormalIs: "REACTIVE",
    reviewWhenAbnormal: true,
    repeatMonths: 12,
    aliases: ["stool culture", "stool c/s", "salmonella shigella"],
  },
];

export const TEST_BY_CODE: Record<string, TestDef> = Object.fromEntries(
  TESTS.map((t) => [t.code, t]),
);

export const TEST_CODES = TESTS.map((t) => t.code);

const ALIAS_INDEX = new Map<string, string>();
for (const t of TESTS) {
  ALIAS_INDEX.set(t.code.toLowerCase(), t.code);
  ALIAS_INDEX.set(t.nameEn.toLowerCase(), t.code);
  ALIAS_INDEX.set(t.nameAr, t.code);
  for (const a of t.aliases) ALIAS_INDEX.set(a.toLowerCase(), t.code);
}

/** Resolve a printed test name to a catalogue code, or null if it is outside the catalogue. */
export function resolveTestCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (ALIAS_INDEX.has(key)) return ALIAS_INDEX.get(key)!;
  const squashed = key.replace(/[^a-z0-9؀-ۿ]/g, "");
  for (const [alias, code] of ALIAS_INDEX) {
    if (alias.replace(/[^a-z0-9؀-ۿ]/g, "") === squashed) return code;
  }
  return null;
}

export function testName(code: string, locale: "ar" | "en"): string {
  const def = TEST_BY_CODE[code];
  if (!def) return code;
  return locale === "ar" ? def.nameAr : def.nameEn;
}

export function refFor(def: TestDef, sex: Gender | null | undefined): RefRange | undefined {
  if (def.refBySex && sex) return def.refBySex[sex];
  return def.ref ?? def.refBySex?.MALE;
}

export function refText(def: TestDef, sex: Gender | null | undefined): string {
  const r = refFor(def, sex);
  if (!r) return "—";
  const unit = def.unit ? ` ${def.unit}` : "";
  if (r.low !== undefined && r.high !== undefined) return `${r.low} – ${r.high}${unit}`;
  if (r.low !== undefined) return `≥ ${r.low}${unit}`;
  if (r.high !== undefined) return `< ${r.high}${unit}`;
  return "—";
}

export const CATEGORY_LABEL: Record<TestCategory, { ar: string; en: string }> = {
  SEROLOGY: { ar: "المصليات", en: "Serology" },
  HEMATOLOGY: { ar: "أمراض الدم", en: "Haematology" },
  CHEMISTRY: { ar: "الكيمياء الحيوية", en: "Chemistry" },
  VITAMIN: { ar: "الفيتامينات", en: "Vitamins" },
  SCREENING: { ar: "الفحوصات المسحية", en: "Screening" },
};
