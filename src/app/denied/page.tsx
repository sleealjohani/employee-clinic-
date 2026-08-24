import Link from "next/link";
import { getT } from "@/lib/i18n";
import { LogoMark } from "@/components/brand/Logo";

export const metadata = { title: "لا توجد صلاحية" };

export default async function DeniedPage() {
  const t = await getT();
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card card-pad max-w-md text-center">
        <div className="mb-3 flex justify-center">
          <LogoMark size={44} />
        </div>
        <h1 className="text-lg font-bold">{t("auth.noAccess")}</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          {t("role.VIEWER.desc")}
        </p>
        <Link href="/dashboard" className="btn btn-primary mt-5">
          {t("nav.dashboard")}
        </Link>
      </div>
    </div>
  );
}
