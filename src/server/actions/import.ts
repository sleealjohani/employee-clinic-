"use server";
import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/current-user";
import { TEST_BY_CODE, refFor } from "@/lib/catalog/tests";
import { computeFlag, requiresReview } from "@/lib/clinical/rules";
import { sameUnit, parseLabNumber } from "@/lib/clinical/numeric";
import { parseResultDate, stageBatch } from "@/lib/import/stage-batch";
import { actionError, ClinicError } from "@/lib/action-result";
import type { ActionState } from "./employees";
function refresh(id: string) {
  for (const p of [
    "/labs/import/" + id,
    "/labs/import",
    "/labs",
    "/employees",
    "/dashboard",
    "/due",
  ])
    revalidatePath(p, "layout");
}
function observation(form: FormData) {
  const testCode = String(form.get("testCode") || ""),
    def = TEST_BY_CODE[testCode],
    employeeId = String(form.get("employeeId") || "");
  const resultType = String(form.get("resultType") || def?.resultType || ""),
    valueText = String(form.get("valueText") || "")
      .trim()
      .slice(0, 200);
  const numeric = parseLabNumber(String(form.get("valueNum") || "")),
    op = String(form.get("comparator") || numeric.comparator);
  const unit = String(form.get("unit") || "")
    .trim()
    .slice(0, 80);
  const rawLow = String(form.get("refLow") || "").trim(),
    rawHigh = String(form.get("refHigh") || "").trim();
  const refLow = rawLow ? Number(rawLow) : null,
    refHigh = rawHigh ? Number(rawHigh) : null;
  const collectedRaw = String(form.get("collectedAt") || ""),
    collectedAt = parseResultDate(collectedRaw);
  if (
    !def ||
    !employeeId ||
    !["QUANTITATIVE", "QUALITATIVE"].includes(resultType) ||
    !["EQ", "LT", "LE", "GT", "GE"].includes(op)
  )
    throw new ClinicError("v2.invalid");
  if (resultType === "QUANTITATIVE" ? numeric.value === null : !valueText)
    throw new ClinicError("v2.invalid");
  if (
    (refLow !== null && !Number.isFinite(refLow)) ||
    (refHigh !== null && !Number.isFinite(refHigh)) ||
    (refLow !== null && refHigh !== null && refLow > refHigh)
  )
    throw new ClinicError("v2.invalid");
  if (
    (collectedRaw && !collectedAt) ||
    (collectedAt && collectedAt > new Date())
  )
    throw new ClinicError("v2.invalid");
  return {
    testCode,
    matchedEmployeeId: employeeId,
    resultType: resultType as "QUANTITATIVE" | "QUALITATIVE",
    valueNum: resultType === "QUANTITATIVE" ? numeric.value : null,
    valueText: resultType === "QUALITATIVE" ? valueText : null,
    comparator: op as "EQ" | "LT" | "LE" | "GT" | "GE",
    unit: unit || null,
    refLow,
    refHigh,
    collectedAt,
  };
}
export async function reviewItemAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requirePermission("import.run"),
    id = String(form.get("id") || ""),
    decision = String(form.get("decision") || "");
  if (!["approve", "reject"].includes(decision)) return { error: "v2.invalid" };
  try {
    let batchId = "";
    await db.$transaction(async (tx) => {
      const current = await tx.labImportItem.findUnique({ where: { id } });
      if (!current || current.committedLabResultId)
        throw new ClinicError("v2.conflict");
      batchId = current.batchId;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"batch:" + batchId}))`;
      const item = await tx.labImportItem.findUniqueOrThrow({ where: { id } });
      if (item.committedLabResultId) throw new ClinicError("v2.conflict");
      if (decision === "reject") {
        const rejectReason = String(form.get("rejectReason") || "")
          .trim()
          .slice(0, 500);
        if (rejectReason.length < 3) throw new ClinicError("v2.reasonRequired");
        await tx.labImportItem.update({
          where: { id },
          data: {
            review: "REJECTED",
            rejectReason,
            reviewedById: user.id,
            reviewedAt: new Date(),
          },
        });
      } else {
        const data = observation(form);
        if (
          !(await tx.employee.findFirst({
            where: { id: data.matchedEmployeeId, isArchived: false },
          }))
        )
          throw new ClinicError("v2.invalid");
        await tx.labImportItem.update({
          where: { id },
          data: {
            ...data,
            review: "APPROVED",
            matchStatus: "MATCHED",
            reviewedById: user.id,
            reviewedAt: new Date(),
            rejectReason: null,
          },
        });
      }
      await writeAudit(
        {
          user,
          action: "REVIEW",
          entity: "LabImportItem",
          entityId: id,
          summary:
            decision === "approve"
              ? "اعتماد نتيجة مستخرجة"
              : "استبعاد نتيجة مستخرجة",
          meta: { batchId, decision },
        },
        tx,
      );
    });
    refresh(batchId);
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}
export async function approvePersonAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requirePermission("import.run"),
    batchId = String(form.get("batchId") || "");
  const ids = String(form.get("ids") || "")
    .split(",")
    .filter(Boolean)
    .slice(0, 1000);
  if (!batchId || !ids.length) return { error: "v2.invalid" };
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"batch:" + batchId}))`;
      const items = await tx.labImportItem.findMany({
        where: {
          id: { in: ids },
          batchId,
          review: "PENDING",
          committedLabResultId: null,
        },
      });
      if (new Set(items.map((i) => i.matchedEmployeeId)).size !== 1)
        throw new ClinicError("v2.invalid");
      const clean = items.filter(
        (i) =>
          i.matchStatus === "MATCHED" &&
          i.matchedEmployeeId &&
          i.testCode &&
          TEST_BY_CODE[i.testCode] &&
          (i.resultType === "QUANTITATIVE"
            ? i.valueNum !== null && Number.isFinite(i.valueNum)
            : Boolean(i.valueText?.trim())) &&
          !i.warnings.length,
      );
      if (!clean.length) throw new ClinicError("imp.nothingToApprove");
      if (
        !(await tx.employee.findFirst({
          where: { id: clean[0].matchedEmployeeId!, isArchived: false },
        }))
      )
        throw new ClinicError("v2.invalid");
      await tx.labImportItem.updateMany({
        where: { id: { in: clean.map((i) => i.id) } },
        data: {
          review: "APPROVED",
          reviewedAt: new Date(),
          reviewedById: user.id,
        },
      });
      await writeAudit(
        {
          user,
          action: "REVIEW",
          entity: "LabImportBatch",
          entityId: batchId,
          summary: "اعتماد مجموعة نتائج لموظف واحد",
          meta: { itemIds: clean.map((i) => i.id) },
        },
        tx,
      );
    });
    refresh(batchId);
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}
export async function commitBatchAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requirePermission("import.run"),
    batchId = String(form.get("batchId") || "");
  try {
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"batch:" + batchId}))`;
        const batch = await tx.labImportBatch.findUnique({
          where: { id: batchId },
          include: {
            attachment: { select: { sha256: true } },
            items: {
              where: { review: "APPROVED", committedLabResultId: null },
              include: {
                matchedEmployee: { select: { gender: true, isArchived: true } },
              },
            },
          },
        });
        if (!batch) throw new ClinicError("v2.invalid");
        if (batch.status === "COMMITTED") return;
        if (batch.status === "EXTRACTING") throw new ClinicError("v2.conflict");
        let saved = 0,
          duplicates = 0;
        for (const item of batch.items) {
          const def = item.testCode ? TEST_BY_CODE[item.testCode] : undefined;
          if (
            !def ||
            !item.matchedEmployeeId ||
            !item.matchedEmployee ||
            item.matchedEmployee.isArchived ||
            !item.reviewedById ||
            !item.reviewedAt
          )
            throw new ClinicError("v2.invalid");
          const range = sameUnit(item.unit, def.unit)
            ? refFor(def, item.matchedEmployee.gender)
            : undefined;
          const sourceFingerprint = createHash("sha256")
            .update(
              JSON.stringify([
                batch.attachment.sha256,
                item.page,
                item.matchedEmployeeId,
                item.testCode,
                item.resultType,
                item.valueNum,
                item.comparator,
                item.valueText?.trim().toLowerCase(),
                item.unit?.toLowerCase(),
                item.collectedAt?.toISOString(),
                item.sampleNo,
                item.orderNo,
              ]),
            )
            .digest("hex");
          if (await tx.labResult.findUnique({ where: { sourceFingerprint } })) {
            await tx.labImportItem.update({
              where: { id: item.id },
              data: { review: "REJECTED", rejectReason: "v2.duplicateSource" },
            });
            duplicates++;
            continue;
          }
          const refLow = item.refLow ?? range?.low ?? null,
            refHigh = item.refHigh ?? range?.high ?? null;
          const flag = computeFlag({
            testCode: item.testCode!,
            resultType: item.resultType,
            valueNum: item.valueNum,
            valueText: item.valueText,
            unit: item.unit,
            comparator: item.comparator,
            refLow,
            refHigh,
            sex: item.matchedEmployee.gender,
          });
          const lab = await tx.labResult.create({
            data: {
              employeeId: item.matchedEmployeeId,
              testCode: item.testCode!,
              testName: def.nameEn,
              resultType: item.resultType,
              valueNum: item.valueNum,
              valueText: item.valueText,
              unit: item.unit,
              comparator: item.comparator,
              rawValue: item.rawValue,
              sourceFingerprint,
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
              requiresReview: requiresReview(flag, item.testCode!),
              sourceAttachmentId: batch.attachmentId,
              sourcePage: item.page,
              extractionConfidence: item.confidence,
              extractionCitation: item.citation,
              createdById: user.id,
            },
          });
          await tx.labImportItem.update({
            where: { id: item.id },
            data: { committedLabResultId: lab.id },
          });
          saved++;
        }
        const remaining = await tx.labImportItem.count({
          where: {
            batchId,
            OR: [
              { review: "PENDING" },
              { review: "APPROVED", committedLabResultId: null },
            ],
          },
        });
        const gaps = Boolean(
          batch.extractionNote?.startsWith("imp.partialExtraction"),
        );
        await tx.labImportBatch.update({
          where: { id: batchId },
          data: {
            status: remaining === 0 && !gaps ? "COMMITTED" : "NEEDS_REVIEW",
            committedAt: new Date(),
          },
        });
        await writeAudit(
          {
            user,
            action: "IMPORT_COMMIT",
            entity: "LabImportBatch",
            entityId: batchId,
            summary: "حفظ النتائج المعتمدة في الملفات الصحية",
            meta: { saved, duplicates, remaining, unreviewedPages: gaps },
          },
          tx,
        );
      },
      { timeout: 120000 },
    );
    refresh(batchId);
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}
export async function retryExtraction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requirePermission("import.run"),
    id = String(form.get("batchId") || "");
  const batch = await db.labImportBatch.findUnique({
    where: { id },
    include: { attachment: true, _count: { select: { items: true } } },
  });
  if (!batch?.attachment.isComplete || batch._count.items > 0)
    return { error: "v2.conflict" };
  if (batch.leaseUntil && batch.leaseUntil > new Date())
    return { error: "v2.processing" };
  await stageBatch({
    batchId: id,
    bytes: Buffer.from(batch.attachment.data),
    mimeType: batch.attachment.mimeType,
    user,
  });
  refresh(id);
  return { ok: true };
}
export async function addManualImportItem(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requirePermission("import.run"),
    batchId = String(form.get("batchId") || ""),
    page = Number(form.get("page") || 1);
  try {
    const data = observation(form);
    if (!Number.isInteger(page) || page < 1 || page > 1000)
      return { error: "v2.invalid" };
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"batch:" + batchId}))`;
      const batch = await tx.labImportBatch.findUnique({
        where: { id: batchId },
        include: { attachment: { select: { isComplete: true } } },
      });
      if (
        !batch?.attachment.isComplete ||
        batch.status === "EXTRACTING" ||
        batch.status === "COMMITTED"
      )
        throw new ClinicError("v2.conflict");
      const employee = await tx.employee.findFirst({
        where: { id: data.matchedEmployeeId, isArchived: false },
      });
      if (!employee) throw new ClinicError("v2.invalid");
      const item = await tx.labImportItem.create({
        data: {
          ...data,
          batchId,
          page,
          testName: TEST_BY_CODE[data.testCode].nameEn,
          matchStatus: "MATCHED",
          extractedNationalId: employee.nationalId,
          extractedName: employee.name,
          nationalIdValid: true,
          citation: "Manual transcription from source document",
          sourceKey: "manual-" + crypto.randomUUID(),
          confidence: 1,
        },
      });
      await tx.labImportBatch.update({
        where: { id: batchId },
        data: {
          status: "NEEDS_REVIEW",
          error: null,
          pageCount: Math.max(page, batch.pageCount),
          extractionNote:
            batch.extractionNote ||
            (batch.status === "FAILED" ? "imp.partialExtraction:manual" : null),
        },
      });
      await writeAudit(
        {
          user,
          action: "CREATE",
          entity: "LabImportItem",
          entityId: item.id,
          summary: "إدخال نتيجة يدويًا من المستند الأصلي",
          meta: { batchId, page },
        },
        tx,
      );
    });
    refresh(batchId);
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}
export async function acknowledgeExtractionGaps(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requirePermission("import.run"),
    id = String(form.get("batchId") || "");
  if (form.get("confirmed") !== "on") return { error: "v2.invalid" };
  try {
    await db.$transaction(async (tx) => {
      const batch = await tx.labImportBatch.findUniqueOrThrow({
        where: { id },
      });
      if (!batch.extractionNote?.startsWith("imp.partialExtraction")) return;
      await tx.labImportBatch.update({
        where: { id },
        data: { extractionNote: "ACK|" + batch.extractionNote },
      });
      await writeAudit(
        {
          user,
          action: "REVIEW",
          entity: "LabImportBatch",
          entityId: id,
          summary: "مراجعة الصفحات غير المستخرجة يدويًا",
          meta: { coverage: batch.extractionNote },
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
