import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { Card, PageHeader } from "@/components/ui";
import { RequestList } from "@/components/clinic/RequestList";
import { Pagination, safePage } from "@/components/ui/Pagination";
import type { RequestStatus } from "@prisma/client";
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requirePermission("clinical.write");
  const t = await getT();
  const params = await searchParams;
  const statuses: RequestStatus[] = [
    "OPEN",
    "IN_PROGRESS",
    "COMPLETED",
    "DECLINED",
    "CANCELLED",
  ];
  const status = statuses.includes(params.status as RequestStatus)
    ? (params.status as RequestStatus)
    : undefined;
  const where = status
    ? { status }
    : { status: { in: ["OPEN", "IN_PROGRESS"] as RequestStatus[] } };
  const total = await db.serviceRequest.count({ where });
  const page = Math.min(
    safePage(params.page),
    Math.max(1, Math.ceil(total / 25)),
  );
  const requests = await db.serviceRequest.findMany({
    where,
    include: { service: true, employee: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * 25,
    take: 25,
  });
  return (
    <>
      <PageHeader title={t("v2.requests")} />
      <Card>
        <form method="get" className="filter-bar">
          <label>
            <span className="label">{t("common.status")}</span>
            <select
              className="select"
              name="status"
              defaultValue={status || ""}
            >
              <option value="">
                {t("v2.status.OPEN")} + {t("v2.status.IN_PROGRESS")}
              </option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {t("v2.status." + s)}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-ghost">{t("action.search")}</button>
          <span className="count-label num">{total}</span>
        </form>
        <RequestList requests={requests} staff />
        <Pagination
          total={total}
          page={page}
          base="/requests"
          params={{ status }}
        />
      </Card>
    </>
  );
}
