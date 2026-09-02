"use client";
import { useActionState, useState } from "react";
import { useT } from "@/lib/i18n/client";
import {
  importOHCAction,
  linkOHCRowAction,
  type OHCState,
} from "@/server/actions/ohc";

export function OHCImportForm() {
  const t = useT();
  const [file, setFile] = useState<File | null>(null);
  const [reviewed, setReviewed] = useState<File | null>(null);
  const [state, action, pending] = useActionState(
    async (previous: OHCState, form: FormData) => {
      if (file) form.set("file", file);
      const result = await importOHCAction(previous, form);
      if (result.preview) setReviewed(file);
      return result;
    },
    {},
  );
  const preview = file === reviewed ? state.preview : undefined;
  return (
    <form action={action} className="space-y-4" aria-busy={pending}>
      <label className="field">
        <span>{t("ohc.chooseFile")}</span>
        <input
          type="file"
          accept=".xlsx"
          disabled={pending}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setReviewed(null);
          }}
        />
      </label>
      <p className="muted">{t("ohc.importHint")}</p>
      {state.error && (
        <p role="alert" className="form-error">
          {t(state.error)}
        </p>
      )}
      {state.ok && (
        <p role="status" className="form-success">
          {t("ohc.importSuccess", { count: state.imported ?? 0 })}
        </p>
      )}
      {preview ? (
        <>
          <p>
            {t("ohc.previewCounts", {
              rows: preview.rows.length,
              matched: preview.rows.filter((r) => r.employeeId).length,
              doses: preview.doses.length,
            })}
          </p>
          {!preview.doses.length && (
            <p className="form-error">{t("ohc.noSourceDoses")}</p>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("ohc.row")}</th>
                  <th>{t("emp.name")}</th>
                  <th>{t("emp.nationalId")}</th>
                  <th>{t("ohc.match")}</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.row}>
                    <td className="num">{row.row}</td>
                    <td>{row.name}</td>
                    <td className="num">{row.nationalId}</td>
                    <td>{t(row.reason ?? "ohc.matched")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.doses.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("ohc.row")}</th>
                    <th>{t("vac.vaccine")}</th>
                    <th>{t("ohc.dose")}</th>
                    <th>{t("ohc.date")}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.doses.map((dose, i) => (
                    <tr key={i}>
                      <td className="num">
                        {dose.row} · {dose.cell}
                      </td>
                      <td dir="ltr">{dose.code}</td>
                      <td className="num">{dose.dose}</td>
                      <td className="num">{dose.day}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {preview.issues.length > 0 && (
            <ul>
              {preview.issues.map((issue, i) => (
                <li key={i}>
                  {t("ohc.row")} {issue.row} {issue.cell ?? ""}:{" "}
                  {t(issue.reason)}
                </li>
              ))}
            </ul>
          )}
          <input type="hidden" name="version" value={preview.version} />
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="confirm"
              value="yes"
              required
              disabled={pending}
            />
            <span>{t("ohc.confirmImport")}</span>
          </label>
          <button
            className="btn btn-primary"
            name="mode"
            value="commit"
            disabled={pending}
          >
            {pending ? t("action.saving") : t("ohc.attach")}
          </button>
        </>
      ) : (
        <button
          className="btn btn-primary"
          name="mode"
          value="preview"
          disabled={pending || !file}
        >
          {pending ? t("action.saving") : t("ohc.preview")}
        </button>
      )}
    </form>
  );
}

export function OHCLinkForm({
  row,
  employees,
}: {
  row: number;
  employees: { id: string; name: string; nationalId: string }[];
}) {
  const t = useT();
  const [state, action, pending] = useActionState(linkOHCRowAction, {});
  return (
    <form action={action} className="space-y-3" aria-busy={pending}>
      <input type="hidden" name="row" value={row} />
      <label className="field">
        <span>{t("ohc.employee")}</span>
        <select name="employeeId" defaultValue="" required disabled={pending}>
          <option value="">{t("ohc.selectEmployee")}</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} — {e.nationalId}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{t("ohc.linkReason")}</span>
        <input
          name="reason"
          minLength={5}
          maxLength={1000}
          required
          disabled={pending}
        />
      </label>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="confirm"
          value="yes"
          required
          disabled={pending}
        />
        <span>{t("ohc.identityConfirm")}</span>
      </label>
      {state.error && (
        <p role="alert" className="form-error">
          {t(state.error)}
        </p>
      )}
      {state.ok && (
        <p role="status" className="form-success">
          {t("ohc.linkSuccess")}
        </p>
      )}
      <button className="btn btn-primary" disabled={pending}>
        {pending ? t("action.saving") : t("ohc.link")}
      </button>
    </form>
  );
}
