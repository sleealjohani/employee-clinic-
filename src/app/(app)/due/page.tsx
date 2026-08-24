import Link from "next/link";
import { requirePath } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { loadDueItems } from "@/server/queries/due";
import type { DueKind, DueUrgency } from "@/lib/clinical/due";
import { Card, Chip, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "المستحقات" };
export const dynamic = "force-dynamic";

const URGENCY_TONE: Record<DueUrgency, "danger" | "warn" | "neutral"> = {
  OVERDUE: "danger",
  DUE: "warn",
  SOON: "neutral",
};

const KINDS: DueKind[] = ["CRITICAL", "REVIEW", "VACCINE", "LAB_FOLLOWUP", "PROFILE"];

export default async function DuePage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; urgency?: string }>;
}) {
  await requirePath("/due");
  const t = await getT();
  const params = await searchParams;

  const all = await loadDueItems(t.locale);
  const kind = KINDS.includes(params.kind as DueKind) ? (params.kind as DueKind) : undefined;
  const urgency = ["OVERDUE", "DUE", "SOON"].includes(params.urgency ?? "")
    ? (params.urgency as DueUrgency)
    : undefined;

  const items = all.filter((i) => (!kind || i.kind === kind) && (!urgency || i.urgency === urgency));

  const countBy = (k: DueKind) => all.filter((i) => i.kind === k).length;
  const overdueCount = all.filter((i) => i.urgency === "OVERDUE").length;

  return (
    <>
      <PageHeader
        title={t("due.title")}
        subtitle={t("due.subtitle")}
        badge={
          overdueCount > 0 ? (
            <Chip tone="danger" dot>
              {t("due.status.OVERDUE")}: {overdueCount}
            </Chip>
          ) : (
            <Chip tone="ok" dot>
              {t("vac.upToDate")}
            </Chip>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-2 no-print">
        <Link href="/due" className={`btn btn-sm ${!kind && !urgency ? "btn-primary" : "btn-ghost"}`}>
          {t("common.all")} ({all.length})
        </Link>
        {KINDS.map((k) => {
          const n = countBy(k);
          if (n === 0) return null;
          return (
            <Link
              key={k}
              href={`/due?kind=${k}`}
              className={`btn btn-sm ${kind === k ? "btn-primary" : "btn-ghost"}`}
            >
              {t(`due.kind.${k}`)} ({n})
            </Link>
          );
        })}
      </div>

      <Card pad={false}>
        {items.length === 0 ? (
          <Empty title={t("due.empty")} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("common.status")}</th>
                  <th>{t("due.kind")}</th>
                  <th>{t("due.employee")}</th>
                  <th>{t("emp.department")}</th>
                  <th>{t("due.item")}</th>
                  <th>{t("due.dueDate")}</th>
                  <th>{t("due.daysLate")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Chip tone={URGENCY_TONE[item.urgency]} dot>
                        {t(`due.status.${item.urgency}`)}
                      </Chip>
                    </td>
                    <td>{t(`due.kind.${item.kind}`)}</td>
                    <td>
                      <Link href={item.href} className="font-semibold" style={{ color: "var(--accent-text)" }}>
                        {item.employeeName}
                      </Link>
                    </td>
                    <td>{item.department ?? "—"}</td>
                    <td>
                      <span className="font-semibold">{item.title}</span>
                      <span className="block text-xs" style={{ color: "var(--text-faint)" }}>
                        {item.detail}
                      </span>
                    </td>
                    <td className="num">{item.dueDate ? formatDate(item.dueDate, t.locale) : "—"}</td>
                    <td className="num">{item.daysLate > 0 ? item.daysLate : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
