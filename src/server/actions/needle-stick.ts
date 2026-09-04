"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/current-user";
import {
  actionError,
  ClinicError,
  type ResultState,
} from "@/lib/action-result";
import { formToObject, needleStickIncidentSchema } from "@/lib/validation";

export type NeedleStickActionState = ResultState;

const REFRESH_PATHS = ["/needle-stick", "/employees", "/dashboard", "/reports"];

function refresh(employeeId?: string, incidentId?: string) {
  for (const path of REFRESH_PATHS) revalidatePath(path, "layout");
  if (employeeId) revalidatePath(`/employees/${employeeId}`);
  if (incidentId) revalidatePath(`/needle-stick/${incidentId}`);
}

function clinicDateTime(raw: string | undefined): Date | null {
  if (!raw) return null;
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) ? `${raw}+03:00` : raw,
  );
  if (!Number.isFinite(date.getTime())) throw new ClinicError("v2.invalid");
  return date;
}

function checkedClinicalDate(raw: string | undefined): Date | null {
  const date = clinicDateTime(raw);
  if (date && date.getTime() > Date.now() + 15 * 60_000)
    throw new ClinicError("needle.futureDate");
  return date;
}

async function activeEmployee(tx: Prisma.TransactionClient, id: string) {
  const employee = await tx.employee.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      department: true,
      isArchived: true,
      employmentStatus: true,
    },
  });
  if (
    !employee ||
    employee.isArchived ||
    employee.employmentStatus === "TERMINATED"
  )
    throw new ClinicError("v2.invalid");
  return employee;
}

function incidentValues(
  value: ReturnType<typeof needleStickIncidentSchema.parse>,
) {
  const incidentAt = checkedClinicalDate(value.incidentAt);
  if (!incidentAt) throw new ClinicError("v2.invalid");

  return {
    department: value.department || null,
    nature: value.nature,
    otherNature: value.nature === "OTHER" ? value.otherNature || null : null,
    incidentAt,
    staffSignature: value.staffSignature || null,
    sourcePatientName: value.sourcePatientName || null,
    sourcePatientFileNo: value.sourcePatientFileNo || null,
    sourceWard: value.sourceWard || null,
    sourceBloodBorneHistory:
      value.sourceBloodBorneHistory === "YES"
        ? true
        : value.sourceBloodBorneHistory === "NO"
          ? false
          : null,
    sourceBloodBorneDetails: value.sourceBloodBorneDetails || null,
    actionWashing: value.actionWashing,
    actionIrrigation: value.actionIrrigation,
    actionEmployeeClinic: value.actionEmployeeClinic,
    actionImmunoglobulin: value.actionImmunoglobulin,
    headOfDepartmentName: value.headOfDepartmentName || null,
    headOfDepartmentSignature: value.headOfDepartmentSignature || null,
    headOfDepartmentSignedAt: checkedClinicalDate(
      value.headOfDepartmentSignedAt,
    ),
    reportReceivedAt: checkedClinicalDate(value.reportReceivedAt),
    patientHivResult: value.patientHivResult || null,
    patientHbvResult: value.patientHbvResult || null,
    patientHcvResult: value.patientHcvResult || null,
    patientOtherResult: value.patientOtherResult || null,
    staffHivResult: value.staffHivResult || null,
    staffHbvResult: value.staffHbvResult || null,
    staffHcvResult: value.staffHcvResult || null,
    staffOtherResult: value.staffOtherResult || null,
    recommendation: value.recommendation || null,
    physicianName: value.physicianName || null,
    physicianSignature: value.physicianSignature || null,
    physicianSignedAt: checkedClinicalDate(value.physicianSignedAt),
  };
}

export async function createNeedleStickIncidentAction(
  _previous: NeedleStickActionState,
  form: FormData,
): Promise<NeedleStickActionState> {
  const user = await requirePermission("clinical.write");
  const parsed = needleStickIncidentSchema.safeParse(formToObject(form));
  if (!parsed.success) return { error: "v2.invalid" };

  try {
    const incident = await db.$transaction(
      async (tx) => {
        const employee = await activeEmployee(tx, parsed.data.employeeId);
        const record = await tx.needleStickIncident.create({
          data: {
            ...incidentValues(parsed.data),
            employeeId: employee.id,
            staffName: employee.name,
            department: parsed.data.department || employee.department || null,
            completedAt: parsed.data.complete ? new Date() : null,
            createdById: user.id,
            updatedById: user.id,
          },
        });
        await writeAudit(
          {
            user,
            action: "CREATE",
            entity: "NeedleStickIncident",
            entityId: record.id,
            summary: "تسجيل حادثة وخز أو تعرض مهني",
            meta: {
              employeeId: employee.id,
              nature: record.nature,
              completed: !!record.completedAt,
            },
          },
          tx,
        );
        return record;
      },
      { timeout: 20_000 },
    );
    refresh(incident.employeeId, incident.id);
    return { ok: true, id: incident.id };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateNeedleStickIncidentAction(
  _previous: NeedleStickActionState,
  form: FormData,
): Promise<NeedleStickActionState> {
  const user = await requirePermission("clinical.write");
  const parsed = needleStickIncidentSchema.safeParse(formToObject(form));
  const id = String(form.get("id") ?? "");
  const revision = Number(form.get("revision"));
  if (!parsed.success || !id || !Number.isInteger(revision))
    return { error: "v2.invalid" };

  try {
    const incident = await db.$transaction(
      async (tx) => {
        const before = await tx.needleStickIncident.findUnique({
          where: { id },
        });
        if (
          !before ||
          before.status === "ENTERED_IN_ERROR" ||
          before.employeeId !== parsed.data.employeeId
        )
          throw new ClinicError("v2.invalid");
        await activeEmployee(tx, before.employeeId);
        if (before.completedAt && (parsed.data.amendReason?.length ?? 0) < 3)
          throw new ClinicError("v2.reasonRequired");

        const changed = await tx.needleStickIncident.updateMany({
          where: { id, revision, status: { not: "ENTERED_IN_ERROR" } },
          data: {
            ...incidentValues(parsed.data),
            completedAt: parsed.data.complete
              ? before.completedAt || new Date()
              : null,
            revision: { increment: 1 },
            updatedById: user.id,
          },
        });
        if (!changed.count) throw new ClinicError("needle.conflict");

        const updated = await tx.needleStickIncident.findUniqueOrThrow({
          where: { id },
        });
        await writeAudit(
          {
            user,
            action: "UPDATE",
            entity: "NeedleStickIncident",
            entityId: id,
            summary: updated.completedAt
              ? "تحديث وإكمال حادثة تعرض مهني"
              : "تحديث حادثة تعرض مهني",
            meta: {
              employeeId: before.employeeId,
              revision: revision + 1,
              amendReason: parsed.data.amendReason || null,
              previousCompletedAt: before.completedAt,
            },
          },
          tx,
        );
        return updated;
      },
      { isolationLevel: "Serializable", timeout: 20_000 },
    );
    refresh(incident.employeeId, incident.id);
    return { ok: true, id: incident.id };
  } catch (error) {
    return actionError(error);
  }
}

export async function voidNeedleStickIncidentAction(
  _previous: NeedleStickActionState,
  form: FormData,
): Promise<NeedleStickActionState> {
  const user = await requirePermission("clinical.void");
  const id = String(form.get("id") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (!id || reason.length < 3 || reason.length > 2_000)
    return { error: "common.required" };

  try {
    const incident = await db.$transaction(
      async (tx) => {
        const before = await tx.needleStickIncident.findUnique({
          where: { id },
        });
        if (!before || before.status === "ENTERED_IN_ERROR")
          throw new ClinicError("v2.invalid");
        const updated = await tx.needleStickIncident.update({
          where: { id },
          data: {
            status: "ENTERED_IN_ERROR",
            voidReason: reason,
            revision: { increment: 1 },
            updatedById: user.id,
          },
        });
        await writeAudit(
          {
            user,
            action: "VOID",
            entity: "NeedleStickIncident",
            entityId: id,
            summary: "تعليم حادثة التعرض كإدخال خاطئ",
            meta: { employeeId: before.employeeId, reason },
          },
          tx,
        );
        return updated;
      },
      { timeout: 20_000 },
    );
    refresh(incident.employeeId, incident.id);
    return { ok: true, id: incident.id };
  } catch (error) {
    return actionError(error);
  }
}
