"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/current-user";
import { TEST_BY_CODE, refFor } from "@/lib/catalog/tests";
import { computeFlag, requiresReview } from "@/lib/clinical/rules";
import { parseResultDate } from "@/lib/import/stage-batch";
import type { ActionState } from "./employees";

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
      collectedAt: parseResultDate(String(formData.get("collectedAt") ?? "")),
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
/**
 * Approve every clean result belonging to one person in a batch.
 *
 * A screening batch runs to hundreds of results; approving them one at a time
 * is not review, it is data entry, and it pushes people towards approving
 * without looking. This keeps the unit of judgement at the person — the
 * reviewer sees that employee's whole panel before deciding — while refusing
 * to touch anything that still needs a decision of its own: an identity the
 * system could not confirm, an unrecognised test, a missing value, or a
 * warning. Those stay individually reviewable, which is the whole point.
 */
export async function approvePersonAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("import.run");
  const batchId = String(formData.get("batchId") ?? "");
  const ids = String(formData.get("ids") ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  if (!batchId || ids.length === 0) return { error: "common.error" };

  const items = await db.labImportItem.findMany({
    where: { id: { in: ids }, batchId, review: "PENDING", committedLabResultId: null },
  });

  const clean = items.filter(
    (item) =>
      item.matchStatus === "MATCHED" &&
      item.matchedEmployeeId !== null &&
      item.testCode !== null &&
      TEST_BY_CODE[item.testCode] !== undefined &&
      (item.valueNum !== null || (item.valueText ?? "").trim() !== "") &&
      item.warnings.length === 0,
  );

  if (clean.length === 0) return { error: "imp.nothingToApprove" };

  await db.labImportItem.updateMany({
    where: { id: { in: clean.map((item) => item.id) } },
    data: { review: "APPROVED" },
  });

  revalidatePath(`/labs/import/${batchId}`);
  return { ok: true };
}

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
