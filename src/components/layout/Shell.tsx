"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { Role } from "@prisma/client";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { useT } from "@/lib/i18n/client";
import { canOpenPath } from "@/lib/auth/rbac";
import {
  IconAudit,
  IconDashboard,
  IconDue,
  IconEmployees,
  IconImport,
  IconLab,
  IconLogout,
  IconMenu,
  IconMoon,
  IconReports,
  IconSun,
  IconUsers,
  IconVaccine,
  IconVisit,
  IconX,
} from "./icons";

type NavItem = { href: string; labelKey: string; icon: ReactNode; badge?: number };

export function Shell({
  user,
  locale,
  theme,
  actionCount,
  children,
}: {
  user: { name: string; role: Role };
  locale: "ar" | "en";
  theme: "light" | "dark";
  actionCount: number;
  children: ReactNode;
}) {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState(theme);

  useEffect(() => setOpen(false), [pathname]);

  const clinical: NavItem[] = [
    { href: "/dashboard", labelKey: "nav.dashboard", icon: <IconDashboard /> },
    { href: "/employees", labelKey: "nav.employees", icon: <IconEmployees /> },
    { href: "/visits", labelKey: "nav.visits", icon: <IconVisit /> },
    { href: "/labs", labelKey: "nav.labs", icon: <IconLab /> },
    { href: "/vaccinations", labelKey: "nav.vaccinations", icon: <IconVaccine /> },
  ];

  const oversight: NavItem[] = [
    { href: "/due", labelKey: "nav.due", icon: <IconDue />, badge: actionCount },
    { href: "/labs/import", labelKey: "nav.import", icon: <IconImport /> },
    { href: "/reports", labelKey: "nav.reports", icon: <IconReports /> },
    { href: "/users", labelKey: "nav.users", icon: <IconUsers /> },
    { href: "/audit", labelKey: "nav.audit", icon: <IconAudit /> },
  ];

  const visible = (items: NavItem[]) => items.filter((i) => canOpenPath(user.role, i.href));

  function toggleTheme() {
    const next = currentTheme === "dark" ? "light" : "dark";
    setCurrentTheme(next);
    document.documentElement.dataset.theme = next;
    document.cookie = `clinic_theme=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }

  function switchLocale() {
    const next = locale === "ar" ? "en" : "ar";
    document.cookie = `clinic_locale=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    window.location.reload();
  }

  const NavList = ({ items, title }: { items: NavItem[]; title: string }) =>
    items.length === 0 ? null : (
      <div className="mb-5">
        <p
          className="mb-1.5 px-3 text-[0.66rem] font-bold uppercase tracking-wider"
          style={{ color: "var(--text-faint)" }}
        >
          {title}
        </p>
        <ul className="space-y-0.5">
          {items.map((item) => {
            const active =
              pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  prefetch={false}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                  style={{
                    background: active ? "var(--accent-soft)" : "transparent",
                    color: active ? "var(--accent-text)" : "var(--text-muted)",
                  }}
                >
                  <span style={{ color: active ? "var(--accent)" : "var(--text-faint)" }}>{item.icon}</span>
                  <span className="flex-1">{t(item.labelKey)}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className="num rounded-full px-1.5 py-px text-[0.65rem] font-bold"
                      style={{ background: "var(--danger)", color: "#fff" }}
                    >
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );

  const sidebar = (
    <>
      <div className="mb-6 px-2 pt-1">
        <Link href="/dashboard" prefetch={false} className="block">
          <Logo height={44} />
        </Link>
        <p className="mt-2.5 px-1 text-[0.72rem] font-semibold" style={{ color: "var(--text-faint)" }}>
          {t("app.name")}
        </p>
      </div>
      <nav className="flex-1 overflow-y-auto">
        <NavList items={visible(clinical)} title={t("nav.group.clinical")} />
        <NavList items={visible(oversight)} title={t("nav.group.oversight")} />
      </nav>
      <div className="mt-auto space-y-2 border-t pt-3">
        <Link
          href="/account"
          prefetch={false}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-[var(--surface-3)]"
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
            style={{ background: "var(--accent-soft)", color: "var(--accent-text)" }}
          >
            {user.name.trim().charAt(0)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold" style={{ color: "var(--text)" }}>
              {user.name}
            </span>
            <span className="block truncate text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
              {t(`role.${user.role}`)}
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-1.5 px-1">
          <button onClick={toggleTheme} className="btn btn-ghost btn-sm flex-1" title={t("common.theme")}>
            {currentTheme === "dark" ? <IconSun /> : <IconMoon />}
          </button>
          <button onClick={switchLocale} className="btn btn-ghost btn-sm flex-1" title={t("common.language")}>
            {locale === "ar" ? "EN" : "ع"}
          </button>
          <form action="/api/auth/logout" method="post" className="flex-1">
            <button type="submit" className="btn btn-ghost btn-sm w-full" title={t("action.logout")}>
              <IconLogout />
            </button>
          </form>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen">
      {/* mobile bar */}
      <div
        className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b px-4 py-2.5 lg:hidden no-print"
        style={{ background: "var(--surface)" }}
      >
        <Link href="/dashboard" prefetch={false} className="flex items-center gap-2">
          <LogoMark size={28} />
          <span className="text-sm font-bold">{t("app.name")}</span>
        </Link>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} aria-label="Menu">
          <IconMenu />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden no-print">
          <div
            className="absolute inset-0"
            style={{ background: "rgb(6 18 25 / 0.55)" }}
            onClick={() => setOpen(false)}
          />
          <aside
            className="absolute inset-y-0 flex w-72 flex-col p-4 shadow-xl"
            style={{ background: "var(--surface)", insetInlineStart: 0 }}
          >
            <button
              className="btn btn-ghost btn-sm absolute top-3 text-xs"
              style={{ insetInlineEnd: "0.75rem" }}
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <IconX />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:flex">
        <aside
          className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-e p-4 lg:flex no-print"
          style={{ background: "var(--surface)" }}
        >
          {sidebar}
        </aside>
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
