"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useT } from "@/lib/i18n/client";
import { Chip, Field } from "@/components/ui";
import { commitBatchAction, reviewItemAction } from "@/server/actions/import";
import type { ActionState } from "@/server/actions/employees";
import { CATEGORY_LABEL, TESTS, type TestCategory } from "@/lib/catalog/tests";
import { IconCheck, IconX } from "@/components/layout/icons";

export type ReviewItemData = {
  id: string;
  page: number;
  extractedNationalId: string | null;
  extractedName: string | null;
  extractedEmployeeNo: string | null;
  nationalIdValid: boolean;
  matchStatus: "MATCHED" | "SUGGESTED" | "UNMATCHED";
  matchScore: number | null;
  matchedEmployeeId: string | null;
  testCode: string | null;
  testName: string | null;
  resultType: "QUANTITATIVE" | "QUALITATIVE";
  valueNum: number | null;
  valueText: string | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  collectedAt: string | null;
  labName: string | null;
  confidence: number | null;
  citation: string | null;
  warnings: string[];
  review: "PENDING" | "APPROVED" | "REJECTED";
  committed: boolean;
};

export type PickEmployee = { id: string; name: string; nationalId: string };

const MATCH_TONE = { MATCHED: "ok", SUGGESTED: "warn", UNMATCHED: "danger" } as const;

function Buttons() {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <div className="mt-3 flex items-center gap-2">
      <button type="submit" name="decision" value="approve" className="btn btn-primary btn-sm" disabled={pending}>
        <IconCheck size={14} /> {t("action.approve")}
      </button>
      <button type="submit" name="decision" value="reject" className="btn btn-ghost btn-sm" disabled={pending}>
        <IconX size={14} /> {t("action.reject")}
      </button>
    </div>
  );
}

export function ReviewItem({
  item,
  employees,
  onFocusPage,
}: {
  item: ReviewItemData;
  employees: PickEmployee[];
  onFocusPage: (page: number) => void;
}) {
  const t = useT();
  const [state, formAction] = useActionState<ActionState, FormData>(reviewItemAction, {});
  const [testCode, setTestCode] = useState(item.testCode ?? "");

  const decided = item.review !== "PENDING" || state.ok;
  const lowConfidence = (item.confidence ?? 1) < 0.75;

  const grouped = new Map<TestCategory, typeof TESTS>();
  for (const test of TESTS) {
    const list = grouped.get(test.category) ?? [];
    list.push(test);
    grouped.set(test.category, list);
  }

  return (
    <li
      className="card card-pad"
      style={{
        opacity: item.review === "REJECTED" ? 0.5 : 1,
        borderColor: item.review === "APPROVED" || state.ok ? "var(--ok)" : undefined,
      }}
    >
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => onFocusPage(item.page)}
          title={t("imp.citation")}
        >
          {t("common.page")} {item.page}
        </button>
        <Chip tone={MATCH_TONE[item.matchStatus]} dot>
          {t(`imp.match.${item.matchStatus}`)}
          {item.matchScore !== null && item.matchStatus === "SUGGESTED" ? ` (${item.matchScore})` : ""}
        </Chip>
        {item.confidence !== null && (
          <Chip tone={lowConfidence ? "warn" : "neutral"}>
            {t("imp.confidence")}: {Math.round(item.confidence * 100)}%
          </Chip>
        )}
        {item.review === "APPROVED" || state.ok ? <Chip tone="ok">{t("action.approve")}</Chip> : null}
        {item.review === "REJECTED" && <Chip tone="neutral">{t("action.reject")}</Chip>}
        {item.committed && <Chip tone="ok">{t("imp.committed")}</Chip>}
      </div>

      {item.warnings.length > 0 && (
        <p className="mb-2.5 flex flex-wrap gap-1.5">
          {item.warnings.map((w) => (
            <Chip key={w} tone="warn">
              {t(`imp.warn.${w}`)}
            </Chip>
          ))}
        </p>
      )}

      <dl className="mb-3 grid grid-cols-2 gap-2 rounded-lg p-2.5 text-xs" style={{ background: "var(--surface-2)" }}>
        <div>
          <dt style={{ color: "var(--text-faint)" }}>{t("emp.name")}</dt>
          <dd className="font-semibold">{item.extractedName ?? "—"}</dd>
        </div>
        <div>
          <dt style={{ color: "var(--text-faint)" }}>{t("emp.nationalId")}</dt>
          <dd className="num font-semibold" dir="ltr">
            {item.extractedNationalId ?? "—"}
          </dd>
        </div>
        <div className="col-span-2">
          <dt style={{ color: "var(--text-faint)" }}>{t("lab.test")}</dt>
          <dd className="font-semibold" dir="ltr">
            {item.testName ?? "—"}
          </dd>
        </div>
        {item.citation && (
          <div className="col-span-2">
            <dt style={{ color: "var(--text-faint)" }}>{t("imp.citation")}</dt>
            <dd className="mt-0.5 border-s-2 ps-2 font-mono text-[0.7rem]" dir="ltr" style={{ borderColor: "var(--accent)" }}>
              {item.citation}
            </dd>
          </div>
        )}
      </dl>

      {decided ? null : (
        <form action={formAction}>
          <input type="hidden" name="id" value={item.id} />

          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label={t("imp.linkEmployee")} required>
                <select className="select" name="employeeId" defaultValue={item.matchedEmployeeId ?? ""} required>
                  <option value="">—</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} — {e.nationalId}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field label={t("lab.test")} required>
                <select
                  className="select"
                  name="testCode"
                  value={testCode}
                  onChange={(e) => setTestCode(e.target.value)}
                  required
                >
                  <option value="">{t("lab.selectTest")}</option>
                  {[...grouped.entries()].map(([category, tests]) => (
                    <optgroup key={category} label={CATEGORY_LABEL[category][t.locale]}>
                      {tests.map((test) => (
                        <option key={test.code} value={test.code}>
                          {t.locale === "ar" ? test.nameAr : test.nameEn}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
            </div>

            <Field label={`${t("lab.value")} (${t("lab.quantitative")})`}>
              <input
                className="input num"
                name="valueNum"
                type="number"
                step="any"
                defaultValue={item.valueNum ?? ""}
                dir="ltr"
              />
            </Field>
            <Field label={`${t("lab.value")} (${t("lab.qualitative")})`}>
              <input className="input" name="valueText" defaultValue={item.valueText ?? ""} dir="ltr" />
            </Field>
            <Field label={t("lab.unit")}>
              <input className="input" name="unit" defaultValue={item.unit ?? ""} dir="ltr" />
            </Field>
            <Field label={t("lab.collectedAt")}>
              <input className="input" type="date" name="collectedAt" defaultValue={item.collectedAt ?? ""} />
            </Field>
            <Field label={`${t("lab.reference")} min`}>
              <input className="input num" name="refLow" type="number" step="any" defaultValue={item.refLow ?? ""} dir="ltr" />
            </Field>
            <Field label={`${t("lab.reference")} max`}>
              <input className="input num" name="refHigh" type="number" step="any" defaultValue={item.refHigh ?? ""} dir="ltr" />
            </Field>
          </div>

          {state.error && (
            <p className="mt-2 text-xs font-semibold" style={{ color: "var(--danger)" }}>
              {t(state.error)}
            </p>
          )}

          <Buttons />
        </form>
      )}
    </li>
  );
}

function CommitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "…" : label}
    </button>
  );
}

export function CommitBatch({ batchId, approvedCount }: { batchId: string; approvedCount: number }) {
  const t = useT();
  const [state, formAction] = useActionState<ActionState, FormData>(commitBatchAction, {});

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="batchId" value={batchId} />
      <CommitButton label={`${t("imp.commit")} (${approvedCount})`} />
      {state.error && (
        <span className="text-xs font-semibold" style={{ color: "var(--danger)" }}>
          {t(state.error)}
        </span>
      )}
      {state.ok && (
        <span className="text-xs font-semibold" style={{ color: "var(--ok)" }}>
          {t("imp.committed")}
        </span>
      )}
    </form>
  );
}
