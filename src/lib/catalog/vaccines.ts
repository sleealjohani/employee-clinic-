/**
 * Vaccine catalogue and dosing schedules.
 *
 * `intervalsMonths[i]` is the gap from dose i to dose i+1, so Hepatitis B
 * [1, 5] means dose 2 one month after dose 1 and dose 3 five months after
 * dose 2 — the standard 0/1/6 series. `boosterMonths` applies once the
 * series is complete (annual influenza, ten-yearly tetanus).
 */

export type VaccineDef = {
  code: string;
  nameAr: string;
  nameEn: string;
  doses: number;
  intervalsMonths: number[];
  boosterMonths?: number;
  /** Required for healthcare workers — drives the "immunisation incomplete" report. */
  occupational: boolean;
  note?: { ar: string; en: string };
};

export const VACCINES: VaccineDef[] = [
  {
    code: "HEP_B",
    nameAr: "لقاح التهاب الكبد B",
    nameEn: "Hepatitis B vaccine",
    doses: 3,
    intervalsMonths: [1, 5],
    occupational: true,
    note: {
      ar: "يُقاس Anti-HBs بعد ١–٢ شهر من الجرعة الأخيرة لتأكيد المناعة.",
      en: "Check Anti-HBs 1–2 months after the final dose to confirm protection.",
    },
  },
  {
    code: "INFLUENZA",
    nameAr: "لقاح الإنفلونزا الموسمية",
    nameEn: "Seasonal influenza",
    doses: 1,
    intervalsMonths: [],
    boosterMonths: 12,
    occupational: true,
  },
  {
    code: "COVID19",
    nameAr: "لقاح كوفيد-١٩",
    nameEn: "COVID-19 vaccine",
    doses: 2,
    intervalsMonths: [1],
    boosterMonths: 12,
    occupational: false,
  },
  {
    code: "TETANUS",
    nameAr: "لقاح الكزاز (Td/Tdap)",
    nameEn: "Tetanus (Td/Tdap)",
    doses: 1,
    intervalsMonths: [],
    boosterMonths: 120,
    occupational: true,
  },
  {
    code: "MMR",
    nameAr: "لقاح الحصبة والنكاف والحصبة الألمانية",
    nameEn: "MMR",
    doses: 2,
    intervalsMonths: [1],
    occupational: true,
  },
  {
    code: "VARICELLA",
    nameAr: "لقاح جدري الماء",
    nameEn: "Varicella",
    doses: 2,
    intervalsMonths: [2],
    occupational: true,
  },
  {
    code: "MENINGOCOCCAL",
    nameAr: "لقاح المكورات السحائية",
    nameEn: "Meningococcal",
    doses: 1,
    intervalsMonths: [],
    boosterMonths: 60,
    occupational: false,
  },
  {
    code: "OTHER",
    nameAr: "لقاح آخر",
    nameEn: "Other vaccine",
    doses: 1,
    intervalsMonths: [],
    occupational: false,
  },
];

export const VACCINE_BY_CODE: Record<string, VaccineDef> = Object.fromEntries(
  VACCINES.map((v) => [v.code, v]),
);

export const OCCUPATIONAL_VACCINES = VACCINES.filter((v) => v.occupational);

export function vaccineName(code: string, locale: "ar" | "en"): string {
  const v = VACCINE_BY_CODE[code];
  if (!v) return code;
  return locale === "ar" ? v.nameAr : v.nameEn;
}

export const INJECTION_SITES = [
  { code: "LEFT_DELTOID", ar: "العضلة الدالية اليسرى", en: "Left deltoid" },
  { code: "RIGHT_DELTOID", ar: "العضلة الدالية اليمنى", en: "Right deltoid" },
  { code: "LEFT_THIGH", ar: "الفخذ الأيسر", en: "Left thigh" },
  { code: "RIGHT_THIGH", ar: "الفخذ الأيمن", en: "Right thigh" },
  { code: "ORAL", ar: "عن طريق الفم", en: "Oral" },
];

export const EDUCATION_TOPICS = [
  { code: "HAND_HYGIENE", ar: "نظافة اليدين", en: "Hand hygiene" },
  { code: "NEEDLE_SAFETY", ar: "السلامة من الوخز بالإبر", en: "Needle-stick safety" },
  { code: "INFECTION_CONTROL", ar: "مكافحة العدوى", en: "Infection control" },
  { code: "BACK_CARE", ar: "العناية بالظهر ورفع المرضى", en: "Back care & safe lifting" },
  { code: "DIABETES", ar: "التثقيف عن السكري", en: "Diabetes education" },
  { code: "HYPERTENSION", ar: "التثقيف عن الضغط", en: "Hypertension education" },
  { code: "SMOKING", ar: "الإقلاع عن التدخين", en: "Smoking cessation" },
  { code: "NUTRITION", ar: "التغذية الصحية", en: "Nutrition" },
  { code: "PPE", ar: "استخدام معدات الوقاية", en: "PPE use" },
  { code: "OTHER", ar: "موضوع آخر", en: "Other" },
];

export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
