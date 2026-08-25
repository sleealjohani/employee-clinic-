"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { Role } from "@prisma/client";
import { initials } from "@/lib/format";
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
  IconSearch,
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
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [currentTheme, setCurrentTheme] = useState(theme);

  const clinical: NavItem[] = useMemo(
    () => [
      { href: "/dashboard", labelKey: "nav.dashboard", icon: <IconDashboard /> },
      { href: "/employees", labelKey: "nav.employees", icon: <IconEmployees /> },
      { href: "/visits", labelKey: "nav.visits", icon: <IconVisit /> },
      { href: "/labs", labelKey: "nav.labs", icon: <IconLab /> },
      { href: "/vaccinations", labelKey: "nav.vaccinations", icon: <IconVaccine /> },
    ],
    [],
  );

  const oversight: NavItem[] = useMemo(
    () => [
      { href: "/due", labelKey: "nav.due", icon: <IconDue />, badge: actionCount },
      { href: "/labs/import", labelKey: "nav.import", icon: <IconImport /> },
      { href: "/reports", labelKey: "nav.reports", icon: <IconReports /> },
      { href: "/users", labelKey: "nav.users", icon: <IconUsers /> },
      { href: "/audit", labelKey: "nav.audit", icon: <IconAudit /> },
    ],
    [actionCount],
  );

  const visibleClinical = clinical.filter((item) => canOpenPath(user.role, item.href));
  const visibleOversight = oversight.filter((item) => canOpenPath(user.role, item.href));
  const allVisible = [...visibleClinical, ...visibleOversight];

  useEffect(() => {
    setMobileOpen(false);
    setCommandOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }

      if (event.key === "Escape") {
        setCommandOpen(false);
        setMobileOpen(false);
        return;
      }

      if (!typing && event.key === "/") {
        event.preventDefault();
        setCommandOpen(true);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

  function runEmployeeSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = commandQuery.trim();
    setCommandOpen(false);
    router.push(q ? `/employees?q=${encodeURIComponent(q)}` : "/employees");
  }

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));

  const desktopNav = (
    <>
      <Link href="/dashboard" prefetch={false} className="rail-brand" aria-label={t("app.name")}>
        <LogoMark size={32} />
        <span className="rail-label rail-brand-name">{t("app.name")}</span>
      </Link>

      <nav className="rail-nav">
        <span className="rail-group rail-label">{t("nav.group.clinical")}</span>
        {visibleClinical.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className="nav-icon-button"
            data-active={isActive(item.href)}
          >
            <span className="nav-icon-glyph">{item.icon}</span>
            <span className="rail-label">{t(item.labelKey)}</span>
          </Link>
        ))}

        {visibleOversight.length > 0 && (
          <span className="rail-group rail-label">{t("nav.group.oversight")}</span>
        )}

        {visibleOversight.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className="nav-icon-button"
            data-active={isActive(item.href)}
            aria-label={item.badge ? `${t(item.labelKey)} (${item.badge})` : undefined}
          >
            <span className="nav-icon-glyph">
              {item.icon}
              {item.badge !== undefined && item.badge > 0 && (
                <span
                  aria-hidden
                  className="num absolute -end-1 -top-1 min-w-[1.1rem] rounded-full px-1 py-0.5 text-center text-[0.58rem] font-bold text-white"
                  style={{ background: "var(--danger)" }}
                >
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </span>
            <span className="rail-label">{t(item.labelKey)}</span>
          </Link>
        ))}
      </nav>

      <div className="rail-foot">
        <button type="button" onClick={toggleTheme} className="nav-icon-button">
          <span className="nav-icon-glyph">{currentTheme === "dark" ? <IconSun /> : <IconMoon />}</span>
          <span className="rail-label">{t("common.theme")}</span>
        </button>
        <button type="button" onClick={switchLocale} className="nav-icon-button">
          <span aria-hidden className="nav-icon-glyph text-xs font-bold">{locale === "ar" ? "EN" : "ع"}</span>
          <span className="rail-label">{t("common.language")}</span>
        </button>

        <Link href="/account" prefetch={false} className="nav-icon-button" data-active={isActive("/account")}>
          <span aria-hidden className="nav-icon-glyph rail-avatar">{initials(user.name)}</span>
          <span className="rail-label rail-identity">
            <span>{user.name}</span>
            <small>{t(`role.${user.role}`)}</small>
          </span>
        </Link>

        {/* Signing out was reachable only from the mobile drawer and the account
            page — there was no way out of the desktop workspace at all. */}
        <form action="/api/auth/logout" method="post" className="contents">
          <button type="submit" className="nav-icon-button nav-icon-danger">
            <span className="nav-icon-glyph"><IconLogout /></span>
            <span className="rail-label">{t("action.logout")}</span>
          </button>
        </form>
      </div>
    </>
  );

  const mobileNavSection = (items: NavItem[], title: string) =>
    items.length === 0 ? null : (
      <div className="mb-5">
        <p className="mb-2 px-2 text-[0.68rem] font-bold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
          {title}
        </p>
        <div className="space-y-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors"
              style={{
                color: isActive(item.href) ? "var(--accent-text)" : "var(--text-muted)",
                background: isActive(item.href) ? "var(--accent-soft)" : "transparent",
              }}
            >
              <span style={{ color: isActive(item.href) ? "var(--accent)" : "var(--text-faint)" }}>{item.icon}</span>
              <span className="flex-1">{t(item.labelKey)}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="num rounded-full px-2 py-0.5 text-[0.65rem] font-bold text-white" style={{ background: "var(--danger)" }}>
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    );

  return (
    <div className="workspace-shell">
      <div className="ambient-orb ambient-orb-one" />
      <div className="ambient-orb ambient-orb-two" />

      {/* Desktop navigation rail */}
      <aside className="glass nav-rail fixed inset-y-3 z-40 hidden flex-col rounded-[1.45rem] lg:flex no-print" style={{ insetInlineStart: "0.75rem" }}>
        {desktopNav}
      </aside>

      {/* Mobile command bar */}
      <header className="glass-strong sticky top-2 z-30 mx-2 mt-2 flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5 lg:hidden no-print">
        <Link href="/dashboard" prefetch={false} className="flex min-w-0 items-center gap-2.5">
          <LogoMark size={29} />
          <span className="truncate text-sm font-bold">{t("app.name")}</span>
        </Link>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setCommandOpen(true)}
            aria-label={t("action.search")}
          >
            <IconSearch size={16} />
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMobileOpen(true)} aria-label="Menu">
            <IconMenu />
          </button>
        </div>
      </header>

      {/* Mobile navigation drawer */}
      {mobileOpen && (
        <div className="command-overlay fixed inset-0 z-50 lg:hidden no-print">
          <button
            type="button"
            className="absolute inset-0 bg-[rgb(4_18_24/0.52)] backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-label="Close"
          />
          <aside
            className="glass-strong command-surface absolute inset-y-2 flex w-[min(21rem,calc(100vw-1rem))] flex-col rounded-[1.6rem] p-4"
            style={{ insetInlineStart: "0.5rem" }}
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <Logo height={42} />
                <p className="mt-2 text-xs font-semibold" style={{ color: "var(--text-faint)" }}>
                  {t("app.name")}
                </p>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMobileOpen(false)} aria-label="Close">
                <IconX />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto">
              {mobileNavSection(visibleClinical, t("nav.group.clinical"))}
              {mobileNavSection(visibleOversight, t("nav.group.oversight"))}
            </nav>

            <div className="mt-4 border-t pt-4">
              <Link href="/account" prefetch={false} className="mb-3 flex items-center gap-3 rounded-xl px-2 py-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold" style={{ background: "var(--accent-soft)", color: "var(--accent-text)" }}>
                  {initials(user.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{user.name}</span>
                  <span className="block truncate text-xs" style={{ color: "var(--text-faint)" }}>
                    {t(`role.${user.role}`)}
                  </span>
                </span>
              </Link>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={toggleTheme} className="btn btn-ghost btn-sm">
                  {currentTheme === "dark" ? <IconSun /> : <IconMoon />}
                </button>
                <button type="button" onClick={switchLocale} className="btn btn-ghost btn-sm font-bold">
                  {locale === "ar" ? "EN" : "ع"}
                </button>
                <form action="/api/auth/logout" method="post">
                  <button type="submit" className="btn btn-ghost btn-sm w-full" title={t("action.logout")}>
                    <IconLogout />
                  </button>
                </form>
              </div>
            </div>
          </aside>
        </div>
      )}

      <div className="lg:ps-[5.75rem]">
        {/* Floating command / identity bar */}
        <div className="sticky top-3 z-20 hidden px-4 pt-3 lg:block no-print">
          <div className="glass-strong mx-auto flex max-w-[96rem] items-center gap-4 rounded-[1.35rem] px-4 py-2.5">
            <div className="min-w-0 shrink-0">
              <p className="text-[0.68rem] font-semibold" style={{ color: "var(--text-faint)" }}>
                {locale === "ar" ? "مساحة العمل السريرية" : "Clinical workspace"}
              </p>
              <p className="truncate text-sm font-bold">{t("app.name")}</p>
            </div>

            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="floating-command mx-auto flex w-full max-w-xl items-center gap-3 rounded-xl border px-3.5 py-2 text-start"
              style={{ background: "color-mix(in srgb, var(--surface) 65%, transparent)", color: "var(--text-muted)" }}
            >
              <IconSearch size={17} />
              <span className="flex-1 truncate text-sm">{t("emp.searchPlaceholder")}</span>
              <kbd className="hidden rounded-lg border px-2 py-0.5 text-[0.66rem] font-semibold xl:inline" style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
                Ctrl K
              </kbd>
            </button>

            <Link href="/account" prefetch={false} className="flex shrink-0 items-center gap-2.5 rounded-xl px-2.5 py-1.5 transition-colors hover:bg-[var(--surface-2)]">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold" style={{ background: "var(--accent-soft)", color: "var(--accent-text)" }}>
                {initials(user.name)}
              </span>
              <span className="hidden max-w-32 xl:block">
                <span className="block truncate text-xs font-bold">{user.name}</span>
                <span className="block truncate text-[0.66rem]" style={{ color: "var(--text-faint)" }}>
                  {t(`role.${user.role}`)}
                </span>
              </span>
            </Link>
          </div>
        </div>

        <main className="min-w-0 px-3 py-4 sm:px-5 lg:px-6 lg:pb-8 lg:pt-5 xl:px-8">
          <div key={pathname} className="app-page motion-page mx-auto max-w-[96rem]">
            {children}
          </div>
        </main>
      </div>

      {/* Command center: global keyboard entry point, employee search + navigation. */}
      {commandOpen && (
        <div className="command-overlay fixed inset-0 z-[70] flex items-start justify-center px-3 pt-[10vh] no-print">
          <button
            type="button"
            className="absolute inset-0 bg-[rgb(4_18_24/0.46)] backdrop-blur-md"
            onClick={() => setCommandOpen(false)}
            aria-label="Close command center"
          />

          <section className="glass-strong command-surface relative z-10 w-full max-w-2xl overflow-hidden rounded-[1.55rem]">
            <form onSubmit={runEmployeeSearch} className="border-b p-3">
              <div className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: "var(--surface-2)" }}>
                <span style={{ color: "var(--accent)" }}>
                  <IconSearch size={19} />
                </span>
                <input
                  autoFocus
                  value={commandQuery}
                  onChange={(event) => setCommandQuery(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  placeholder={t("emp.searchPlaceholder")}
                  aria-label={t("action.search")}
                />
                <kbd className="rounded-lg border px-2 py-0.5 text-[0.64rem] font-semibold" style={{ color: "var(--text-faint)" }}>
                  ESC
                </kbd>
              </div>
            </form>

            <div className="max-h-[58vh] overflow-y-auto p-3">
              <div className="mb-4 rounded-xl border p-3" style={{ background: "color-mix(in srgb, var(--accent) 5%, var(--surface))" }}>
                <p className="text-xs font-bold" style={{ color: "var(--accent-text)" }}>
                  {locale === "ar" ? "بحث سريع عن الموظف" : "Quick employee search"}
                </p>
                <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                  {locale === "ar"
                    ? "اكتب الاسم أو رقم الهوية أو الرقم الوظيفي ثم اضغط Enter."
                    : "Type a name, national ID, or employee number, then press Enter."}
                </p>
              </div>

              <p className="mb-2 px-1 text-[0.68rem] font-bold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
                {locale === "ar" ? "انتقال سريع" : "Quick navigation"}
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {allVisible.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    onClick={() => setCommandOpen(false)}
                    className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all hover:-translate-y-0.5"
                    style={{ background: "var(--surface)", color: "var(--text-muted)" }}
                  >
                    <span style={{ color: "var(--accent)" }}>{item.icon}</span>
                    <span className="flex-1">{t(item.labelKey)}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="num rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
                        {item.badge}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
