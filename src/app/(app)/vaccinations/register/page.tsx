import Link from "next/link";
import { requirePermission } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { getT } from "@/lib/i18n";
import { getOHC } from "@/server/ohc-register";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { DownloadLink } from "@/components/ui/DownloadLink";
import { Modal } from "@/components/ui/Modal";
import { OHCImportForm, OHCLinkForm } from "@/components/clinic/OHCForms";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export default async function OHCRegisterPage() {
  const user = await requirePermission("clinical.read"),
    t = await getT(),
    register = await getOHC();
  const canImport = can(user.role, "import.run");
  const unmatched = register?.rows.filter((r) => !r.employeeId) ?? [];
  const employees =
    canImport && unmatched.length
      ? await db.employee.findMany({
          where: {
            isArchived: false,
            id: {
              notIn: register?.rows.flatMap((r) =>
                r.employeeId ? [r.employeeId] : [],
              ),
            },
          },
          select: { id: true, name: true, nationalId: true },
          orderBy: { name: "asc" },
        })
      : [];
  return (
    <>
      <PageHeader
        title={t("ohc.title")}
        actions={
          <>
            <Link className="btn btn-ghost" href="/vaccinations">
              {t("vac.title")}
            </Link>
            {register && (
              <DownloadLink href="/api/ohc/export">
                {t("ohc.export")}
              </DownloadLink>
            )}
          </>
        }
      />
      <section className="card p-6 space-y-4">
        <p>{t("ohc.description")}</p>
        {register ? (
          <>
            <p dir="ltr">{register.filename}</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <strong className="num">
                  {register.rows.length - unmatched.length} /{" "}
                  {register.rows.length}
                </strong>
                <p className="muted">{t("ohc.linkedRows")}</p>
              </div>
              <div>
                <strong className="num">{register.doseCount}</strong>
                <p className="muted">{t("ohc.syncedDoses")}</p>
              </div>
              <div>
                <strong className="num">{unmatched.length}</strong>
                <p className="muted">{t("ohc.needsMatch")}</p>
              </div>
            </div>
            {!register.importedDoses && (
              <p className="form-error">{t("ohc.noSourceDoses")}</p>
            )}
            <p className="muted">
              {t("ohc.updated")}{" "}
              <span className="num">
                {new Date(register.updatedAt).toLocaleString(
                  t.locale === "ar" ? "ar-SA" : "en-GB",
                  { timeZone: "Asia/Riyadh", calendar: "gregory" },
                )}
              </span>
            </p>
            <DownloadLink href="/api/ohc/export?original=1">
              {t("ohc.downloadOriginal")}
            </DownloadLink>
          </>
        ) : canImport ? (
          <OHCImportForm />
        ) : (
          <p>{t("ohc.notAttached")}</p>
        )}
      </section>
      {!!unmatched.length && (
        <section className="card p-6 space-y-4 mt-6">
          <h2>{t("ohc.needsMatch")}</h2>
          <p className="muted">{t("ohc.matchHint")}</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("ohc.row")}</th>
                  <th>{t("emp.name")}</th>
                  <th>{t("emp.nationalId")}</th>
                  <th>{t("ohc.match")}</th>
                  {canImport && <th>{t("ohc.link")}</th>}
                </tr>
              </thead>
              <tbody>
                {unmatched.map((row) => (
                  <tr key={row.row}>
                    <td className="num">{row.row}</td>
                    <td>{row.name}</td>
                    <td className="num">{row.nationalId || "—"}</td>
                    <td>{t(row.reason ?? "ohc.unmatched")}</td>
                    {canImport && (
                      <td>
                        <Modal
                          title={row.name}
                          trigger={
                            <button className="btn btn-ghost">
                              {t("ohc.link")}
                            </button>
                          }
                        >
                          <p className="mb-4">
                            {t("ohc.sourceIdentity")}{" "}
                            <span className="num">{row.nationalId || "—"}</span>
                          </p>
                          <OHCLinkForm row={row.row} employees={employees} />
                        </Modal>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {register?.issues.some((i) => i.cell) && (
        <section className="card p-6 mt-6">
          <h2>{t("ohc.sourceIssues")}</h2>
          <ul>
            {register.issues
              .filter((i) => i.cell)
              .map((issue, i) => (
                <li key={i}>
                  {issue.cell}: {t(issue.reason)}
                </li>
              ))}
          </ul>
        </section>
      )}
    </>
  );
}
