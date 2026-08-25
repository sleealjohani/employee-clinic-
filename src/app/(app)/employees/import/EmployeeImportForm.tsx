"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useT } from "@/lib/i18n/client";
import { Alert, Chip, Field } from "@/components/ui";
import { importEmployeesAction, type EmployeeImportState } from "@/server/actions/employee-import";

/**
 * Preview and import are two named buttons, not a checkbox. The previous version
 * defaulted to a checked "review" box and then reported rows as CREATED/UPDATED,
 * so a run that wrote nothing looked exactly like a successful import.
 */
function Actions() {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="submit" name="mode" value="preview" className="btn btn-ghost" disabled={pending}>
        {pending ? t("action.saving") : t("empimp.preview")}
      </button>
      <button type="submit" name="mode" value="commit" className="btn btn-primary" disabled={pending}>
        {pending ? t("action.saving") : t("empimp.commit")}
      </button>
    </div>
  );
}

const OUTCOME_TONE = { CREATED: "ok", UPDATED: "accent", SKIPPED: "warn" } as const;

export function EmployeeImportForm() {
  const t = useT();
  const [state, formAction] = useActionState<EmployeeImportState, FormData>(importEmployeesAction, {});

  const outcomeLabel = (outcome: keyof typeof OUTCOME_TONE) =>
    state.dryRun ? t(`empimp.will.${outcome}`) : t(`empimp.did.${outcome}`);

  return (
    <>
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <Field label={t("imp.file")} hint={t("empimp.fileHint")} required>
            <input className="input" type="file" name="file" accept=".xlsx,.xls,.csv" required />
          </Field>
        </div>
        <Actions />
      </form>

      {state.error && (
        <div className="mt-4">
          <Alert tone="danger" title={t(state.error)}>
            {t(`${state.error}.hint`)}
            {state.errorDetail && (
              <span className="mt-1 block font-semibold" dir="auto">
                {state.errorDetail}
              </span>
            )}
          </Alert>
        </div>
      )}

      {state.summary && (
        <div className="mt-4">
          <div className="mb-3">
            {state.dryRun ? (
              <Alert tone="warn" title={t("empimp.previewTitle")}>
                {t("empimp.previewBody")}
              </Alert>
            ) : (
              <Alert tone="ok" title={t("empimp.savedTitle")}>
                {t("empimp.savedBody", {
                  created: state.summary.created,
                  updated: state.summary.updated,
                })}
              </Alert>
            )}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Chip tone="ok">
              {outcomeLabel("CREATED")}: {state.summary.created}
            </Chip>
            <Chip tone="accent">
              {outcomeLabel("UPDATED")}: {state.summary.updated}
            </Chip>
            <Chip tone="warn">
              {outcomeLabel("SKIPPED")}: {state.summary.skipped}
            </Chip>
            {state.headerRow !== undefined && state.headerRow > 1 && (
              <Chip tone="neutral">
                {t("empimp.headerRow")}: {state.headerRow}
              </Chip>
            )}
          </div>

          {state.rows && state.rows.length > 0 && (
            <div className="table-wrap border-t">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("empimp.sheetRow")}</th>
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
                        <Chip tone={OUTCOME_TONE[row.outcome]}>{outcomeLabel(row.outcome)}</Chip>
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
