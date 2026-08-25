import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { Alert, Card, Chip, PageHeader } from "@/components/ui";
import { ClearTotp, NewUserButton, ResetPassword, RoleSelect, ToggleActive } from "./UserControls";

export const metadata = { title: "المستخدمون" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const admin = await requirePermission("users.manage");
  const t = await getT();

  const users = await db.user.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] });
  const adminsWithout2fa = users.filter((u) => u.role === "ADMIN" && u.isActive && !u.totpEnabled);

  return (
    <>
      <PageHeader
        title={t("user.title")}
        badge={<Chip tone="neutral">{users.length}</Chip>}
        actions={<NewUserButton />}
      />

      {adminsWithout2fa.length > 0 && (
        <div className="mb-4">
          <Alert tone="warn" title={t("user.2faRequired")}>
            {adminsWithout2fa.map((u) => u.username).join("، ")}
          </Alert>
        </div>
      )}

      <Card pad={false}>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t("user.name")}</th>
                <th>{t("user.username")}</th>
                <th>{t("user.role")}</th>
                <th>{t("common.status")}</th>
                <th>{t("user.twoFactor")}</th>
                <th>{t("user.lastLogin")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody className="row-in">
              {users.map((user) => {
                const isSelf = user.id === admin.id;
                return (
                  <tr key={user.id}>
                    <td className="font-semibold">
                      {user.name}
                      {isSelf && (
                        <span className="ms-2">
                          <Chip tone="accent">{t("nav.settings")}</Chip>
                        </span>
                      )}
                    </td>
                    <td className="num" dir="ltr">
                      {user.username}
                    </td>
                    <td>
                      <RoleSelect userId={user.id} role={user.role} disabled={isSelf} />
                    </td>
                    <td>
                      <Chip tone={user.isActive ? "ok" : "neutral"} dot>
                        {user.isActive ? t("user.active") : t("user.inactive")}
                      </Chip>
                      {user.lockedUntil && user.lockedUntil > new Date() && (
                        <span className="ms-1">
                          <Chip tone="warn">{t("auth.locked")}</Chip>
                        </span>
                      )}
                    </td>
                    <td>
                      <Chip tone={user.totpEnabled ? "ok" : "warn"}>
                        {user.totpEnabled ? t("common.yes") : t("common.no")}
                      </Chip>
                    </td>
                    <td className="num">{user.lastLoginAt ? formatDateTime(user.lastLoginAt, t.locale) : "—"}</td>
                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        <ResetPassword userId={user.id} username={user.username} />
                        {user.totpEnabled && <ClearTotp userId={user.id} username={user.username} />}
                        <ToggleActive userId={user.id} isActive={user.isActive} disabled={isSelf} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
