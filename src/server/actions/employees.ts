"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/current-user";
import {
  employeeSchema,
  formToObject,
  splitList,
  validateNationalId,
} from "@/lib/validation";
import { actionError, ClinicError } from "@/lib/action-result";
export type ActionState = {
  error?: string;
  ok?: boolean;
  fieldErrors?: Record<string, string>;
};
function toData(parsed: ReturnType<typeof employeeSchema.parse>) {
  return {
    ...parsed,
    nameEn: parsed.nameEn ?? null,
    dob: parsed.dob ?? null,
    gender: parsed.gender ?? null,
    phone: parsed.phone ?? null,
    email: parsed.email ?? null,
    employeeNo: parsed.employeeNo ?? null,
    department: parsed.department ?? null,
    jobTitle: parsed.jobTitle ?? null,
    hireDate: parsed.hireDate ?? null,
    bloodType: parsed.bloodType ?? null,
    nationality: parsed.nationality ?? null,
    qualification: parsed.qualification ?? null,
    employmentType: parsed.employmentType ?? null,
    assignedFacility: parsed.assignedFacility ?? null,
    workLocation: parsed.workLocation ?? null,
    personnelNotes: parsed.personnelNotes || null,
    chronicConditions: splitList(parsed.chronicConditions),
    currentMedications: splitList(parsed.currentMedications),
  };
}
function refresh(id: string) {
  for (const path of [
    "/employees",
    "/employees/" + id,
    "/dashboard",
    "/due",
    "/reports",
    "/portal",
  ])
    revalidatePath(path, "layout");
}
export async function createEmployeeAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requirePermission("employee.write"),
    parsed = employeeSchema.safeParse(formToObject(form));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error:
        issue?.message === "invalid_national_id"
          ? "emp.invalidId"
          : "v2.invalid",
      fieldErrors: { [String(issue?.path[0] || "")]: issue?.message || "" },
    };
  }
  let id = "";
  try {
    id = await db.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: { ...toData(parsed.data), createdById: user.id },
      });
      await tx.employmentHistory.create({
        data: {
          employeeId: employee.id,
          department: employee.department,
          jobTitle: employee.jobTitle,
          employeeNo: employee.employeeNo,
          status: employee.employmentStatus,
        },
      });
      await writeAudit(
        {
          user,
          action: "CREATE",
          entity: "Employee",
          entityId: employee.id,
          summary: "إنشاء ملف موظف",
        },
        tx,
      );
      return employee.id;
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002")
      return { error: "emp.duplicateId" };
    return actionError(e);
  }
  refresh(id);
  redirect("/employees/" + id);
}
export async function updateEmployeeAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requirePermission("employee.write"),
    id = String(form.get("id") || ""),
    stamp = String(form.get("updatedAt") || "");
  const parsed = employeeSchema.safeParse(formToObject(form));
  if (!parsed.success || !id) {
    const issue = !parsed.success ? parsed.error.issues[0] : undefined;
    return {
      error:
        issue?.message === "invalid_national_id"
          ? "emp.invalidId"
          : "v2.invalid",
      fieldErrors: { [String(issue?.path[0] || "")]: issue?.message || "" },
    };
  }
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('clinic-scheduling'))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"employee:" + id}))`;
      const before = await tx.employee.findUnique({ where: { id } });
      if (!before || before.isArchived) throw new ClinicError("v2.invalid");
      if (stamp && before.updatedAt.toISOString() !== stamp)
        throw new ClinicError("v2.conflict");
      const employee = await tx.employee.update({
        where: { id },
        data: toData(parsed.data),
      });
      const employmentChanged =
        before.department !== employee.department ||
        before.jobTitle !== employee.jobTitle ||
        before.employeeNo !== employee.employeeNo ||
        before.employmentStatus !== employee.employmentStatus;
      if (employmentChanged) {
        const now = new Date();
        await tx.employmentHistory.updateMany({
          where: { employeeId: id, effectiveTo: null },
          data: { effectiveTo: now },
        });
        await tx.employmentHistory.create({
          data: {
            employeeId: id,
            department: employee.department,
            jobTitle: employee.jobTitle,
            employeeNo: employee.employeeNo,
            status: employee.employmentStatus,
            effectiveFrom: now,
          },
        });
      }
      if (employee.employmentStatus === "TERMINATED") {
        await tx.user.updateMany({
          where: { employeeId: id },
          data: { isActive: false, tokenVersion: { increment: 1 } },
        });
        await tx.appointment.updateMany({
          where: { employeeId: id, status: { in: ["REQUESTED", "CONFIRMED"] } },
          data: { status: "CANCELLED", cancellationReason: "Employment ended" },
        });
      }
      const changedFields = Object.keys(toData(parsed.data)).filter(
        (key) =>
          JSON.stringify(before[key as keyof typeof before]) !==
          JSON.stringify(employee[key as keyof typeof employee]),
      );
      await writeAudit(
        {
          user,
          action: "UPDATE",
          entity: "Employee",
          entityId: id,
          summary: "تعديل ملف موظف",
          meta: { employmentChanged, changedFields, previous: before },
        },
        tx,
      );
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002")
      return { error: "emp.duplicateId" };
    return actionError(e);
  }
  refresh(id);
  redirect("/employees/" + id);
}
export async function archiveEmployeeAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requirePermission("employee.archive"),
    id = String(form.get("id") || ""),
    reason = String(form.get("reason") || "").trim();
  if (!id || reason.length < 3 || reason.length > 2000)
    return { error: "common.required" };
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('clinic-scheduling'))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"employee:" + id}))`;
      await tx.employee.update({
        where: { id },
        data: {
          isArchived: true,
          archivedAt: new Date(),
          archiveReason: reason,
        },
      });
      await tx.user.updateMany({
        where: { employeeId: id },
        data: { isActive: false, tokenVersion: { increment: 1 } },
      });
      await tx.appointment.updateMany({
        where: { employeeId: id, status: { in: ["REQUESTED", "CONFIRMED"] } },
        data: { status: "CANCELLED", cancellationReason: reason },
      });
      await writeAudit(
        {
          user,
          action: "ARCHIVE",
          entity: "Employee",
          entityId: id,
          summary: "أرشفة ملف موظف",
          meta: { reason },
        },
        tx,
      );
    });
    refresh(id);
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}
export async function restoreEmployeeAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requirePermission("employee.archive"),
    id = String(form.get("id") || "");
  try {
    await db.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: { isArchived: false, archivedAt: null, archiveReason: null },
      });
      await writeAudit(
        {
          user,
          action: "RESTORE",
          entity: "Employee",
          entityId: id,
          summary: "استعادة ملف موظف",
        },
        tx,
      );
    });
    refresh(id);
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}
export async function checkNationalId(
  value: string,
): Promise<{ valid: boolean; known: boolean }> {
  await requirePermission("employee.write");
  const result = validateNationalId(value);
  return { valid: result.valid, known: result.known };
}
