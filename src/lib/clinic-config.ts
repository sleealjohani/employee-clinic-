import { z } from "zod";

export const PROFILE_FIELDS = [
  "dob",
  "gender",
  "phone",
  "email",
  "employeeNo",
  "department",
  "jobTitle",
  "hireDate",
  "nationality",
  "qualification",
  "employmentType",
  "workLocation",
] as const;
export const clinicConfigSchema = z
  .object({
    nameAr: z.string().trim().min(2).max(100),
    nameEn: z.string().trim().min(2).max(100),
    welcomeAr: z.string().trim().max(300),
    welcomeEn: z.string().trim().max(300),
    contactPhone: z.string().trim().max(30),
    locationAr: z.string().trim().max(160),
    locationEn: z.string().trim().max(160),
    accent: z.enum(["teal", "blue", "violet"]),
    motion: z.boolean(),
    employeeBooking: z.boolean(),
    autoConfirm: z.boolean(),
    workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    opensAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    slotMinutes: z.number().int().min(10).max(60),
    capacity: z.number().int().min(1).max(20),
    bookingDays: z.number().int().min(1).max(90),
    minimumNoticeHours: z.number().int().min(0).max(72),
    cancellationHours: z.number().int().min(0).max(48),
    maxActiveBookings: z.number().int().min(1).max(10),
    requiredProfileFields: z.array(z.enum(PROFILE_FIELDS)).min(1),
  })
  .refine((v) => v.opensAt < v.closesAt, {
    path: ["closesAt"],
    message: "invalid_hours",
  });

export type ClinicConfig = z.infer<typeof clinicConfigSchema>;
export const DEFAULT_CLINIC_CONFIG: ClinicConfig = {
  nameAr: "عيادة الموظفين",
  nameEn: "Employee Clinic",
  welcomeAr: "رعاية متصلة، لكل من يعتني بالآخرين.",
  welcomeEn: "Connected care for the people who care.",
  contactPhone: "",
  locationAr: "مستشفى الحديثة العام",
  locationEn: "Alhadithah General Hospital",
  accent: "teal",
  motion: true,
  employeeBooking: true,
  autoConfirm: true,
  workingDays: [0, 1, 2, 3, 4],
  opensAt: "08:00",
  closesAt: "14:00",
  slotMinutes: 20,
  capacity: 1,
  bookingDays: 30,
  minimumNoticeHours: 1,
  cancellationHours: 2,
  maxActiveBookings: 3,
  requiredProfileFields: [
    "dob",
    "gender",
    "phone",
    "employeeNo",
    "department",
    "jobTitle",
    "hireDate",
  ],
};

export function profileCompletion(
  employee: Partial<Record<(typeof PROFILE_FIELDS)[number], unknown>>,
  fields: ClinicConfig["requiredProfileFields"],
) {
  const missing = fields.filter(
    (key) =>
      employee[key] === null ||
      employee[key] === undefined ||
      employee[key] === "",
  );
  return {
    missing,
    total: fields.length,
    completed: fields.length - missing.length,
    percent: Math.round(
      ((fields.length - missing.length) / fields.length) * 100,
    ),
  };
}

export function clinicDay(date = new Date()): string {
  return new Date(date.getTime() + 3 * 3600000).toISOString().slice(0, 10);
}
export function clinicDateTime(day: string, time = "00:00"): Date {
  return new Date(day + "T" + time + ":00+03:00");
}
export function validDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const d = clinicDateTime(day);
  return Number.isFinite(d.getTime()) && clinicDay(d) === day;
}
