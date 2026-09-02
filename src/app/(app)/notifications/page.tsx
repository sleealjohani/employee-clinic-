import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { Card, PageHeader, Empty, Chip } from "@/components/ui";
import { markNotificationsRead } from "@/server/actions/requests";
import { Pagination, safePage } from "@/components/ui/Pagination";
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  const t = await getT();
  const params = await searchParams;
  const page = safePage(params.page);
  const where = { userId: user.id };
  const [notifications, total] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 25,
      skip: (page - 1) * 25,
    }),
    db.notification.count({ where }),
  ]);
  return (
    <>
      <PageHeader
        title={t("v2.notifications")}
        actions={
          <form action={markNotificationsRead}>
            <button className="btn btn-ghost">{t("v2.markRead")}</button>
          </form>
        }
      />
      <Card>
        {notifications.length ? (
          <div className="notification-list">
            {notifications.map((n) => (
              <Link key={n.id} href={n.href} className="notification-item">
                <span
                  className="notification-dot"
                  data-read={Boolean(n.readAt)}
                />
                <div>
                  <strong>{t.locale === "ar" ? n.titleAr : n.titleEn}</strong>
                  <p className="muted num">
                    {formatDateTime(n.createdAt, t.locale)}
                  </p>
                </div>
                {!n.readAt && (
                  <Chip tone="accent">{t("v2.newNotification")}</Chip>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <Empty title={t("v2.noNotifications")} />
        )}
        <Pagination page={page} total={total} base="/notifications" />
      </Card>
    </>
  );
}
