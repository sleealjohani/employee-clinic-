"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Role } from "@prisma/client";
import type { ClinicConfig } from "@/lib/clinic-config";
import { useT } from "@/lib/i18n/client";
import { initials } from "@/lib/format";
import { canOpenPath, can } from "@/lib/auth/rbac";
import { LogoMark } from "@/components/brand/Logo";
import { SessionGuard } from "./SessionGuard";
import {
  IconDashboard,
  IconEmployees,
  IconVisit,
  IconLab,
  IconVaccine,
  IconDue,
  IconImport,
  IconReports,
  IconUsers,
  IconAudit,
  IconSearch,
  IconSun,
  IconMoon,
  IconMenu,
  IconX,
  IconLogout,
} from "./icons";
const nav = [
  { href: "/dashboard", key: "nav.dashboard", icon: IconDashboard },
  { href: "/appointments", key: "v2.appointments", icon: IconVisit },
  { href: "/employees", key: "nav.employees", icon: IconEmployees },
  { href: "/visits", key: "nav.visits", icon: IconVisit },
  { href: "/labs", key: "nav.labs", icon: IconLab },
  { href: "/vaccinations", key: "nav.vaccinations", icon: IconVaccine },
  { href: "/due", key: "nav.due", icon: IconDue },
  { href: "/requests", key: "v2.requests", icon: IconImport },
  { href: "/labs/import", key: "nav.import", icon: IconImport },
  { href: "/reports", key: "nav.reports", icon: IconReports },
];
const adminNav = [
  { href: "/users", key: "nav.users", icon: IconUsers },
  { href: "/audit", key: "nav.audit", icon: IconAudit },
  { href: "/settings", key: "v2.settings", icon: IconDashboard },
];
const portalNav = [
  { href: "/portal", key: "v2.portal", icon: IconDashboard },
  { href: "/portal/appointments", key: "v2.myAppointments", icon: IconVisit },
  { href: "/portal/records", key: "v2.myRecords", icon: IconLab },
  { href: "/portal/requests", key: "v2.requests", icon: IconImport },
  { href: "/portal/profile", key: "v2.myProfile", icon: IconEmployees },
];
export function Shell({
  user,
  locale,
  theme,
  notificationCount,
  config,
  children,
}: {
  user: { name: string; role: Role };
  locale: "ar" | "en";
  theme: "light" | "dark";
  notificationCount: number;
  config: ClinicConfig;
  children: ReactNode;
}) {
  const t = useT(),
    pathname = usePathname(),
    router = useRouter();
  const [open, setOpen] = useState(false),
    [dark, setDark] = useState(theme === "dark"),
    [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null),
    employee = user.role === "EMPLOYEE",
    home = employee ? "/portal" : "/dashboard";
  const items = (employee ? portalNav : nav).filter((n) =>
      canOpenPath(user.role, n.href),
    ),
    management = adminNav.filter((n) => canOpenPath(user.role, n.href));
  const active = (href: string) =>
    pathname === href ||
    (href !== home &&
      pathname.startsWith(href + "/") &&
      !(href === "/labs" && pathname.startsWith("/labs/import")));
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    document.documentElement.dataset.accent = config.accent;
    document.documentElement.dataset.motion = config.motion ? "on" : "off";
  }, [config.accent, config.motion]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  function changeTheme() {
    const value = !dark;
    setDark(value);
    document.documentElement.dataset.theme = value ? "dark" : "light";
    document.cookie =
      "clinic_theme=" +
      (value ? "dark" : "light") +
      "; path=/; max-age=31536000; samesite=lax";
  }
  function language() {
    document.cookie =
      "clinic_locale=" +
      (locale === "ar" ? "en" : "ar") +
      "; path=/; max-age=31536000; samesite=lax";
    window.location.reload();
  }
  function navItems(list: typeof nav) {
    return list.map((item) => (
      <Link
        key={item.href}
        href={item.href}
        prefetch={false}
        className="sidebar-link"
        aria-current={active(item.href) ? "page" : undefined}
      >
        <item.icon size={19} />
        <span>{t(item.key)}</span>
        {active(item.href) && <span className="nav-active-mark" aria-hidden />}
      </Link>
    ));
  }
  const title = [...items, ...management]
    .filter((n) => active(n.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return (
    <div
      className="clinic-shell"
      data-accent={config.accent}
      data-motion={config.motion ? "on" : "off"}
    >
      <a href="#main-content" className="skip-link">
        {t("v2.skip")}
      </a>
      <SessionGuard />
      {open && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label={t("v2.close")}
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className="clinic-sidebar no-print"
        data-open={open}
        aria-label={t("v2.menu")}
      >
        <div className="sidebar-brand">
          <Link href={home}>
            <span className="brand-symbol">
              <LogoMark size={32} />
            </span>
            <span>
              <strong>{locale === "ar" ? config.nameAr : config.nameEn}</strong>
              <small>
                {locale === "ar" ? config.locationAr : config.locationEn}
              </small>
            </span>
          </Link>
          <button
            type="button"
            className="mobile-close icon-button"
            onClick={() => setOpen(false)}
            aria-label={t("v2.close")}
          >
            <IconX />
          </button>
        </div>
        <div className="sidebar-section-label">
          {t(employee ? "v2.portal" : "nav.group.clinical")}
        </div>
        <nav className="sidebar-nav">
          {navItems(items)}
          {management.length > 0 && (
            <>
              <div className="sidebar-section-label">
                {t("nav.group.oversight")}
              </div>
              {navItems(management)}
            </>
          )}
        </nav>
        <div className="sidebar-support">
          <span className="support-cross" aria-hidden>
            ＋
          </span>
          <strong>{t("v2.contactClinic")}</strong>
          <span>{locale === "ar" ? config.locationAr : config.locationEn}</span>
          {config.contactPhone && (
            <a dir="ltr" className="num" href={"tel:" + config.contactPhone}>
              {config.contactPhone}
            </a>
          )}
        </div>
        <Link href="/account" className="sidebar-account">
          <span className="avatar">{initials(user.name)}</span>
          <span>
            <strong>{user.name}</strong>
            <small>{t("role." + user.role)}</small>
          </span>
          <span aria-hidden>↗</span>
        </Link>
      </aside>
      <div className="clinic-main">
        <header className="clinic-topbar no-print">
          <div className="topbar-heading">
            <button
              type="button"
              className="icon-button mobile-menu"
              aria-label={t("v2.menu")}
              onClick={() => setOpen(true)}
            >
              <IconMenu />
            </button>
            <div>
              <span className="eyebrow">{t("v2.workspace")}</span>
              <strong>{title ? t(title.key) : t("app.name")}</strong>
            </div>
          </div>
          {can(user.role, "employee.read") && (
            <form
              className="topbar-search"
              onSubmit={(e) => {
                e.preventDefault();
                router.push("/employees?q=" + encodeURIComponent(query.trim()));
              }}
            >
              <IconSearch size={17} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={t("emp.searchPlaceholder")}
                placeholder={t("emp.searchPlaceholder")}
              />
              <kbd>⌘ K</kbd>
            </form>
          )}
          <div className="topbar-tools">
            <button
              type="button"
              onClick={language}
              className="icon-button language-button"
              aria-label={locale === "ar" ? "English" : "العربية"}
            >
              {locale === "ar" ? "EN" : "ع"}
            </button>
            <button
              type="button"
              onClick={changeTheme}
              className="icon-button theme-button"
              aria-label={t("common.theme")}
            >
              {dark ? <IconSun size={18} /> : <IconMoon size={18} />}
            </button>
            <Link
              href="/notifications"
              className="icon-button notification-button"
              aria-label={t("v2.notifications") + " " + notificationCount}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden
              >
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
              </svg>
              {notificationCount > 0 && (
                <span className="notification-count num">
                  {notificationCount > 99 ? "99+" : notificationCount}
                </span>
              )}
            </Link>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="icon-button"
                aria-label={t("action.logout")}
              >
                <IconLogout size={18} />
              </button>
            </form>
          </div>
        </header>
        <main id="main-content" className="clinic-content">
          <div key={pathname} className="motion-page">
            {children}
          </div>
        </main>
        <footer className="clinic-footer">
          <span>{locale === "ar" ? config.locationAr : config.locationEn}</span>
          <span>{t("auth.confidential")}</span>
        </footer>
      </div>
    </div>
  );
}
