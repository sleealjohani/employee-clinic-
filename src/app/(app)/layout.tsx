import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Shell } from "@/components/layout/Shell";
import { getCurrentUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { LOCALE_COOKIE, normaliseLocale } from "@/lib/i18n";
import { THEME_COOKIE, normaliseTheme } from "@/lib/theme";
import { loadDueItems } from "@/server/queries/due";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/account/password");

  const store = await cookies();
  const locale = normaliseLocale(store.get(LOCALE_COOKIE)?.value);
  const theme = normaliseTheme(store.get(THEME_COOKIE)?.value);

  // The badge counts exactly what the Due page calls overdue, so the two never
  // disagree in front of the user.
  const actionCount = can(user.role, "clinical.read")
    ? (await loadDueItems(locale)).filter((item) => item.urgency === "OVERDUE").length
    : 0;

  return (
    <Shell
      user={{ name: user.name, role: user.role }}
      locale={locale}
      theme={theme}
      actionCount={actionCount}
    >
      {children}
    </Shell>
  );
}
