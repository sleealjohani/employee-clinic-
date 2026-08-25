"use client";

/* eslint-disable @next/next/no-img-element */

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useT } from "@/lib/i18n/client";
import { Alert, Card, Chip, Empty, SectionTitle } from "@/components/ui";
import { CommitBatch, ReviewItem, type PickEmployee, type ReviewItemData } from "./ReviewItem";
import { approvePersonAction } from "@/server/actions/import";
import type { ActionState } from "@/server/actions/employees";
import styles from "./ReviewWorkspace.module.css";

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

type Person = {
  key: string;
  name: string;
  nationalId: string;
  matchStatus: ReviewItemData["matchStatus"];
  pages: number[];
  items: ReviewItemData[];
  attention: number;
  pending: number;
};


/** How many of a person's pending results the bulk control would actually take. */
function cleanCount(person: Person): number {
  return person.items.filter(
    (item) =>
      item.review === "PENDING" &&
      item.matchStatus === "MATCHED" &&
      item.matchedEmployeeId !== null &&
      item.testCode !== null &&
      (item.valueNum !== null || (item.valueText ?? "").trim() !== "") &&
      item.warnings.length === 0,
  ).length;
}

function ApproveAllButton({ count, outstanding }: { count: number; outstanding: number }) {
  const t = useT();
  const { pending } = useFormStatus();
  // When some of the person's results still need a decision of their own, the
  // label says so — "approve 4" next to eight rows would read as "approve all".
  const label = count === outstanding ? `${t("imp.approvePerson")} (${count})` : t("imp.approveClean", { count, outstanding });
  return (
    <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
      {pending ? t("action.saving") : label}
    </button>
  );
}

function ApproveAll({ batchId, person }: { batchId: string; person: Person }) {
  const t = useT();
  const [state, formAction] = useActionState<ActionState, FormData>(approvePersonAction, {});
  const count = cleanCount(person);
  const outstanding = person.items.filter((item) => item.review === "PENDING").length;
  if (count === 0) return null;
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="ids" value={person.items.map((i) => i.id).join(",")} />
      <ApproveAllButton count={count} outstanding={outstanding} />
      {state.error && (
        <span className="text-[0.68rem] font-semibold" style={{ color: "var(--danger)" }}>
          {t(state.error)}
        </span>
      )}
    </form>
  );
}

/**
 * A screening batch is a stack of people, not a stack of pages: one upload can
 * carry a hundred employees and several hundred results. The roster on one side
 * is the whole batch at a glance; the panel on the other holds only the person
 * being reviewed, so the browser is never asked to render every candidate at
 * once and the reviewer works one file at a time.
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
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [page, setPage] = useState(items[0]?.page ?? 1);

  const isPdf = mimeType === "application/pdf";
  const src = `/api/attachments/${attachmentId}${isPdf ? `#page=${page}&view=FitH` : ""}`;

  // One entry per person in the batch. Results are keyed on the matched
  // employee where there is one, so a report that spilled onto a continuation
  // page stays with its owner rather than appearing as a second person.
  const people = useMemo(() => {
    const byKey = new Map<string, Person>();
    for (const item of items) {
      const key =
        item.matchedEmployeeId ??
        (item.extractedNationalId || item.extractedName || `page-${item.page}`);
      let person = byKey.get(key);
      if (!person) {
        person = {
          key,
          name: item.extractedName ?? t("common.notRecorded"),
          nationalId: item.extractedNationalId ?? "—",
          matchStatus: item.matchStatus,
          pages: [],
          items: [],
          attention: 0,
          pending: 0,
        };
        byKey.set(key, person);
      }
      person.items.push(item);
      if (!person.pages.includes(item.page)) person.pages.push(item.page);
      if (MATCHES.attention(item)) person.attention++;
      if (item.review === "PENDING") person.pending++;
      // The weakest link in a person's results is the one worth surfacing.
      if (item.matchStatus === "UNMATCHED") person.matchStatus = "UNMATCHED";
      else if (item.matchStatus === "SUGGESTED" && person.matchStatus === "MATCHED") {
        person.matchStatus = "SUGGESTED";
      }
    }
    return [...byKey.values()].sort((a, b) => Math.min(...a.pages) - Math.min(...b.pages));
  }, [items, t]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return people.filter((person) => {
      if (filter === "attention" && person.attention === 0) return false;
      if (filter === "pending" && person.pending === 0) return false;
      if (filter === "decided" && person.pending === person.items.length) return false;
      if (!q) return true;
      return `${person.name} ${person.nationalId}`.toLocaleLowerCase().includes(q);
    });
  }, [people, filter, query]);

  const selected = visible.find((p) => p.key === selectedKey) ?? visible[0] ?? null;
  const attentionTotal = items.filter(MATCHES.attention).length;

  function choose(person: Person) {
    setSelectedKey(person.key);
    setPage(Math.min(...person.pages));
  }

  return (
    <>
      <Card className="mb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-4 text-xs">
            <span>
              <span className="num text-lg font-bold">{people.length}</span>{" "}
              <span style={{ color: "var(--text-muted)" }}>{t("imp.peopleCount")}</span>
            </span>
            <span>
              <span className="num text-lg font-bold">{items.length}</span>{" "}
              <span style={{ color: "var(--text-muted)" }}>{t("imp.resultCount")}</span>
            </span>
            <span>
              <span className="num text-lg font-bold" style={{ color: "var(--ok)" }}>{approvedCount}</span>{" "}
              <span style={{ color: "var(--text-muted)" }}>{t("imp.approvedCount")}</span>
            </span>
            <span>
              <span className="num text-lg font-bold" style={{ color: "var(--warn)" }}>{pendingCount}</span>{" "}
              <span style={{ color: "var(--text-muted)" }}>{t("imp.pendingCount")}</span>
            </span>
            <span>
              <span className="num text-lg font-bold" style={{ color: "var(--text-faint)" }}>{rejectedCount}</span>{" "}
              <span style={{ color: "var(--text-muted)" }}>{t("imp.rejectedCount")}</span>
            </span>
          </div>
          {approvedCount > 0 && <CommitBatch batchId={batchId} approvedCount={approvedCount} />}
        </div>
      </Card>

      <div className="mb-3">
        <Alert tone="warn">{t("imp.reviewHint")}</Alert>
      </div>

      <section className={styles.workspace}>
        <div className={`${styles.roster} glass`}>
          <div className={styles.rosterHead}>
            <input
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("imp.searchPeople")}
              aria-label={t("imp.searchPeople")}
            />
            <div className={styles.filters}>
              {(["all", "attention", "pending", "decided"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`btn btn-sm ${filter === key ? "btn-primary" : "btn-ghost"}`}
                >
                  {t(`imp.filter.${key}`)}
                  {key === "attention" && attentionTotal > 0 && <span className="num"> · {attentionTotal}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.rosterList} role="listbox" aria-label={t("imp.peopleCount")}>
            {visible.length === 0 ? (
              <p className={styles.empty}>{t("imp.noItems")}</p>
            ) : (
              visible.map((person) => (
                <button
                  key={person.key}
                  type="button"
                  role="option"
                  aria-selected={selected?.key === person.key}
                  className={styles.person}
                  data-selected={selected?.key === person.key || undefined}
                  data-tone={MATCH_TONE[person.matchStatus]}
                  onClick={() => choose(person)}
                >
                  <span className={styles.personBody}>
                    <strong dir="auto">{person.name}</strong>
                    <small className="num" dir="ltr">{person.nationalId}</small>
                  </span>
                  <span className={styles.personTags}>
                    <span className="num" title={t("imp.resultCount")}>{person.items.length}</span>
                    {person.attention > 0 && (
                      <span className={styles.attentionDot} title={t("imp.filter.attention")} />
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className={styles.detail}>
          {!selected ? (
            <Card>
              <Empty title={t("imp.noItems")} />
            </Card>
          ) : (
            <>
              <Card className="mb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-black" dir="auto">{selected.name}</h3>
                    <p className="num mt-0.5 text-xs" style={{ color: "var(--text-faint)" }} dir="ltr">
                      {selected.nationalId} · {t("imp.pages")} {selected.pages.join(", ")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={MATCH_TONE[selected.matchStatus]}>{t(`imp.match.${selected.matchStatus}`)}</Chip>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowSource((open) => !open)}
                    >
                      {showSource ? t("imp.hideSource") : t("imp.source")}
                    </button>
                    <ApproveAll batchId={batchId} person={selected} />
                  </div>
                </div>

                {/* The document is only fetched when a reviewer asks for it —
                    a batch can be tens of megabytes, and most rows are checked
                    against their quoted line without opening it. */}
                {showSource && (
                  <div className="mt-3 border-t pt-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <SectionTitle>{t("imp.source")}</SectionTitle>
                      <a
                        href={`/api/attachments/${attachmentId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-ghost btn-sm"
                      >
                        {t("action.open")}
                      </a>
                    </div>
                    <div style={{ height: "60vh", background: "var(--surface-2)", borderRadius: "0.9rem", overflow: "hidden" }}>
                      {isPdf ? (
                        <object key={page} data={src} type="application/pdf" className="h-full w-full">
                          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                            <p className="text-sm font-semibold">{filename}</p>
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
                  </div>
                )}
              </Card>

              <ul className="space-y-3">
                {selected.items.map((item) => (
                  <ReviewItem key={item.id} item={item} employees={employees} onFocusPage={setPage} />
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
    </>
  );
}
