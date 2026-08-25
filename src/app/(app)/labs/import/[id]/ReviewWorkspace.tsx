"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { Alert, Card, Chip, Empty, SectionTitle } from "@/components/ui";
import { CommitBatch, ReviewItem, type PickEmployee, type ReviewItemData } from "./ReviewItem";

const MATCH_TONE = { MATCHED: "ok", SUGGESTED: "warn", UNMATCHED: "danger" } as const;

type Filter = "all" | "attention" | "pending" | "decided";

/** "Attention" is anything a reviewer cannot approve on sight: an identity the
 *  system could not confirm, a carried-over identity, or a shaky extraction. */
const MATCHES: Record<Filter, (item: ReviewItemData) => boolean> = {
  all: () => true,
  attention: (item) =>
    item.matchStatus !== "MATCHED" || item.warnings.length > 0 || (item.confidence ?? 1) < 0.75,
  pending: (item) => item.review === "PENDING",
  decided: (item) => item.review !== "PENDING",
};

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
  const [filter, setFilter] = useState<Filter>("all");
  const isPdf = mimeType === "application/pdf";
  const src = `/api/attachments/${attachmentId}${isPdf ? `#page=${page}&view=FitH` : ""}`;

  // A mass report is a stack of per-employee pages, so the review reads as a
  // stack of pages too — not as one long undifferentiated list of results.
  const groups = useMemo(() => {
    const visible = items.filter((item) => MATCHES[filter](item));
    const byPage = new Map<number, ReviewItemData[]>();
    for (const item of visible) {
      const list = byPage.get(item.page) ?? [];
      list.push(item);
      byPage.set(item.page, list);
    }
    return [...byPage.entries()].sort((a, b) => a[0] - b[0]);
  }, [items, filter]);

  const attention = items.filter(MATCHES.attention).length;

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
              // <object> rather than <iframe>: browsers without an inline PDF
              // viewer render the fallback instead of a blank pane, and seeing
              // the source is the whole point of this screen.
              <object key={page} data={src} type="application/pdf" className="h-full w-full">
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <p className="text-sm font-semibold">{filename}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {t("imp.source")}
                  </p>
                  <a
                    href={`/api/attachments/${attachmentId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-primary btn-sm"
                  >
                    {t("action.open")}
                  </a>
                </div>
              </object>
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

        <div className="mb-3 flex flex-wrap gap-2">
          {(["all", "attention", "pending", "decided"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`btn btn-sm ${filter === key ? "btn-primary" : "btn-ghost"}`}
            >
              {t(`imp.filter.${key}`)}
              {key === "attention" && attention > 0 && <span className="num"> · {attention}</span>}
            </button>
          ))}
        </div>

        {groups.length === 0 ? (
          <Card>
            <Empty title={t("imp.noItems")} />
          </Card>
        ) : (
          <div className="space-y-4">
            {groups.map(([pageNo, pageItems]) => {
              const head = pageItems[0];
              return (
                <section key={pageNo}>
                  <button
                    type="button"
                    onClick={() => setPage(pageNo)}
                    className="page-group-head lift"
                    data-active={page === pageNo || undefined}
                  >
                    <span className="page-group-no num">{pageNo}</span>
                    <span className="page-group-body">
                      <strong dir="auto">{head.extractedName ?? t("common.notRecorded")}</strong>
                      <small className="num" dir="ltr">
                        {head.extractedNationalId ?? "—"}
                      </small>
                    </span>
                    <Chip tone={MATCH_TONE[head.matchStatus]}>{t(`imp.match.${head.matchStatus}`)}</Chip>
                    <span className="num text-xs" style={{ color: "var(--text-faint)" }}>
                      {pageItems.length}
                    </span>
                  </button>

                  <ul className="mt-2 space-y-3">
                    {pageItems.map((item) => (
                      <ReviewItem key={item.id} item={item} employees={employees} onFocusPage={setPage} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
