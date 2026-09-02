"use server";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { lockOHC, synchronizeOHC } from "@/server/ohc-register";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/current-user";
import {
  allergySchema,
  educationSchema,
  formToObject,
  labSchema,
  noteSchema,
  vaccinationSchema,
  visitSchema,
} from "@/lib/validation";
import { computeFlag, isCritical, requiresReview } from "@/lib/clinical/rules";
import { TEST_BY_CODE, refFor } from "@/lib/catalog/tests";
import { sameUnit } from "@/lib/clinical/numeric";
import {
  labReviewSnapshot,
  pendingLabReviewWhere,
} from "@/lib/clinical/lab-review";
import { VACCINE_BY_CODE } from "@/lib/catalog/vaccines";
import { actionError, ClinicError } from "@/lib/action-result";
import { notifyEmployee } from "@/server/clinic-notifications";
import type { ActionState } from "./employees";
export type { ActionState };
function refresh() {
  for (const p of [
    "/employees",
    "/visits",
    "/labs",
    "/vaccinations",
    "/due",
    "/dashboard",
    "/reports",
    "/portal",
    "/notifications",
  ])
    revalidatePath(p, "layout");
}
async function activeEmployee(tx: Prisma.TransactionClient, id: string) {
  const employee = await tx.employee.findUnique({ where: { id } });
  if (!employee || employee.isArchived) throw new ClinicError("v2.invalid");
  return employee;
}
function clinicalDate(raw: string) {
  return new Date(
    /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(raw) ? raw + "+03:00" : raw,
  );
}
async function run(
  work: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<ActionState> {
  try {
    await db.$transaction(work, { timeout: 20000 });
    refresh();
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}
function visitValues(v: ReturnType<typeof visitSchema.parse>) {
  for (const [key, min, max] of [
    ["tempC", 20, 50],
    ["systolic", 0, 350],
    ["diastolic", 0, 250],
    ["pulse", 0, 300],
    ["respRate", 0, 100],
    ["spo2", 0, 100],
    ["weightKg", 1, 800],
    ["heightCm", 20, 300],
  ] as const) {
    const value = v[key];
    if (value !== undefined && (value < min || value > max))
      throw new ClinicError("v2.invalid");
  }
  for (const key of ["systolic", "diastolic", "pulse", "respRate"] as const)
    if (v[key] !== undefined && !Number.isInteger(v[key]))
      throw new ClinicError("v2.invalid");
  const visitDate = clinicalDate(v.visitDate);
  if (
    !Number.isFinite(visitDate.getTime()) ||
    visitDate.getTime() > Date.now() + 86400000
  )
    throw new ClinicError("v2.invalid");
  return {
    visitDate,
    type: v.type,
    chiefComplaint: v.chiefComplaint || null,
    diagnosis: v.diagnosis || null,
    plan: v.plan || null,
    notes: v.notes || null,
    tempC: v.tempC ?? null,
    systolic: v.systolic ?? null,
    diastolic: v.diastolic ?? null,
    pulse: v.pulse ?? null,
    respRate: v.respRate ?? null,
    spo2: v.spo2 ?? null,
    weightKg: v.weightKg ?? null,
    heightCm: v.heightCm ?? null,
  };
}
export async function createVisitAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requirePermission("clinical.write"),
    parsed = visitSchema.safeParse(formToObject(form));
  if (!parsed.success) return { error: "v2.invalid" };
  return run(async (tx) => {
    const v = parsed.data;
    await activeEmployee(tx, v.employeeId);
    const visit = await tx.visit.create({
      data: {
        ...visitValues(v),
        employeeId: v.employeeId,
        createdById: user.id,
      },
    });
    await writeAudit(
      {
        user,
        action: "CREATE",
        entity: "Visit",
        entityId: visit.id,
        summary: "تسجيل زيارة",
        meta: { employeeId: v.employeeId },
      },
      tx,
    );
  });
}
export async function saveVisitAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requirePermission("clinical.write"),
    parsed = visitSchema.safeParse(formToObject(form));
  const id = String(form.get("id") ?? ""),
    revision = Number(form.get("revision")),
    complete = form.get("complete") === "on",
    reason = String(form.get("amendReason") ?? "").trim();
  if (!parsed.success || !id || !Number.isInteger(revision))
    return { error: "v2.invalid" };
  return run(async (tx) => {
    const before = await tx.visit.findUnique({ where: { id } });
    if (
      !before ||
      before.status === "ENTERED_IN_ERROR" ||
      before.employeeId !== parsed.data.employeeId
    )
      throw new ClinicError("v2.invalid");
    await activeEmployee(tx, before.employeeId);
    if (before.completedAt && reason.length < 3)
      throw new ClinicError("v2.reasonRequired");
    if (complete && (!parsed.data.chiefComplaint || !parsed.data.plan))
      throw new ClinicError("v2.invalid");
    const changed = await tx.visit.updateMany({
      where: { id, revision },
      data: {
        ...visitValues(parsed.data),
        revision: { increment: 1 },
        completedAt: before.completedAt || (complete ? new Date() : null),
      },
    });
    if (!changed.count) throw new ClinicError("v2.visitConflict");
    if (complete)
      await tx.appointment.updateMany({
        where: { visitId: id, status: "CHECKED_IN" },
        data: { status: "COMPLETED" },
      });
    await writeAudit(
      {
        user,
        action: "UPDATE",
        entity: "Visit",
        entityId: id,
        summary: complete ? "إكمال الزيارة" : "تحديث الزيارة",
        meta: {
          employeeId: before.employeeId,
          revision: revision + 1,
          amendReason: reason || null,
          previous: before,
        },
      },
      tx,
    );
    if (complete && !before.completedAt)
      await notifyEmployee(
        tx,
        before.employeeId,
        "اكتملت زيارتك في العيادة",
        "Your clinic visit is complete",
        "/portal/appointments",
      );
    revalidatePath("/visits/" + id);
    revalidatePath("/appointments");
  });
}
export async function createLabAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requirePermission("clinical.write"),
    parsed = labSchema.safeParse(formToObject(form));
  if (!parsed.success) return { error: "v2.invalid" };
  return run(async (tx) => {
    const l = parsed.data,
      employee = await activeEmployee(tx, l.employeeId),
      def = TEST_BY_CODE[l.testCode];
    if (
      !def ||
      (l.resultType === "QUANTITATIVE"
        ? l.valueNum === undefined
        : !l.valueText)
    )
      throw new ClinicError("v2.invalid");
    if (
      l.refLow !== undefined &&
      l.refHigh !== undefined &&
      l.refLow > l.refHigh
    )
      throw new ClinicError("v2.invalid");
    if (l.collectedAt && l.collectedAt > new Date())
      throw new ClinicError("v2.invalid");
    if (
      l.visitId &&
      !(await tx.visit.findFirst({
        where: {
          id: l.visitId,
          employeeId: l.employeeId,
          status: { not: "ENTERED_IN_ERROR" },
        },
      }))
    )
      throw new ClinicError("v2.invalid");
    const range = sameUnit(l.unit, def.unit)
      ? refFor(def, employee.gender)
      : undefined;
    const refLow = l.refLow ?? range?.low ?? null,
      refHigh = l.refHigh ?? range?.high ?? null;
    const flag = computeFlag({ ...l, refLow, refHigh, sex: employee.gender });
    const lab = await tx.labResult.create({
      data: {
        ...l,
        testName: def.nameEn,
        unit: l.unit || null,
        valueNum: l.resultType === "QUANTITATIVE" ? l.valueNum : null,
        valueText: l.resultType === "QUALITATIVE" ? l.valueText : null,
        refLow,
        refHigh,
        flag,
        rawValue: l.valueNum === undefined ? l.valueText : String(l.valueNum),
        collectedAt: l.collectedAt || new Date(),
        requiresReview: requiresReview(flag, l.testCode),
        createdById: user.id,
      },
    });
    await writeAudit(
      {
        user,
        action: "CREATE",
        entity: "LabResult",
        entityId: lab.id,
        summary: "تسجيل نتيجة مختبر",
        meta: {
          employeeId: l.employeeId,
          testCode: l.testCode,
          critical: isCritical(flag, l.testCode),
        },
      },
      tx,
    );
  });
}
export async function reviewLabAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requirePermission("clinical.write"),
    id = String(form.get("id") ?? "");
  return run(async (tx) => {
    const lab = await tx.labResult.findUnique({ where: { id } });
    if (!lab || lab.status === "ENTERED_IN_ERROR")
      throw new ClinicError("v2.invalid");
    await tx.labResult.update({
      where: { id },
      data: { reviewedAt: new Date(), reviewedById: user.id },
    });
    await writeAudit(
      {
        user,
        action: "REVIEW",
        entity: "LabResult",
        entityId: id,
        summary: "مراجعة نتيجة مختبر",
        meta: { employeeId: lab.employeeId },
      },
      tx,
    );
  });
}
export type BulkLabReviewState = ActionState & { approvedCount?: number };

export async function approveAllLabsAction(
  _prev: BulkLabReviewState,
  form: FormData,
): Promise<BulkLabReviewState> {
  const user = await requirePermission("clinical.write");
  const version = String(form.get("version") ?? "");
  if (form.get("confirm") !== "yes" || !/^[a-f0-9]{64}$/.test(version))
    return { error: "lab.bulkConfirmRequired" };
  try {
    const approvedCount = await db.$transaction(
      async (tx) => {
        const labs = await tx.labResult.findMany({
          where: pendingLabReviewWhere,
          select: { id: true, employeeId: true, updatedAt: true },
        });
        // Reject newly imported, edited, voided, archived or independently reviewed
        // results. Never silently broaden the scope the user confirmed.
        if (labReviewSnapshot(labs).version !== version)
          throw new ClinicError("lab.bulkChanged");
        if (!labs.length) return 0;
        const reviewedAt = new Date();
        const changed = await tx.labResult.updateMany({
          where: {
            ...pendingLabReviewWhere,
            id: { in: labs.map((lab) => lab.id) },
          },
          data: { reviewedAt, reviewedById: user.id },
        });
        if (changed.count !== labs.length)
          throw new ClinicError("lab.bulkChanged");
        await writeAudit(
          labs.map((lab) => ({
            user,
            action: "REVIEW" as const,
            entity: "LabResult",
            entityId: lab.id,
            summary: "اعتماد مراجعة نتيجة مختبر ضمن اعتماد جماعي",
            meta: {
              employeeId: lab.employeeId,
              bulk: true,
              batchVersion: version,
              batchCount: labs.length,
              reviewedAt: reviewedAt.toISOString(),
            },
          })),
          tx,
        );
        return changed.count;
      },
      { isolationLevel: "Serializable", timeout: 20000 },
    );
    refresh();
    return { ok: true, approvedCount };
  } catch (error) {
    return actionError(error);
  }
}

export async function releaseLabAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requirePermission("clinical.write"),
    id = String(form.get("id") ?? ""),
    release = form.get("release") === "yes";
  return run(async (tx) => {
    const lab = await tx.labResult.findUnique({ where: { id } });
    if (
      !lab ||
      lab.status !== "ACTIVE" ||
      (release &&
        (!lab.reviewedAt ||
          (isCritical(lab.flag, lab.testCode) && !lab.criticalNotifiedAt)))
    )
      throw new ClinicError("v2.reviewBeforeRelease");
    await tx.labResult.update({
      where: { id },
      data: { releasedAt: release ? new Date() : null },
    });
    await writeAudit(
      {
        user,
        action: "UPDATE",
        entity: "LabResult",
        entityId: id,
        summary: release
          ? "اعتماد مشاركة النتيجة مع الموظف"
          : "إيقاف مشاركة النتيجة",
        meta: { employeeId: lab.employeeId },
      },
      tx,
    );
    if (release && !lab.releasedAt)
      await notifyEmployee(
        tx,
        lab.employeeId,
        "نتيجة تحليل متاحة في سجلك الصحي",
        "A lab result is available in your health record",
        "/portal/records",
      );
  });
}
export async function notifyCriticalAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requirePermission("clinical.write"),
    id = String(form.get("id") ?? ""),
    notifiedTo = String(form.get("notifiedTo") ?? "").trim(),
    action = String(form.get("action") ?? "").trim();
  if (
    notifiedTo.length < 2 ||
    notifiedTo.length > 160 ||
    action.length < 3 ||
    action.length > 2000
  )
    return { error: "common.required" };
  return run(async (tx) => {
    const lab = await tx.labResult.findUnique({ where: { id } });
    if (!lab || lab.status !== "ACTIVE" || !isCritical(lab.flag, lab.testCode))
      throw new ClinicError("v2.invalid");
    await tx.labResult.update({
      where: { id },
      data: {
        criticalNotifiedAt: new Date(),
        criticalNotifiedTo: notifiedTo,
        criticalAction: action,
        reviewedAt: new Date(),
        reviewedById: user.id,
      },
    });
    await writeAudit(
      {
        user,
        action: "CRITICAL_NOTIFY",
        entity: "LabResult",
        entityId: id,
        summary: "توثيق تبليغ نتيجة حرجة",
        meta: { employeeId: lab.employeeId, notifiedTo, action },
      },
      tx,
    );
  });
}
export async function createAllergyAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requirePermission("clinical.write"),
    parsed = allergySchema.safeParse(formToObject(form));
  if (!parsed.success) return { error: "v2.invalid" };
  return run(async (tx) => {
    const a = parsed.data;
    await activeEmployee(tx, a.employeeId);
    const record = await tx.allergy.create({
      data: { ...a, createdById: user.id },
    });
    await writeAudit(
      {
        user,
        action: "CREATE",
        entity: "Allergy",
        entityId: record.id,
        summary: "تسجيل حساسية",
        meta: { employeeId: a.employeeId },
      },
      tx,
    );
  });
}
export async function setAllergyStatusAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requirePermission("clinical.write"),
    id = String(form.get("id") ?? ""),
    status = String(form.get("allergyStatus") ?? "");
  if (!["ACTIVE", "RESOLVED", "REFUTED"].includes(status))
    return { error: "v2.invalid" };
  return run(async (tx) => {
    const record = await tx.allergy.update({
      where: { id, status: "ACTIVE" },
      data: { allergyStatus: status as "ACTIVE" | "RESOLVED" | "REFUTED" },
    });
    await writeAudit(
      {
        user,
        action: "UPDATE",
        entity: "Allergy",
        entityId: id,
        summary: "تحديث حالة الحساسية",
        meta: { employeeId: record.employeeId, status },
      },
      tx,
    );
  });
}
export async function createVaccinationAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requirePermission("clinical.write"),
    parsed = vaccinationSchema.safeParse(formToObject(form));
  if (!parsed.success) return { error: "v2.invalid" };
  return run(async (tx) => {
    const v = parsed.data,
      def = VACCINE_BY_CODE[v.vaccineCode],
      givenAt = new Date(v.givenAt);
    if (
      !def ||
      !Number.isFinite(givenAt.getTime()) ||
      givenAt > new Date() ||
      (v.nextDueAt && v.nextDueAt <= givenAt)
    )
      throw new ClinicError("v2.invalid");
    await lockOHC(tx);
    await activeEmployee(tx, v.employeeId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"vaccine:" + v.employeeId}))`;
    if (
      await tx.vaccination.count({
        where: {
          employeeId: v.employeeId,
          vaccineCode: v.vaccineCode,
          doseNumber: v.doseNumber,
          givenAt,
          status: "ACTIVE",
        },
      })
    )
      throw new ClinicError("v2.conflict");
    const record = await tx.vaccination.create({
      data: { ...v, givenAt, vaccineName: def.nameEn, createdById: user.id },
    });
    await synchronizeOHC(tx);
    await writeAudit(
      {
        user,
        action: "CREATE",
        entity: "Vaccination",
        entityId: record.id,
        summary: "تسجيل جرعة تطعيم",
        meta: {
          employeeId: v.employeeId,
          vaccineCode: v.vaccineCode,
          dose: v.doseNumber,
        },
      },
      tx,
    );
  });
}
export async function createEducationAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requirePermission("clinical.write"),
    parsed = educationSchema.safeParse(formToObject(form));
  if (!parsed.success) return { error: "v2.invalid" };
  return run(async (tx) => {
    const v = parsed.data,
      providedAt = new Date(v.providedAt);
    if (!Number.isFinite(providedAt.getTime()) || providedAt > new Date())
      throw new ClinicError("v2.invalid");
    await activeEmployee(tx, v.employeeId);
    const record = await tx.healthEducation.create({
      data: { ...v, providedAt, createdById: user.id },
    });
    await writeAudit(
      {
        user,
        action: "CREATE",
        entity: "HealthEducation",
        entityId: record.id,
        summary: "تسجيل تثقيف صحي",
        meta: { employeeId: v.employeeId },
      },
      tx,
    );
  });
}
export async function createNoteAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requirePermission("clinical.write"),
    parsed = noteSchema.safeParse(formToObject(form));
  if (!parsed.success) return { error: "v2.invalid" };
  return run(async (tx) => {
    const v = parsed.data;
    await activeEmployee(tx, v.employeeId);
    const record = await tx.clinicalNote.create({
      data: { ...v, createdById: user.id },
    });
    await writeAudit(
      {
        user,
        action: "CREATE",
        entity: "ClinicalNote",
        entityId: record.id,
        summary: "إضافة ملاحظة طبية",
        meta: { employeeId: v.employeeId },
      },
      tx,
    );
  });
}
export async function voidRecordAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requirePermission("clinical.void"),
    id = String(form.get("id") ?? ""),
    entity = String(form.get("entity") ?? ""),
    reason = String(form.get("reason") ?? "").trim();
  if (!id || reason.length < 3 || reason.length > 2000)
    return { error: "common.required" };
  return run(async (tx) => {
    const data = { status: "ENTERED_IN_ERROR" as const };
    let employeeId = "";
    switch (entity) {
      case "Visit": {
        const row = await tx.visit.update({
          where: { id },
          data: { ...data, voidReason: reason, revision: { increment: 1 } },
        });
        employeeId = row.employeeId;
        await tx.appointment.updateMany({
          where: { visitId: id },
          data: { status: "CANCELLED", cancellationReason: reason },
        });
        break;
      }
      case "LabResult": {
        employeeId = (
          await tx.labResult.update({
            where: { id },
            data: {
              ...data,
              voidReason: reason,
              releasedAt: null,
              sourceFingerprint: null,
            },
          })
        ).employeeId;
        break;
      }
      case "Allergy": {
        employeeId = (await tx.allergy.update({ where: { id }, data }))
          .employeeId;
        break;
      }
      case "Vaccination": {
        await lockOHC(tx);
        employeeId = (await tx.vaccination.update({ where: { id }, data }))
          .employeeId;
        await synchronizeOHC(tx);
        break;
      }
      case "HealthEducation": {
        employeeId = (await tx.healthEducation.update({ where: { id }, data }))
          .employeeId;
        break;
      }
      case "ClinicalNote": {
        employeeId = (await tx.clinicalNote.update({ where: { id }, data }))
          .employeeId;
        break;
      }
      default:
        throw new ClinicError("v2.invalid");
    }
    await writeAudit(
      {
        user,
        action: "VOID",
        entity,
        entityId: id,
        summary: "تعليم السجل كإدخال خاطئ",
        meta: { employeeId, reason },
      },
      tx,
    );
  });
}
