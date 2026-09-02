"use server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { clinicConfigSchema } from "@/lib/clinic-config";
import { actionError, type ResultState } from "@/lib/action-result";
import { z } from "zod";

export async function saveClinicSettings(
  _prev: ResultState,
  form: FormData,
): Promise<ResultState> {
  const user = await requirePermission("users.manage");
  const raw = Object.fromEntries(form.entries());
  const data = {
    ...raw,
    workingDays: form.getAll("workingDays").map(Number),
    requiredProfileFields: form.getAll("requiredProfileFields"),
    motion: form.get("motion") === "on",
    employeeBooking: form.get("employeeBooking") === "on",
    autoConfirm: form.get("autoConfirm") === "on",
    slotMinutes: Number(raw.slotMinutes),
    capacity: Number(raw.capacity),
    bookingDays: Number(raw.bookingDays),
    minimumNoticeHours: Number(raw.minimumNoticeHours),
    cancellationHours: Number(raw.cancellationHours),
    maxActiveBookings: Number(raw.maxActiveBookings),
  };
  const parsed = clinicConfigSchema.safeParse(data);
  if (!parsed.success) return { error: "v2.invalidSettings" };
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('clinic-scheduling'))`;
      await tx.setting.upsert({
        where: { key: "clinic.config.v2" },
        create: { key: "clinic.config.v2", value: JSON.stringify(parsed.data) },
        update: { value: JSON.stringify(parsed.data) },
      });
      await writeAudit(
        {
          user,
          action: "UPDATE",
          entity: "Setting",
          entityId: "clinic.config.v2",
          summary: "تحديث إعدادات العيادة",
        },
        tx,
      );
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}
const serviceSchema = z.object({
  nameAr: z.string().trim().min(2).max(100),
  nameEn: z.string().trim().min(2).max(100),
  descriptionAr: z.string().trim().max(500),
  descriptionEn: z.string().trim().max(500),
  mode: z.enum(["APPOINTMENT", "REQUEST"]),
  visitType: z.enum([
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
  durationMinutes: z.coerce.number().int().min(10).max(180),
  sortOrder: z.coerce.number().int().min(0).max(999),
  isActive: z.boolean(),
});
export async function saveService(
  _prev: ResultState,
  form: FormData,
): Promise<ResultState> {
  const user = await requirePermission("users.manage");
  const parsed = serviceSchema.safeParse({
    ...Object.fromEntries(form.entries()),
    isActive: form.get("isActive") === "on",
  });
  if (!parsed.success) return { error: "v2.invalid" };
  const id = String(form.get("id") ?? "");
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('clinic-scheduling'))`;
      const service = id
        ? await tx.clinicService.update({ where: { id }, data: parsed.data })
        : await tx.clinicService.create({
            data: { ...parsed.data, slug: "custom-" + crypto.randomUUID() },
          });
      await writeAudit(
        {
          user,
          action: id ? "UPDATE" : "CREATE",
          entity: "ClinicService",
          entityId: service.id,
          summary: "تحديث دليل خدمات العيادة",
        },
        tx,
      );
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}
