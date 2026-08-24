import { Prisma } from "@prisma/client";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { Alert, Card, Chip, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "سجل التدقيق" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

const ACTION_TONE: Record<string, "ok" | "warn" | "danger" | "neutral" | "accent"> = {
  LOGIN: "ok",
  LOGIN_FAILED: "danger",
  LOGOUT: "neutral",
  CREATE: "accent",
  UPDATE: "accent",
  ARCHIVE: "warn",
  RESTORE: "warn",
  VOID: "danger",
  VIEW_SENSITIVE: "warn",
  EXPORT: "warn",
  IMPORT_UPLOAD: "accent",
  IMPORT_EXTRACT: "accent",
  IMPORT_COMMIT: "ok",
  CRITICAL_NOTIFY: "danger",
  REVIEW: "ok",
  USER_MANAGE: "warn",
  PASSWORD_CHANGE: "warn",
  TWO_FACTOR: "warn",
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; entityId?: string; action?: string; page?: string }>;
}) {
  await requirePermission("audit.read");
  const t = await getT();
  const params = await searchParams;

  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const where: Prisma.AuditLogWhereInput = {
    ...(params.entity ? { entity: params.entity } : {}),
    ...(params.entityId ? { entityId: params.entityId } : {}),
    ...(params.action ? { action: params.action } : {}),
  };

  const [total, entries] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { at: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const linkTo = (p: number) => {
    const sp = new URLSearchParams();
    if (params.entity) sp.set("entity", params.entity);
    if (params.entityId) sp.set("entityId", params.entityId);
    if (params.action) sp.set("action", params.action);
    sp.set("page", String(p));
    return `/audit?${sp.toString()}`;
  };

  return (
    <>
      <PageHeader
        title={t("audit.title")}
        subtitle={t("audit.subtitle")}
        badge={<Chip tone="neutral">{total}</Chip>}
      />

      <div className="mb-4">
        <Alert tone="info">{t("audit.immutable")}</Alert>
      </div>

      <Card className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-2.5">
          <div className="w-48">
            <label className="label" htmlFor="action">
              {t("audit.action")}
            </label>
            <select id="action" className="select" name="action" defaultValue={params.action ?? ""}>
              <option value="">{t("common.all")}</option>
              {Object.keys(ACTION_TONE).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="w-44">
            <label className="label" htmlFor="entity">
              {t("audit.entity")}
            </label>
            <input id="entity" className="input" name="entity" defaultValue={params.entity ?? ""} dir="ltr" />
          </div>
          <button type="submit" className="btn btn-ghost">
            {t("action.filter")}
          </button>
        </form>
      </Card>

      <Card pad={false}>
        {entries.length === 0 ? (
          <Empty title={t("common.empty")} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("common.date")}</th>
                  <th>{t("audit.user")}</th>
                  <th>{t("audit.action")}</th>
                  <th>{t("audit.entity")}</th>
                  <th>{t("audit.summary")}</th>
                  <th>{t("audit.ip")}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="num whitespace-nowrap">{formatDateTime(entry.at, t.locale)}</td>
                    <td>{entry.userName}</td>
                    <td>
                      <Chip tone={ACTION_TONE[entry.action] ?? "neutral"}>{entry.action}</Chip>
                    </td>
                    <td className="num" dir="ltr">
                      {entry.entity}
                    </td>
                    <td>{entry.summary}</td>
                    <td className="num" dir="ltr">
                      {entry.ip ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link href={linkTo(page - 1)} className="btn btn-ghost btn-sm">
              {t("action.prev")}
            </Link>
          )}
          <span className="num text-xs" style={{ color: "var(--text-muted)" }}>
            {page} / {pages}
          </span>
          {page < pages && (
            <Link href={linkTo(page + 1)} className="btn btn-ghost btn-sm">
              {t("action.next")}
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
