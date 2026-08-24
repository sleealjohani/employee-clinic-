"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useT } from "@/lib/i18n/client";
import { Chip, Field } from "@/components/ui";
import { importEmployeesAction, type EmployeeImportState } from "@/server/actions/employee-import";

function Submit() {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? t("action.saving") : t("action.upload")}
    </button>
  );
}

const OUTCOME_TONE = { CREATED: "ok", UPDATED: "accent", SKIPPED: "warn" } as const;

export function EmployeeImportForm() {
  const t = useT();
  const [state, formAction] = useActionState<EmployeeImportState, FormData>(importEmployeesAction, {});

  return (
    <>
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <Field label={t("imp.file")} required>
            <input className="input" type="file" name="file" accept=".xlsx,.xls,.csv" required />
          </Field>
        </div>
        <label className="flex items-center gap-1.5 pb-2 text-xs font-semibold">
          <input type="checkbox" name="dryRun" defaultChecked />
          {t("imp.review")}
        </label>
        <Submit />
      </form>

      {state.error && (
        <p
          className="mt-3 rounded-lg px-3 py-2 text-xs font-semibold"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
          role="alert"
        >
          {t(state.error)}
        </p>
      )}

      {state.summary && (
        <div className="mt-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {state.dryRun && <Chip tone="warn">{t("imp.review")}</Chip>}
            <Chip tone="ok">
              {t("action.add")}: {state.summary.created}
            </Chip>
            <Chip tone="accent">
              {t("action.edit")}: {state.summary.updated}
            </Chip>
            <Chip tone="warn">
              {t("imp.rejectedCount")}: {state.summary.skipped}
            </Chip>
          </div>

          {state.rows && state.rows.length > 0 && (
            <div className="table-wrap border-t">
              <table className="data">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t("emp.nationalId")}</th>
                    <th>{t("emp.name")}</th>
                    <th>{t("common.status")}</th>
                    <th>{t("common.reason")}</th>
                  </tr>
                </thead>
                <tbody>
                  {state.rows.map((row) => (
                    <tr key={row.row}>
                      <td className="num">{row.row}</td>
                      <td className="num" dir="ltr">
                        {row.nationalId}
                      </td>
                      <td>{row.name}</td>
                      <td>
                        <Chip tone={OUTCOME_TONE[row.outcome]}>{row.outcome}</Chip>
                      </td>
                      <td>{row.reason ? t(row.reason) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
