import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { Logo } from "@/components/brand/Logo";
import { PasswordForm } from "./PasswordForm";

export const metadata = { title: "تغيير كلمة المرور" };
export const dynamic = "force-dynamic";

/**
 * Deliberately outside the (app) route group: the app layout redirects here
 * when a password change is pending, so this page must not live under it.
 */
export default async function PasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getT();

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[26rem]">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo height={54} />
          <h1 className="mt-4 text-lg font-bold">{t("auth.changePassword")}</h1>
          {user.mustChangePassword && (
            <p className="mt-1 text-sm font-semibold" style={{ color: "var(--warn)" }}>
              {t("auth.mustChange")}
            </p>
          )}
        </div>
        <div className="card card-pad">
          <PasswordForm />
        </div>
      </div>
    </div>
  );
}
