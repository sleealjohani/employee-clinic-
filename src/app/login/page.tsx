import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { getClinicConfig } from "@/server/queries/settings";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { LoginForm } from "./LoginForm";
import { EmployeeLoginForm } from "./EmployeeLoginForm";
export const metadata = { title: "تسجيل الدخول" };
export const dynamic = "force-dynamic";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; setup?: string; mode?: string }>;
}) {
  const user = await getCurrentUser();
  if (user)
    redirect(
      user.mustChangePassword
        ? "/account/password"
        : user.role === "EMPLOYEE"
          ? "/portal"
          : "/dashboard",
    );
  if ((await db.user.count()) === 0) redirect("/setup");
  const [params, t, config] = await Promise.all([
    searchParams,
    getT(),
    getClinicConfig(),
  ]);
  const staffMode =
    params.mode === "staff" ||
    (!params.mode && !!params.next && !params.next.startsWith("/portal"));
  const nextQuery = params.next
    ? `&next=${encodeURIComponent(params.next)}`
    : "";
  return (
    <main className="auth-layout" data-accent={config.accent}>
      <section className="auth-story">
        <div className="auth-story-logo">
          <span className="brand-symbol">
            <LogoMark size={35} />
          </span>
          <span>
            {t.locale === "ar" ? config.locationAr : config.locationEn}
          </span>
        </div>
        <div>
          <span className="eyebrow">
            {t.locale === "ar" ? config.nameAr : config.nameEn}
          </span>
          <h1>{t("v2.careForCarers")}</h1>
          <p>{t.locale === "ar" ? config.welcomeAr : config.welcomeEn}</p>
          <div className="auth-cross" aria-hidden>
            ✚
          </div>
          <div className="auth-benefits">
            <span>{t("v2.healthFile")}</span>
            <span>{t("v2.appointments")}</span>
            <span>{t("v2.connectedCare")}</span>
          </div>
        </div>
        <footer className="auth-story-footer">{t("v2.clinicIdentity")}</footer>
      </section>
      <section className="auth-main">
        <div className="auth-form-wrap">
          <Logo height={43} />
          <h2>{t("v2.welcomeBack")}</h2>
          <p className="auth-subtitle">
            {t(staffMode ? "v2.loginHint" : "auth.employeeLoginHint")}
          </p>
          <nav className="tabs mb-5" aria-label={t("auth.loginType")}>
            <a
              href={`/login?mode=employee${nextQuery}`}
              aria-current={!staffMode ? "page" : undefined}
            >
              {t("auth.employeeLogin")}
            </a>
            <a
              href={`/login?mode=staff${nextQuery}`}
              aria-current={staffMode ? "page" : undefined}
            >
              {t("auth.staffLogin")}
            </a>
          </nav>
          {staffMode ? (
            <LoginForm next={params.next || ""} />
          ) : (
            <EmployeeLoginForm next={params.next || ""} />
          )}
          <p className="auth-confidential">
            {t("v2.loginHelp")}
            {config.contactPhone && (
              <>
                {" "}
                <a href={"tel:" + config.contactPhone} dir="ltr">
                  {config.contactPhone}
                </a>
              </>
            )}
          </p>
          <p className="auth-confidential">
            {t(staffMode ? "v2.loginPrivacy" : "auth.employeePrivacy")}
          </p>
        </div>
      </section>
    </main>
  );
}
