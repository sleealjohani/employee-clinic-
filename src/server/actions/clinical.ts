"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
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
import { VACCINE_BY_CODE } from "@/lib/catalog/vaccines";
import type { ActionState } from "./employees";

export type { ActionState };

function touch(employeeId: string) {
  revalidatePath(`/employees/${employeeId}`);
}

// ---------------------------------------------------------------- visits

export async function createVisitAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("clinical.write");
  const parsed = visitSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { error: "common.error" };
  const v = parsed.data;

  const visit = await db.visit.create({
    data: {
      employeeId: v.employeeId,
      visitDate: new Date(v.visitDate),
      type: v.type,
      chiefComplaint: v.chiefComplaint ?? null,
      diagnosis: v.diagnosis ?? null,
      plan: v.plan ?? null,
      notes: v.notes ?? null,
      tempC: v.tempC ?? null,
      systolic: v.systolic ?? null,
      diastolic: v.diastolic ?? null,
      pulse: v.pulse ?? null,
      respRate: v.respRate ?? null,
      spo2: v.spo2 ?? null,
      weightKg: v.weightKg ?? null,
      heightCm: v.heightCm ?? null,
      createdById: user.id,
    },
  });

  await writeAudit({
    user,
    action: "CREATE",
    entity: "Visit",
    entityId: visit.id,
    summary: `تسجيل زيارة (${v.type})`,
    meta: { employeeId: v.employeeId },
  });

  touch(v.employeeId);
  revalidatePath("/visits");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------------------------------------------------------------- laboratory

export async function createLabAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("clinical.write");
  const parsed = labSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { error: "common.error" };
  const l = parsed.data;

  const def = TEST_BY_CODE[l.testCode];
  if (!def) return { error: "common.error" };

  const employee = await db.employee.findUnique({
    where: { id: l.employeeId },
    select: { id: true, name: true, gender: true },
  });
  if (!employee) return { error: "common.error" };

  if (l.resultType === "QUANTITATIVE" && (l.valueNum === undefined || l.valueNum === null)) {
    return { error: "common.required" };
  }
  if (l.resultType === "QUALITATIVE" && !l.valueText) return { error: "common.required" };

  const fallback = refFor(def, employee.gender);
  const refLow = l.refLow ?? fallback?.low ?? null;
  const refHigh = l.refHigh ?? fallback?.high ?? null;

  // Interpretation is computed here, from the value and the range. Always.
  const flag = computeFlag({
    testCode: l.testCode,
    resultType: l.resultType,
    valueNum: l.valueNum ?? null,
    valueText: l.valueText ?? null,
    refLow,
    refHigh,
    sex: employee.gender,
  });

  const lab = await db.labResult.create({
    data: {
      employeeId: l.employeeId,
      testCode: l.testCode,
      testName: def.nameEn,
      resultType: l.resultType,
      valueNum: l.valueNum ?? null,
      valueText: l.valueText ?? null,
      unit: l.unit ?? def.unit ?? null,
      refLow,
      refHigh,
      refText: l.refText ?? null,
      flag,
      collectedAt: l.collectedAt ?? new Date(),
      verifiedAt: l.verifiedAt ?? null,
      orderNo: l.orderNo ?? null,
      sampleNo: l.sampleNo ?? null,
      performedBy: l.performedBy ?? null,
      verifiedBy: l.verifiedBy ?? null,
      labName: l.labName ?? null,
      requiresReview: requiresReview(flag, l.testCode),
      createdById: user.id,
    },
  });

  await writeAudit({
    user,
    action: "CREATE",
    entity: "LabResult",
    entityId: lab.id,
    summary: `تسجيل تحليل ${def.nameEn} (${flag})`,
    meta: { employeeId: l.employeeId, critical: isCritical(flag, l.testCode) },
  });

  touch(l.employeeId);
  revalidatePath("/labs");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function reviewLabAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("clinical.write");
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "common.error" };

  const lab = await db.labResult.update({
    where: { id },
    data: { reviewedAt: new Date(), reviewedById: user.id },
  });

  await writeAudit({
    user,
    action: "REVIEW",
    entity: "LabResult",
    entityId: id,
    summary: `اطلاع طبي على ${lab.testName}`,
    meta: { employeeId: lab.employeeId },
  });

  touch(lab.employeeId);
  revalidatePath("/labs");
  revalidatePath("/due");
  return { ok: true };
}

/**
 * A critical result is never closed by a click alone — who was told and what was
 * done are both required, and both are written to the audit trail.
 */
export async function notifyCriticalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission("clinical.write");
  const id = String(formData.get("id") ?? "");
  const notifiedTo = String(formData.get("notifiedTo") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim();
  if (!id || notifiedTo.length < 2 || action.length < 3) return { error: "common.required" };

  const lab = await db.labResult.update({
    where: { id },
    data: {
      criticalNotifiedAt: new Date(),
      criticalNotifiedTo: notifiedTo,
      criticalAction: action,
      reviewedAt: new Date(),
      reviewedById: user.id,
    },
  });

  await writeAudit({
    user,
    action: "CRITICAL_NOTIFY",
    entity: "LabResult",
    entityId: id,
    summary: `تبليغ نتيجة حرجة (${lab.testName}) إلى ${notifiedTo}`,
    meta: { employeeId: lab.employeeId, action },
  });

  touch(lab.employeeId);
  revalidatePath("/labs");
  revalidatePath("/due");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------------------------------------------------------------- allergies

export async function createAllergyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission("clinical.write");
  const parsed = allergySchema.safeParse(formToObject(formData));
  if (!parsed.success) return { error: "common.error" };
  const a = parsed.data;

  const allergy = await db.allergy.create({
    data: {
      employeeId: a.employeeId,
      type: a.type,
      substance: a.substance,
      severity: a.severity,
      reaction: a.reaction ?? null,
      action: a.action ?? null,
      certainty: a.certainty,
      allergyStatus: a.allergyStatus,
      notes: a.notes ?? null,
      createdById: user.id,
    },
  });

  await writeAudit({
    user,
    action: "CREATE",
    entity: "Allergy",
    entityId: allergy.id,
    summary: `تسجيل حساسية: ${a.substance} (${a.severity})`,
    meta: { employeeId: a.employeeId },
  });

  touch(a.employeeId);
  return { ok: true };
}

export async function setAllergyStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission("clinical.write");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("allergyStatus") ?? "");
  if (!id || !["ACTIVE", "RESOLVED", "REFUTED"].includes(status)) return { error: "common.error" };

  const allergy = await db.allergy.update({
    where: { id },
    data: { allergyStatus: status as "ACTIVE" | "RESOLVED" | "REFUTED" },
  });

  await writeAudit({
    user,
    action: "UPDATE",
    entity: "Allergy",
    entityId: id,
    summary: `تغيير حالة الحساسية ${allergy.substance} إلى ${status}`,
    meta: { employeeId: allergy.employeeId },
  });

  touch(allergy.employeeId);
  return { ok: true };
}

// ---------------------------------------------------------------- immunisation

export async function createVaccinationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission("clinical.write");
  const parsed = vaccinationSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { error: "common.error" };
  const v = parsed.data;

  const def = VACCINE_BY_CODE[v.vaccineCode];
  if (!def) return { error: "common.error" };

  const vaccination = await db.vaccination.create({
    data: {
      employeeId: v.employeeId,
      vaccineCode: v.vaccineCode,
      vaccineName: def.nameEn,
      doseNumber: v.doseNumber,
      givenAt: new Date(v.givenAt),
      lotNumber: v.lotNumber ?? null,
      site: v.site ?? null,
      provider: v.provider ?? null,
      nextDueAt: v.nextDueAt ?? null,
      notes: v.notes ?? null,
      createdById: user.id,
    },
  });

  await writeAudit({
    user,
    action: "CREATE",
    entity: "Vaccination",
    entityId: vaccination.id,
    summary: `تسجيل جرعة ${def.nameEn} رقم ${v.doseNumber}`,
    meta: { employeeId: v.employeeId },
  });

  touch(v.employeeId);
  revalidatePath("/vaccinations");
  revalidatePath("/due");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------------------------------------------------------------- education & notes

export async function createEducationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission("clinical.write");
  const parsed = educationSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { error: "common.error" };
  const e = parsed.data;

  const record = await db.healthEducation.create({
    data: {
      employeeId: e.employeeId,
      topic: e.topic,
      method: e.method ?? null,
      providedAt: new Date(e.providedAt),
      notes: e.notes ?? null,
      createdById: user.id,
    },
  });

  await writeAudit({
    user,
    action: "CREATE",
    entity: "HealthEducation",
    entityId: record.id,
    summary: `تثقيف صحي: ${e.topic}`,
    meta: { employeeId: e.employeeId },
  });

  touch(e.employeeId);
  return { ok: true };
}

export async function createNoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("clinical.write");
  const parsed = noteSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { error: "common.error" };
  const n = parsed.data;

  const note = await db.clinicalNote.create({
    data: {
      employeeId: n.employeeId,
      body: n.body,
      isPinned: Boolean(n.isPinned),
      createdById: user.id,
    },
  });

  await writeAudit({
    user,
    action: "CREATE",
    entity: "ClinicalNote",
    entityId: note.id,
    summary: "إضافة ملاحظة طبية",
    meta: { employeeId: n.employeeId },
  });

  touch(n.employeeId);
  return { ok: true };
}

// ---------------------------------------------------------------- corrections

const VOIDABLE = ["Visit", "LabResult", "Allergy", "Vaccination", "HealthEducation", "ClinicalNote"] as const;
type Voidable = (typeof VOIDABLE)[number];

/**
 * The only way to "remove" a clinical record: mark it entered-in-error, with a
 * reason and an author. The row stays, and the audit trail keeps the story.
 */
export async function voidRecordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("clinical.void");
  const entity = String(formData.get("entity") ?? "") as Voidable;
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!VOIDABLE.includes(entity) || !id || reason.length < 3) return { error: "common.required" };

  let employeeId = "";
  switch (entity) {
    case "Visit": {
      const r = await db.visit.update({
        where: { id },
        data: { status: "ENTERED_IN_ERROR", voidReason: reason },
      });
      employeeId = r.employeeId;
      break;
    }
    case "LabResult": {
      const r = await db.labResult.update({
        where: { id },
        data: { status: "ENTERED_IN_ERROR", voidReason: reason },
      });
      employeeId = r.employeeId;
      break;
    }
    case "Allergy": {
      const r = await db.allergy.update({ where: { id }, data: { status: "ENTERED_IN_ERROR" } });
      employeeId = r.employeeId;
      break;
    }
    case "Vaccination": {
      const r = await db.vaccination.update({ where: { id }, data: { status: "ENTERED_IN_ERROR" } });
      employeeId = r.employeeId;
      break;
    }
    case "HealthEducation": {
      const r = await db.healthEducation.update({ where: { id }, data: { status: "ENTERED_IN_ERROR" } });
      employeeId = r.employeeId;
      break;
    }
    case "ClinicalNote": {
      const r = await db.clinicalNote.update({ where: { id }, data: { status: "ENTERED_IN_ERROR" } });
      employeeId = r.employeeId;
      break;
    }
  }

  await writeAudit({
    user,
    action: "VOID",
    entity,
    entityId: id,
    summary: `تعليم السجل كإدخال خاطئ: ${reason}`,
    meta: { employeeId },
  });

  touch(employeeId);
  return { ok: true };
}
