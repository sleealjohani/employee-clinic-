import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { Logo } from "@/components/brand/Logo";
import { SetupForm } from "./SetupForm";

export const metadata = { title: "تهيئة النظام" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  // Setup closes itself permanently the moment a single user exists.
  if ((await db.user.count()) > 0) redirect("/login");
  const t = await getT();

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[28rem]">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo height={62} />
          <h1 className="mt-4 text-lg font-bold">{t("setup.title")}</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            {t("setup.intro")}
          </p>
        </div>
        <div className="card card-pad">
          <SetupForm />
        </div>
      </div>
    </div>
  );
}
