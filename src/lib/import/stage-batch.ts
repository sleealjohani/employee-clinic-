import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { parseLabNumber, latinDigits } from "@/lib/clinical/numeric";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { validateNationalId } from "@/lib/validation";
import { resolveTestCode } from "@/lib/catalog/tests";
import {
  PROMPT_VERSION,
  extractLabReport,
  importAvailability,
  type ExtractedResult,
  type ExtractionOutput,
} from "@/lib/ai/extract";
import {
  LOCAL_EXTRACTION_MODEL,
  LOCAL_PROMPT_VERSION,
  extractLocalPdfReport,
} from "@/lib/import/local-pdf";

/**
 * Extraction and candidate staging, shared by the two ways a report arrives:
 * a small file posted straight to a Server Action, and a large one streamed in
 * chunks through the upload route. Both end at the same place — candidate rows
 * awaiting a human, never a health record.
 */

export const ACCEPTED_UPLOAD_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

const EXTENSION_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Settle what a file actually is.
 *
 * A phone picking a report out of Files or iCloud Drive frequently hands over
 * an empty type, or application/octet-stream, even for an ordinary PDF —
 * trusting the browser's label alone rejects a perfectly good report with a
 * message about unsupported formats. The extension decides when the label is
 * missing or generic; a label we recognise still wins.
 */
export function resolveUploadType(
  mimeType: string,
  filename: string,
): string | null {
  const declared = (mimeType ?? "").trim().toLowerCase();
  if (ACCEPTED_UPLOAD_TYPES.includes(declared)) return declared;

  const generic =
    !declared ||
    declared === "application/octet-stream" ||
    declared === "binary/octet-stream";
  if (!generic) return null;

  const extension = (filename ?? "").toLowerCase().split(".").pop() ?? "";
  return EXTENSION_TYPES[extension] ?? null;
}

type Actor = Parameters<typeof writeAudit>[0]["user"];

function num(value: string): number | null {
  const parsed = parseLabNumber(value);
  return parsed.comparator === "EQ" ? parsed.value : null;
}

export function parseResultDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value
    ? null
    : d;
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
function buildItem(
  batchId: string,
  report: {
    patient: {
      national_id: string;
      full_name: string;
      employee_no: string;
      confidence: number;
    };
  },
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
  const code =
    resolveTestCode(result.test_code) ?? resolveTestCode(result.test_name);
  const numeric = parseLabNumber(result.value_number);
  const valueNum = numeric.value;
  const collectedAt = parseResultDate(result.collected_at);

  const warnings: string[] = [];
  if (!identity.rawId) warnings.push("NO_ID");
  else if (!identity.idValid) warnings.push("INVALID_ID");
  if (!code) warnings.push("UNKNOWN_TEST");
  if (result.result_type === "QUANTITATIVE" && !result.unit)
    warnings.push("MISSING_UNIT");
  if (!collectedAt) warnings.push("MISSING_DATE");
  if (numeric.comparator !== "EQ") warnings.push("COMPARATOR");
  if (valueNum === null && !result.value_text.trim()) warnings.push("NO_VALUE");
  if (collectedAt && collectedAt.getTime() > Date.now())
    warnings.push("FUTURE_DATE");
  if (result.confidence < 0.75 || report.patient.confidence < 0.75)
    warnings.push("LOW_CONFIDENCE");
  if (result.carried_identity) warnings.push("CARRIED_ID");

  // A continuation page inherited its patient from the page before; that is a
  // strong hint, never a confirmed link, so it is always offered for confirmation.
  const matchStatus =
    result.carried_identity && identity.matchStatus === "MATCHED"
      ? "SUGGESTED"
      : identity.matchStatus;

  return {
    batchId,
    page: result.page || 1,
    extractedNationalId: identity.rawId || null,
    extractedName: report.patient.full_name || null,
    extractedEmployeeNo: report.patient.employee_no || null,
    nationalIdValid: identity.idValid,
    matchStatus,
    matchScore: identity.matchScore,
    matchedEmployeeId: identity.matchedEmployeeId,
    testCode: code,
    testName: result.test_name || null,
    resultType:
      result.result_type === "QUALITATIVE"
        ? ("QUALITATIVE" as const)
        : ("QUANTITATIVE" as const),
    valueNum,
    comparator: numeric.comparator,
    rawValue: result.value_number || result.value_text || null,
    sourceKey: createHash("sha256")
      .update(
        JSON.stringify([
          identity.rawId,
          result.page,
          code,
          result.quote,
          result.value_number,
          result.value_text,
          result.sample_no,
          result.order_no,
        ]),
      )
      .digest("hex"),
    valueText: result.value_text || null,
    unit: result.unit || null,
    refLow: num(result.reference_low),
    refHigh: num(result.reference_high),
    refText: result.reference_text || null,
    collectedAt,
    verifiedAt: parseResultDate(result.verified_at),
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

export async function stageBatch({
  batchId,
  bytes,
  mimeType,
  user,
}: {
  batchId: string;
  bytes: Buffer;
  mimeType: string;
  user: Actor;
}): Promise<void> {
  const claimed = await db.labImportBatch.updateMany({
    where: {
      id: batchId,
      status: { in: ["UPLOADED", "FAILED", "EXTRACTING"] },
      items: { none: {} },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
    },
    data: {
      status: "EXTRACTING",
      leaseUntil: new Date(Date.now() + 6 * 60000),
      attemptCount: { increment: 1 },
      error: null,
    },
  });
  if (!claimed.count) return;
  const aiAvailability = importAvailability();
  try {
    let output: ExtractionOutput;
    let promptVersion = PROMPT_VERSION;
    let extractionMode: "LOCAL" | "AI" = "AI";

    if (mimeType === "application/pdf") {
      let localOutput: ExtractionOutput | null = null;
      try {
        localOutput = await extractLocalPdfReport(bytes);
      } catch (localError) {
        // A malformed/encrypted PDF may not expose a text layer. Only fall back
        // externally when that fallback was explicitly configured.
        if (!aiAvailability.enabled) throw localError;
      }

      const localRows =
        localOutput?.reports.reduce(
          (sum, report) => sum + report.results.length,
          0,
        ) ?? 0;
      if (localOutput && localRows > 0) {
        output = localOutput;
        promptVersion = LOCAL_PROMPT_VERSION;
        extractionMode = "LOCAL";
      } else if (aiAvailability.enabled) {
        output = await extractLabReport(bytes, mimeType);
        promptVersion = PROMPT_VERSION;
        extractionMode = "AI";
      } else {
        output = localOutput ?? {
          reports: [],
          usage: { inputTokens: 0, outputTokens: 0 },
          model: LOCAL_EXTRACTION_MODEL,
        };
        promptVersion = LOCAL_PROMPT_VERSION;
        extractionMode = "LOCAL";
      }
    } else {
      output = await extractLabReport(bytes, mimeType);
      promptVersion = PROMPT_VERSION;
      extractionMode = "AI";
    }

    const employees = await db.employee.findMany({
      where: { isArchived: false },
      select: {
        id: true,
        name: true,
        nameEn: true,
        nationalId: true,
        employeeNo: true,
        gender: true,
      },
    });
    const byNationalId = new Map(
      employees.map((e) => [e.nationalId.trim(), e]),
    );

    let pageCount = 0;
    const rows: Prisma.LabImportItemCreateManyInput[] = [];

    for (const report of output.reports) {
      pageCount = Math.max(pageCount, report.page_to || 0);

      const rawId = latinDigits(report.patient.national_id).replace(/\s/g, "");
      const idCheck = rawId
        ? validateNationalId(rawId)
        : { valid: false, known: true as const };

      // Identity resolution: the national ID is the only key that links automatically.
      let matchStatus: "MATCHED" | "SUGGESTED" | "UNMATCHED" = "UNMATCHED";
      let matchedEmployeeId: string | null = null;
      let matchScore: number | null = null;

      const exact = rawId ? byNationalId.get(rawId) : undefined;
      if (exact && idCheck.valid) {
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
          if (score >= 0.6 && (!best || score > best.score))
            best = { id: emp.id, score };
        }
        if (best) {
          matchStatus = "SUGGESTED";
          matchedEmployeeId = best.id;
          matchScore = Math.round(best.score * 100) / 100;
        }
      }

      for (const result of report.results) {
        rows.push(
          buildItem(batchId, report, result, {
            rawId,
            idValid: Boolean(rawId) && idCheck.valid,
            idKnown: idCheck.known,
            matchStatus,
            matchedEmployeeId,
            matchScore,
          }),
        );
      }
    }

    await db.$transaction(
      async (tx) => {
        for (let offset = 0; offset < rows.length; offset += 400)
          await tx.labImportItem.createMany({
            data: rows.slice(offset, offset + 400),
            skipDuplicates: true,
          });

        // Nothing extracted has two quite different causes, and the reader can only
        // act on the right one: a scan carries no text to read, whereas a digital
        // report that yielded nothing means the layout was not recognised.
        const noTextLayer =
          extractionMode === "LOCAL" && output.textPages === 0;

        await tx.labImportBatch.update({
          where: { id: batchId },
          data: {
            status: rows.length > 0 ? "NEEDS_REVIEW" : "FAILED",
            error:
              rows.length > 0
                ? null
                : noTextLayer
                  ? "imp.noTextLayer"
                  : "imp.noItems",
            pageCount: output.pageCount ?? pageCount,
            leaseUntil: null,
            extractionNote: output.unreadPages?.length
              ? `imp.partialExtraction|${output.unreadPages.join(",")}`
              : null,
            model: output.model,
            promptVersion,
            inputTokens: output.usage.inputTokens,
            outputTokens: output.usage.outputTokens,
          },
        });

        await writeAudit(
          {
            user,
            action: "IMPORT_EXTRACT",
            entity: "LabImportBatch",
            entityId: batchId,
            summary: `استخراج ${rows.length} نتيجة من ${output.reports.length} تقرير`,
            meta: {
              mode: extractionMode,
              model: output.model,
              promptVersion,
              inputTokens: output.usage.inputTokens,
              outputTokens: output.usage.outputTokens,
              externalProcessing: extractionMode === "AI",
            },
          },
          tx,
        );
      },
      { timeout: 60000 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    await db.labImportBatch.update({
      where: { id: batchId },
      data: {
        status: "FAILED",
        error: message.slice(0, 500),
        leaseUntil: null,
      },
    });
    await writeAudit({
      user,
      action: "IMPORT_EXTRACT",
      entity: "LabImportBatch",
      entityId: batchId,
      summary: `فشل الاستخراج: ${message.slice(0, 200)}`,
    });
  }
}
