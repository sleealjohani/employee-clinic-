import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { IDLE_MINUTES, ABSOLUTE_HOURS } from "@/lib/auth/session";
import {
  Card,
  Chip,
  KeyValue,
  PageHeader,
  SectionTitle,
} from "@/components/ui";
import { RevokeSessionsButton, TwoFactorPanel } from "./TwoFactorPanel";

export const metadata = { title: "الحساب" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const current = await requireUser();
  const t = await getT();

  const [user, recent] = await Promise.all([
    db.user.findUnique({ where: { id: current.id } }),
    db.auditLog.findMany({
      where: {
        userId: current.id,
        action: {
          in: ["LOGIN", "LOGIN_FAILED", "PASSWORD_CHANGE", "TWO_FACTOR"],
        },
      },
      orderBy: { at: "desc" },
      take: 10,
    }),
  ]);

  if (!user) return null;

  return (
    <>
      <PageHeader
        title={user.name}
        subtitle={t(`role.${user.role}`)}
        badge={<Chip tone="accent">{user.username}</Chip>}
        actions={
          user.role !== "EMPLOYEE" && (
            <Link href="/account/password" className="btn btn-ghost">
              {t("auth.changePassword")}
            </Link>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {user.role === "EMPLOYEE" ? (
          <Card>
            <SectionTitle>{t("auth.employeeLogin")}</SectionTitle>
            <p>{t("auth.employeeLoginHint")}</p>
            <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>
              {t("auth.employeePrivacy")}
            </p>
          </Card>
        ) : (
          <Card>
            <SectionTitle>{t("user.twoFactor")}</SectionTitle>
            <TwoFactorPanel enabled={user.totpEnabled} />
          </Card>
        )}

        <Card>
          <SectionTitle>{t("nav.settings")}</SectionTitle>
          <dl className="grid gap-3 sm:grid-cols-2">
            <KeyValue label={t("user.role")} value={t(`role.${user.role}`)} />
            <KeyValue label={t("emp.email")} value={user.email ?? "—"} />
            <KeyValue
              label={t("user.lastLogin")}
              value={
                user.lastLoginAt
                  ? formatDateTime(user.lastLoginAt, t.locale)
                  : "—"
              }
              mono
            />
            <KeyValue
              label={t("common.time")}
              value={
                <span className="num">
                  {IDLE_MINUTES} {t.locale === "ar" ? "دقيقة خمول" : "min idle"}{" "}
                  · {ABSOLUTE_HOURS}
                  {t.locale === "ar" ? " ساعة كحد أقصى" : "h max"}
                </span>
              }
            />
          </dl>
          <div className="mt-4 border-t pt-3">
            <p className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
              {t("action.logout")} — {t("common.all")}
            </p>
            <RevokeSessionsButton />
          </div>
        </Card>

        <Card className="lg:col-span-2" pad={false}>
          <div className="px-4 py-3">
            <SectionTitle>{t("audit.title")}</SectionTitle>
          </div>
          <div className="table-wrap border-t">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("common.date")}</th>
                  <th>{t("audit.action")}</th>
                  <th>{t("audit.summary")}</th>
                  <th>{t("audit.ip")}</th>
                </tr>
              </thead>
              <tbody className="row-in">
                {recent.map((entry) => (
                  <tr key={entry.id}>
                    <td className="num">
                      {formatDateTime(entry.at, t.locale)}
                    </td>
                    <td>
                      <Chip
                        tone={
                          entry.action === "LOGIN_FAILED" ? "danger" : "neutral"
                        }
                      >
                        {entry.action}
                      </Chip>
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
        </Card>
      </div>
    </>
  );
}
