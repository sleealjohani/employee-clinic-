import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { formatDateTime, toDateInput } from "@/lib/format";
import { Alert, Card, Chip, LinkButton, PageHeader } from "@/components/ui";
import { ReviewWorkspace } from "./ReviewWorkspace";
import { ManualImportForm } from "./ManualImportForm";
import { ActionForm } from "@/components/ui/ActionForm";
import {
  retryExtraction,
  acknowledgeExtractionGaps,
  commitBatchAction,
} from "@/server/actions/import";
import { AttachmentPreview } from "@/components/clinic/AttachmentPreview";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function ReviewBatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("import.run");
  const { id } = await params;
  const t = await getT();

  const batch = await db.labImportBatch.findUnique({
    where: { id },
    include: {
      attachment: { select: { id: true, mimeType: true, filename: true } },
      uploadedBy: { select: { name: true } },
      items: { orderBy: [{ page: "asc" }, { createdAt: "asc" }] },
    },
  });

  if (!batch) notFound();

  const employees = await db.employee.findMany({
    where: { isArchived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true, nationalId: true },
  });

  const approved = batch.items.filter(
    (i) => i.review === "APPROVED" && !i.committedLabResultId,
  ).length;
  const pending = batch.items.filter((i) => i.review === "PENDING").length;
  const rejected = batch.items.filter((i) => i.review === "REJECTED").length;

  return (
    <>
      <PageHeader
        title={t("imp.reviewTitle")}
        subtitle={`${batch.filename} · ${batch.uploadedBy?.name ?? "—"} · ${formatDateTime(batch.createdAt, t.locale)}`}
        badge={
          <Chip
            tone={
              batch.status === "COMMITTED"
                ? "ok"
                : batch.status === "FAILED"
                  ? "danger"
                  : "warn"
            }
            dot
          >
            {t(`importStatus.${batch.status}`)}
          </Chip>
        }
        actions={
          <LinkButton href="/labs/import">{t("action.back")}</LinkButton>
        }
      />

      {batch.status === "FAILED" && (
        <Alert tone="danger" title={t("imp.extractFailed")}>
          {t("v2.extractionFallback")}
        </Alert>
      )}
      {batch.items.length === 0 && batch.status !== "COMMITTED" && (
        <Card className="mb-4">
          <ActionForm action={retryExtraction} label={t("v2.retryExtraction")}>
            <input type="hidden" name="batchId" value={id} />
          </ActionForm>
        </Card>
      )}
      {batch.extractionNote?.startsWith("imp.partialExtraction") && (
        <Card className="mb-4">
          <Alert tone="warn">{t("v2.partialExtraction")}</Alert>
          <ActionForm
            action={acknowledgeExtractionGaps}
            label={t("v2.confirmReviewed")}
          >
            <input type="hidden" name="batchId" value={id} />
            <label className="check-line">
              <input type="checkbox" name="confirmed" required />
              {t("v2.pagesReviewed")}
            </label>
          </ActionForm>
        </Card>
      )}
      {batch.items.length > 0 && (
        <ReviewWorkspace
          batchId={batch.id}
          attachmentId={batch.attachment.id}
          mimeType={batch.attachment.mimeType}
          filename={batch.attachment.filename}
          employees={employees}
          approvedCount={approved}
          pendingCount={pending}
          rejectedCount={rejected}
          items={batch.items.map((item) => ({
            id: item.id,
            page: item.page,
            extractedNationalId: item.extractedNationalId,
            extractedName: item.extractedName,
            extractedEmployeeNo: item.extractedEmployeeNo,
            nationalIdValid: item.nationalIdValid,
            matchStatus: item.matchStatus,
            matchScore: item.matchScore,
            matchedEmployeeId: item.matchedEmployeeId,
            testCode: item.testCode,
            testName: item.testName,
            resultType: item.resultType,
            comparator: item.comparator,
            rejectReason: item.rejectReason,
            valueNum: item.valueNum,
            valueText: item.valueText,
            unit: item.unit,
            refLow: item.refLow,
            refHigh: item.refHigh,
            collectedAt: item.collectedAt
              ? toDateInput(item.collectedAt)
              : null,
            labName: item.labName,
            confidence: item.confidence,
            citation: item.citation,
            warnings: item.warnings,
            review: item.review,
            committed: Boolean(item.committedLabResultId),
          }))}
        />
      )}
      {batch.items.length === 0 && (
        <Card className="mt-4">
          <AttachmentPreview id={batch.attachment.id} />
        </Card>
      )}
      {batch.status !== "COMMITTED" && (
        <Card className="mt-4">
          <details>
            <summary className="section-heading">
              {t("v2.manualResult")}
            </summary>
            <ManualImportForm batchId={id} employees={employees} />
          </details>
        </Card>
      )}
      {batch.items.length > 0 &&
        approved === 0 &&
        pending === 0 &&
        batch.status !== "COMMITTED" &&
        !batch.extractionNote?.startsWith("imp.partialExtraction") && (
          <Card className="mt-4">
            <ActionForm action={commitBatchAction} label={t("v2.finishReview")}>
              <input type="hidden" name="batchId" value={id} />
            </ActionForm>
          </Card>
        )}
    </>
  );
}
