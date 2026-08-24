"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/current-user";
import { employeeSchema, formToObject, splitList, validateNationalId } from "@/lib/validation";

export type ActionState = { error?: string; ok?: boolean; fieldErrors?: Record<string, string> };

function toData(parsed: ReturnType<typeof employeeSchema.parse>) {
  return {
    nationalId: parsed.nationalId,
    name: parsed.name,
    nameEn: parsed.nameEn ?? null,
    dob: parsed.dob ?? null,
    gender: parsed.gender ?? null,
    phone: parsed.phone ?? null,
    email: parsed.email ?? null,
    employeeNo: parsed.employeeNo ?? null,
    department: parsed.department ?? null,
    jobTitle: parsed.jobTitle ?? null,
    employmentStatus: parsed.employmentStatus,
    hireDate: parsed.hireDate ?? null,
    bloodType: parsed.bloodType ?? null,
    chronicConditions: splitList(parsed.chronicConditions),
    currentMedications: splitList(parsed.currentMedications),
  };
}

export async function createEmployeeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission("employee.write");
  const parsed = employeeSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: issue?.message === "invalid_national_id" ? "emp.invalidId" : "common.error",
      fieldErrors: { [String(issue?.path[0] ?? "")]: issue?.message ?? "" },
    };
  }

  const existing = await db.employee.findUnique({ where: { nationalId: parsed.data.nationalId } });
  if (existing) return { error: "emp.duplicateId" };

  const employee = await db.employee.create({
    data: { ...toData(parsed.data), createdById: user.id },
  });

  await db.employmentHistory.create({
    data: {
      employeeId: employee.id,
      department: employee.department,
      jobTitle: employee.jobTitle,
      employeeNo: employee.employeeNo,
      status: employee.employmentStatus,
    },
  });

  await writeAudit({
    user,
    action: "CREATE",
    entity: "Employee",
    entityId: employee.id,
    summary: `إنشاء ملف الموظف ${employee.name}`,
  });

  revalidatePath("/employees");
  redirect(`/employees/${employee.id}`);
}

export async function updateEmployeeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission("employee.write");
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "common.error" };

  const parsed = employeeSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue?.message === "invalid_national_id" ? "emp.invalidId" : "common.error" };
  }

  const before = await db.employee.findUnique({ where: { id } });
  if (!before) return { error: "common.error" };

  const clash = await db.employee.findUnique({ where: { nationalId: parsed.data.nationalId } });
  if (clash && clash.id !== id) return { error: "emp.duplicateId" };

  const data = toData(parsed.data);
  const employee = await db.employee.update({ where: { id }, data });

  // Employment facts change over time; keep the history rather than overwriting it.
  const employmentChanged =
    before.department !== employee.department ||
    before.jobTitle !== employee.jobTitle ||
    before.employeeNo !== employee.employeeNo ||
    before.employmentStatus !== employee.employmentStatus;

  if (employmentChanged) {
    const open = await db.employmentHistory.findFirst({
      where: { employeeId: id, effectiveTo: null },
      orderBy: { effectiveFrom: "desc" },
    });
    if (open) {
      await db.employmentHistory.update({ where: { id: open.id }, data: { effectiveTo: new Date() } });
    }
    await db.employmentHistory.create({
      data: {
        employeeId: id,
        department: employee.department,
        jobTitle: employee.jobTitle,
        employeeNo: employee.employeeNo,
        status: employee.employmentStatus,
      },
    });
  }

  await writeAudit({
    user,
    action: "UPDATE",
    entity: "Employee",
    entityId: id,
    summary: `تعديل بيانات الموظف ${employee.name}`,
    meta: { employmentChanged },
  });

  revalidatePath(`/employees/${id}`);
  revalidatePath("/employees");
  redirect(`/employees/${id}`);
}

/** Archiving, never deletion — a clinical record does not disappear. */
export async function archiveEmployeeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission("employee.archive");
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id || reason.length < 3) return { error: "common.required" };

  const employee = await db.employee.update({
    where: { id },
    data: { isArchived: true, archivedAt: new Date(), archiveReason: reason },
  });

  await writeAudit({
    user,
    action: "ARCHIVE",
    entity: "Employee",
    entityId: id,
    summary: `أرشفة ملف ${employee.name}: ${reason}`,
  });

  revalidatePath("/employees");
  revalidatePath(`/employees/${id}`);
  return { ok: true };
}

export async function restoreEmployeeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission("employee.archive");
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "common.error" };

  const employee = await db.employee.update({
    where: { id },
    data: { isArchived: false, archivedAt: null, archiveReason: null },
  });

  await writeAudit({
    user,
    action: "RESTORE",
    entity: "Employee",
    entityId: id,
    summary: `إعادة تنشيط ملف ${employee.name}`,
  });

  revalidatePath("/employees");
  revalidatePath(`/employees/${id}`);
  return { ok: true };
}

/** Used by the import review screen before a national ID is committed. */
export async function checkNationalId(value: string): Promise<{ valid: boolean; known: boolean }> {
  const result = validateNationalId(value);
  return { valid: result.valid, known: result.known };
}
