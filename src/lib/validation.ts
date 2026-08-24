import { z } from "zod";

/**
 * Saudi national / Iqama identity number check.
 *
 * Ten digits with a Luhn-style check digit; 1 = citizen, 2 = resident.
 * Other formats (some contractor or border numbers) are accepted but flagged,
 * because rejecting a real employee is worse than a soft warning — while a
 * failed checksum on a 1/2 number is almost always a transcription error and
 * must never silently become a patient identifier.
 */
export function validateNationalId(raw: string | null | undefined): {
  valid: boolean;
  known: boolean;
  reason?: "LENGTH" | "NON_NUMERIC" | "PREFIX" | "CHECKSUM";
} {
  const id = (raw ?? "").trim();
  if (!/^\d+$/.test(id)) return { valid: false, known: true, reason: "NON_NUMERIC" };
  if (id.length !== 10) return { valid: false, known: true, reason: "LENGTH" };
  if (!["1", "2"].includes(id[0])) {
    // Unknown scheme — we cannot verify it, so we do not claim it is wrong.
    return { valid: true, known: false, reason: "PREFIX" };
  }

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const digit = Number(id[i]);
    if (i % 2 === 0) {
      const doubled = digit * 2;
      sum += Math.floor(doubled / 10) + (doubled % 10);
    } else {
      sum += digit;
    }
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(id[9])
    ? { valid: true, known: true }
    : { valid: false, known: true, reason: "CHECKSUM" };
}

export const nationalIdSchema = z
  .string()
  .trim()
  .min(5, "required")
  .max(20)
  .refine((v) => validateNationalId(v).valid, { message: "invalid_national_id" });

const optionalString = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? new Date(v) : undefined))
  .refine((v) => v === undefined || !Number.isNaN(v.getTime()), { message: "invalid_date" });

const optionalNumber = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === "" || v === undefined ? undefined : Number(v)))
  .refine((v) => v === undefined || !Number.isNaN(v), { message: "invalid_number" });

export const employeeSchema = z.object({
  nationalId: nationalIdSchema,
  name: z.string().trim().min(2).max(160),
  nameEn: optionalString,
  dob: optionalDate,
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  phone: optionalString,
  email: optionalString,
  employeeNo: optionalString,
  department: optionalString,
  jobTitle: optionalString,
  employmentStatus: z.enum(["ACTIVE", "ON_LEAVE", "SUSPENDED", "TERMINATED"]).default("ACTIVE"),
  hireDate: optionalDate,
  bloodType: optionalString,
  chronicConditions: z.string().optional(),
  currentMedications: z.string().optional(),
});

export const visitSchema = z.object({
  employeeId: z.string().min(1),
  visitDate: z.string().min(1),
  type: z.enum([
    "ACUTE_CARE",
    "FOLLOW_UP",
    "PRE_EMPLOYMENT",
    "PERIODIC",
    "INJURY",
    "EXPOSURE",
    "VACCINATION",
    "CONSULTATION",
    "OTHER",
  ]),
  chiefComplaint: optionalString,
  diagnosis: optionalString,
  plan: optionalString,
  notes: optionalString,
  tempC: optionalNumber,
  systolic: optionalNumber,
  diastolic: optionalNumber,
  pulse: optionalNumber,
  respRate: optionalNumber,
  spo2: optionalNumber,
  weightKg: optionalNumber,
  heightCm: optionalNumber,
});

export const labSchema = z.object({
  employeeId: z.string().min(1),
  testCode: z.string().min(1),
  resultType: z.enum(["QUANTITATIVE", "QUALITATIVE"]),
  valueNum: optionalNumber,
  valueText: optionalString,
  unit: optionalString,
  refLow: optionalNumber,
  refHigh: optionalNumber,
  refText: optionalString,
  collectedAt: optionalDate,
  verifiedAt: optionalDate,
  orderNo: optionalString,
  sampleNo: optionalString,
  performedBy: optionalString,
  verifiedBy: optionalString,
  labName: optionalString,
});

export const allergySchema = z.object({
  employeeId: z.string().min(1),
  type: z.enum(["DRUG", "FOOD", "ENVIRONMENT", "LATEX", "INSECT", "OTHER"]),
  substance: z.string().trim().min(1).max(160),
  severity: z.enum(["MILD", "MODERATE", "SEVERE", "LIFE_THREATENING"]),
  reaction: optionalString,
  action: optionalString,
  certainty: z.enum(["CONFIRMED", "SUSPECTED"]),
  allergyStatus: z.enum(["ACTIVE", "RESOLVED", "REFUTED"]),
  notes: optionalString,
});

export const vaccinationSchema = z.object({
  employeeId: z.string().min(1),
  vaccineCode: z.string().min(1),
  doseNumber: z.coerce.number().int().min(1).max(20),
  givenAt: z.string().min(1),
  lotNumber: optionalString,
  site: optionalString,
  provider: optionalString,
  nextDueAt: optionalDate,
  notes: optionalString,
});

export const educationSchema = z.object({
  employeeId: z.string().min(1),
  topic: z.string().trim().min(1).max(160),
  method: optionalString,
  providedAt: z.string().min(1),
  notes: optionalString,
});

export const noteSchema = z.object({
  employeeId: z.string().min(1),
  body: z.string().trim().min(1).max(4000),
  isPinned: z.coerce.boolean().optional(),
});

export const userSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, "invalid_username"),
  name: z.string().trim().min(2).max(120),
  email: optionalString,
  role: z.enum(["ADMIN", "STAFF", "VIEWER"]),
});

export function formToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

export function splitList(value: string | undefined | null): string[] {
  if (!value) return [];
  return value
    .split(/[،,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
}
