"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { Alert, Card, Empty, SectionTitle } from "@/components/ui";
import { CommitBatch, ReviewItem, type PickEmployee, type ReviewItemData } from "./ReviewItem";

/**
 * Split review: the original document on one side, the extracted candidates on
 * the other. Clicking a candidate's page button jumps the viewer to that page,
 * so every field can be checked against the source before it is approved.
 */
export function ReviewWorkspace({
  batchId,
  attachmentId,
  mimeType,
  filename,
  items,
  employees,
  approvedCount,
  pendingCount,
  rejectedCount,
}: {
  batchId: string;
  attachmentId: string;
  mimeType: string;
  filename: string;
  items: ReviewItemData[];
  employees: PickEmployee[];
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
}) {
  const t = useT();
  const [page, setPage] = useState(items[0]?.page ?? 1);
  const isPdf = mimeType === "application/pdf";
  const src = `/api/attachments/${attachmentId}${isPdf ? `#page=${page}&view=FitH` : ""}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-4 lg:self-start">
        <Card pad={false}>
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <SectionTitle>{t("imp.source")}</SectionTitle>
            <a href={`/api/attachments/${attachmentId}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
              {t("action.open")}
            </a>
          </div>
          <div className="border-t" style={{ height: "70vh", background: "var(--surface-2)" }}>
            {isPdf ? (
              <iframe
                key={page}
                src={src}
                title={filename}
                className="h-full w-full"
                style={{ border: 0 }}
              />
            ) : (
              <div className="h-full overflow-auto p-2">
                <img src={src} alt={filename} className="mx-auto max-w-full" />
              </div>
            )}
          </div>
        </Card>
      </div>

      <div>
        <Card className="mb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-4 text-xs">
              <span>
                <span className="num text-lg font-bold" style={{ color: "var(--ok)" }}>
                  {approvedCount}
                </span>{" "}
                <span style={{ color: "var(--text-muted)" }}>{t("imp.approvedCount")}</span>
              </span>
              <span>
                <span className="num text-lg font-bold" style={{ color: "var(--warn)" }}>
                  {pendingCount}
                </span>{" "}
                <span style={{ color: "var(--text-muted)" }}>{t("imp.pendingCount")}</span>
              </span>
              <span>
                <span className="num text-lg font-bold" style={{ color: "var(--text-faint)" }}>
                  {rejectedCount}
                </span>{" "}
                <span style={{ color: "var(--text-muted)" }}>{t("imp.rejectedCount")}</span>
              </span>
            </div>
            {approvedCount > 0 && <CommitBatch batchId={batchId} approvedCount={approvedCount} />}
          </div>
        </Card>

        <div className="mb-3">
          <Alert tone="warn">{t("imp.reviewHint")}</Alert>
        </div>

        {items.length === 0 ? (
          <Card>
            <Empty title={t("imp.noItems")} />
          </Card>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <ReviewItem key={item.id} item={item} employees={employees} onFocusPage={setPage} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
