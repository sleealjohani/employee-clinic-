"use server";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/current-user";
import { validateNationalId } from "@/lib/validation";
import { resolveTestCode, TEST_BY_CODE, refFor } from "@/lib/catalog/tests";
import { computeFlag, requiresReview } from "@/lib/clinical/rules";
import {
  EXTRACTION_MODEL,
  MAX_UPLOAD_BYTES,
  PROMPT_VERSION,
  extractLabReport,
  importEnabled,
  type ExtractedResult,
} from "@/lib/ai/extract";
import type { ActionState } from "./employees";

const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

function num(value: string): number | null {
  const cleaned = value.replace(/[^\d.\-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function date(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Cheap similarity for name suggestions — deliberately conservative. */
function nameScore(a: string, b: string): number {
  const norm = (s: string) =>
    s
      .replace(/[ً-ْـ]/g, "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
  const A = norm(a);
  const B = norm(b);
  if (A.length === 0 || B.length === 0) return 0;
  const shared = A.filter((token) => B.includes(token)).length;
  return shared / Math.max(A.length, B.length);
}

export type UploadState = ActionState & { batchId?: string };

export async function uploadAndExtractAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const user = await requirePermission("import.run");
  if (!importEnabled()) return { error: "imp.disabled" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "common.required" };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "imp.uploadHint" };
  if (!ACCEPTED.includes(file.type)) return { error: "imp.uploadHint" };

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const attachment = await db.attachment.create({
    data: {
      filename: file.name,
      mimeType: file.type,
      size: bytes.byteLength,
      sha256,
      data: bytes,
      uploadedById: user.id,
    },
  });

  const batch = await db.labImportBatch.create({
    data: {
      attachmentId: attachment.id,
      filename: file.name,
      status: "EXTRACTING",
      model: EXTRACTION_MODEL,
      promptVersion: PROMPT_VERSION,
      uploadedById: user.id,
    },
  });

  await writeAudit({
    user,
    action: "IMPORT_UPLOAD",
    entity: "LabImportBatch",
    entityId: batch.id,
    summary: `رفع تقرير مختبر للاستخراج: ${file.name}`,
    meta: { sha256, size: bytes.byteLength, mimeType: file.type },
  });

  try {
    const output = await extractLabReport(bytes, file.type);

    const employees = await db.employee.findMany({
      select: { id: true, name: true, nameEn: true, nationalId: true, employeeNo: true, gender: true },
    });
    const byNationalId = new Map(employees.map((e) => [e.nationalId.trim(), e]));

    let pageCount = 0;
    const rows: Prisma.LabImportItemCreateManyInput[] = [];

    for (const report of output.reports) {
      pageCount = Math.max(pageCount, report.page_to || 0);

      const rawId = report.patient.national_id.replace(/\s/g, "");
      const idCheck = rawId ? validateNationalId(rawId) : { valid: false, known: true as const };

      // Identity resolution: the national ID is the only key that links automatically.
      let matchStatus: "MATCHED" | "SUGGESTED" | "UNMATCHED" = "UNMATCHED";
      let matchedEmployeeId: string | null = null;
      let matchScore: number | null = null;

      const exact = rawId ? byNationalId.get(rawId) : undefined;
      if (exact) {
        matchStatus = "MATCHED";
        matchedEmployeeId = exact.id;
        matchScore = 1;
      } else if (report.patient.full_name || report.patient.employee_no) {
        let best: { id: string; score: number } | null = null;
        for (const emp of employees) {
          const byNo =
            report.patient.employee_no && emp.employeeNo
              ? emp.employeeNo.trim() === report.patient.employee_no.trim()
                ? 0.9
                : 0
              : 0;
          const byName = Math.max(
            nameScore(report.patient.full_name, emp.name),
            emp.nameEn ? nameScore(report.patient.full_name, emp.nameEn) : 0,
          );
          const score = Math.max(byNo, byName);
          if (score >= 0.6 && (!best || score > best.score)) best = { id: emp.id, score };
        }
        if (best) {
          matchStatus = "SUGGESTED";
          matchedEmployeeId = best.id;
          matchScore = Math.round(best.score * 100) / 100;
        }
      }

      for (const result of report.results) {
        rows.push(buildItem(batch.id, report, result, {
          rawId,
          idValid: Boolean(rawId) && idCheck.valid,
          idKnown: idCheck.known,
          matchStatus,
          matchedEmployeeId,
          matchScore,
        }));
      }
    }

    if (rows.length > 0) await db.labImportItem.createMany({ data: rows });

    await db.labImportBatch.update({
      where: { id: batch.id },
      data: {
        status: rows.length > 0 ? "NEEDS_REVIEW" : "FAILED",
        error: rows.length > 0 ? null : "imp.noItems",
        pageCount,
        model: output.model,
        inputTokens: output.usage.inputTokens,
        outputTokens: output.usage.outputTokens,
      },
    });

    await writeAudit({
      user,
      action: "IMPORT_EXTRACT",
      entity: "LabImportBatch",
      entityId: batch.id,
      summary: `استخراج ${rows.length} نتيجة من ${output.reports.length} تقرير`,
      meta: {
        model: output.model,
        promptVersion: PROMPT_VERSION,
        inputTokens: output.usage.inputTokens,
        outputTokens: output.usage.outputTokens,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    await db.labImportBatch.update({
      where: { id: batch.id },
      data: { status: "FAILED", error: message.slice(0, 500) },
    });
    await writeAudit({
      user,
      action: "IMPORT_EXTRACT",
      entity: "LabImportBatch",
      entityId: batch.id,
      summary: `فشل الاستخراج: ${message.slice(0, 200)}`,
    });
  }

  revalidatePath("/labs/import");
  redirect(`/labs/import/${batch.id}`);
}

function buildItem(
  batchId: string,
  report: { patient: { national_id: string; full_name: string; employee_no: string; confidence: number } },
  result: ExtractedResult,
  identity: {
    rawId: string;
    idValid: boolean;
    idKnown: boolean;
    matchStatus: "MATCHED" | "SUGGESTED" | "UNMATCHED";
    matchedEmployeeId: string | null;
    matchScore: number | null;
  },
) {
  const code = resolveTestCode(result.test_code) ?? resolveTestCode(result.test_name);
  const valueNum = num(result.value_number);
  const collectedAt = date(result.collected_at);

  const warnings: string[] = [];
  if (!identity.rawId) warnings.push("NO_ID");
  else if (!identity.idValid) warnings.push("INVALID_ID");
  if (!code) warnings.push("UNKNOWN_TEST");
  if (valueNum === null && !result.value_text.trim()) warnings.push("NO_VALUE");
  if (collectedAt && collectedAt.getTime() > Date.now()) warnings.push("FUTURE_DATE");
  if (result.confidence < 0.75 || report.patient.confidence < 0.75) warnings.push("LOW_CONFIDENCE");

  return {
    batchId,
    page: result.page || 1,
    extractedNationalId: identity.rawId || null,
    extractedName: report.patient.full_name || null,
    extractedEmployeeNo: report.patient.employee_no || null,
    nationalIdValid: identity.idValid,
    matchStatus: identity.matchStatus,
    matchScore: identity.matchScore,
    matchedEmployeeId: identity.matchedEmployeeId,
    testCode: code,
    testName: result.test_name || null,
    resultType: result.result_type === "QUALITATIVE" ? ("QUALITATIVE" as const) : ("QUANTITATIVE" as const),
    valueNum,
    valueText: result.value_text || null,
    unit: result.unit || null,
    refLow: num(result.reference_low),
    refHigh: num(result.reference_high),
    refText: result.reference_text || null,
    collectedAt,
    verifiedAt: date(result.verified_at),
    orderNo: result.order_no || null,
    sampleNo: result.sample_no || null,
    performedBy: result.performed_by || null,
    verifiedBy: result.verified_by || null,
    labName: result.lab_name || null,
    confidence: Math.min(result.confidence, report.patient.confidence),
    citation: result.quote || null,
    rawJson: JSON.parse(JSON.stringify(result)),
    warnings,
  };
}

/** Reviewer edits one candidate row and approves or rejects it. Nothing is saved yet. */
export async function reviewItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("import.run");
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id) return { error: "common.error" };

  const item = await db.labImportItem.findUnique({ where: { id } });
  if (!item || item.committedLabResultId) return { error: "common.error" };

  if (decision === "reject") {
    await db.labImportItem.update({ where: { id }, data: { review: "REJECTED" } });
    revalidatePath(`/labs/import/${item.batchId}`);
    return { ok: true };
  }

  const employeeId = String(formData.get("employeeId") ?? "").trim();
  const testCode = String(formData.get("testCode") ?? "").trim();
  const valueNumRaw = String(formData.get("valueNum") ?? "").trim();
  const valueText = String(formData.get("valueText") ?? "").trim();

  if (!employeeId || !testCode || !TEST_BY_CODE[testCode]) return { error: "common.required" };
  if (!valueNumRaw && !valueText) return { error: "common.required" };

  await db.labImportItem.update({
    where: { id },
    data: {
      review: "APPROVED",
      matchedEmployeeId: employeeId,
      matchStatus: "MATCHED",
      testCode,
      valueNum: valueNumRaw ? Number(valueNumRaw) : null,
      valueText: valueText || null,
      unit: String(formData.get("unit") ?? "").trim() || null,
      refLow: String(formData.get("refLow") ?? "").trim() ? Number(formData.get("refLow")) : null,
      refHigh: String(formData.get("refHigh") ?? "").trim() ? Number(formData.get("refHigh")) : null,
      collectedAt: date(String(formData.get("collectedAt") ?? "")),
    },
  });

  revalidatePath(`/labs/import/${item.batchId}`);
  return { ok: true };
}

/**
 * The only path from an extracted candidate to a clinical record. Every row
 * written here was approved by a named person, and each one keeps a link back
 * to the page of the original document it came from.
 */
export async function commitBatchAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("import.run");
  const batchId = String(formData.get("batchId") ?? "");
  if (!batchId) return { error: "common.error" };

  const batch = await db.labImportBatch.findUnique({
    where: { id: batchId },
    include: {
      items: { where: { review: "APPROVED", committedLabResultId: null } },
    },
  });
  if (!batch) return { error: "common.error" };
  if (batch.items.length === 0) return { error: "imp.pendingCount" };

  const employees = await db.employee.findMany({ select: { id: true, gender: true } });
  const genderById = new Map(employees.map((e) => [e.id, e.gender]));

  let saved = 0;
  for (const item of batch.items) {
    if (!item.matchedEmployeeId || !item.testCode) continue;
    const def = TEST_BY_CODE[item.testCode];
    if (!def) continue;

    const sex = genderById.get(item.matchedEmployeeId) ?? null;
    const fallback = refFor(def, sex);
    const refLow = item.refLow ?? fallback?.low ?? null;
    const refHigh = item.refHigh ?? fallback?.high ?? null;

    // Interpretation happens here, not during extraction.
    const flag = computeFlag({
      testCode: item.testCode,
      resultType: item.resultType,
      valueNum: item.valueNum,
      valueText: item.valueText,
      refLow,
      refHigh,
      sex,
    });

    const lab = await db.labResult.create({
      data: {
        employeeId: item.matchedEmployeeId,
        testCode: item.testCode,
        testName: def.nameEn,
        resultType: item.resultType,
        valueNum: item.valueNum,
        valueText: item.valueText,
        unit: item.unit ?? def.unit ?? null,
        refLow,
        refHigh,
        refText: item.refText,
        flag,
        collectedAt: item.collectedAt,
        verifiedAt: item.verifiedAt,
        orderNo: item.orderNo,
        sampleNo: item.sampleNo,
        performedBy: item.performedBy,
        verifiedBy: item.verifiedBy,
        labName: item.labName,
        requiresReview: requiresReview(flag, item.testCode),
        sourceAttachmentId: batch.attachmentId,
        sourcePage: item.page,
        extractionConfidence: item.confidence,
        extractionCitation: item.citation,
        createdById: user.id,
      },
    });

    await db.labImportItem.update({
      where: { id: item.id },
      data: { committedLabResultId: lab.id },
    });
    saved++;
  }

  const remaining = await db.labImportItem.count({
    where: { batchId, review: "PENDING" },
  });

  await db.labImportBatch.update({
    where: { id: batchId },
    data: { status: remaining === 0 ? "COMMITTED" : "NEEDS_REVIEW", committedAt: new Date() },
  });

  await writeAudit({
    user,
    action: "IMPORT_COMMIT",
    entity: "LabImportBatch",
    entityId: batchId,
    summary: `حفظ ${saved} نتيجة معتمدة في الملفات الصحية`,
    meta: { saved, remaining },
  });

  revalidatePath(`/labs/import/${batchId}`);
  revalidatePath("/labs");
  revalidatePath("/dashboard");
  return { ok: true };
}
