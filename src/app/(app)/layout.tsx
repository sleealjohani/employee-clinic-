import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Shell } from "@/components/layout/Shell";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { LOCALE_COOKIE, normaliseLocale } from "@/lib/i18n";
import { THEME_COOKIE, normaliseTheme } from "@/lib/theme";
import { getClinicConfig } from "@/server/queries/settings";
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/account/password");
  const store = await cookies(),
    locale = normaliseLocale(store.get(LOCALE_COOKIE)?.value),
    theme = normaliseTheme(store.get(THEME_COOKIE)?.value);
  const [config, notificationCount] = await Promise.all([
    getClinicConfig(),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return (
    <Shell
      user={{ name: user.name, role: user.role }}
      locale={locale}
      theme={theme}
      notificationCount={notificationCount}
      config={config}
    >
      {children}
    </Shell>
  );
}
