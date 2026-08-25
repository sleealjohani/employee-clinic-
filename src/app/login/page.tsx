import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { Logo } from "@/components/brand/Logo";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "تسجيل الدخول" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; setup?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  // A fresh deployment has no users at all — send the first visitor to setup.
  if ((await db.user.count()) === 0) redirect("/setup");

  const params = await searchParams;
  const t = await getT();

  return (
    <div className="workspace-shell flex min-h-screen items-center justify-center px-4 py-10">
      <div className="ambient-orb ambient-orb-one" />
      <div className="ambient-orb ambient-orb-two" />

      <div className="auth-panel w-full max-w-[26rem]">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo height={62} />
          <p className="mt-4 text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
            {t("auth.subtitle")}
          </p>
        </div>

        <div className="card card-pad glass-strong specular">
          {params.setup === "done" && (
            <div
              className="mb-4 rounded-lg px-3 py-2 text-xs font-semibold"
              style={{ background: "var(--ok-soft)", color: "var(--ok)" }}
            >
              {t("setup.done")}
            </div>
          )}
          <LoginForm next={params.next ?? ""} />
        </div>

        <p className="mt-5 text-center text-[0.7rem] leading-relaxed" style={{ color: "var(--text-faint)" }}>
          {t("auth.confidential")}
        </p>
      </div>
    </div>
  );
}
