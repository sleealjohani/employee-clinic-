"use client";

import { useEffect } from "react";
import { useT } from "@/lib/i18n/client";
import { LogoMark } from "@/components/brand/Logo";

/**
 * Shown when a page throws while rendering.
 *
 * Before this existed, any such failure left a blank page carrying the
 * framework's own English sentence — no cause, no way back, and nothing the
 * person could tell us afterwards. The digest is printed and selectable
 * precisely so a report can name the real failure.
 */
export function ErrorPanel({
  error,
  reset,
  showLogo = false,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  showLogo?: boolean;
}) {
  const t = useT();

  useEffect(() => {
    console.error("[clinic] render error", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      {showLogo && (
        <div className="mb-3 flex justify-center">
          <LogoMark size={40} />
        </div>
      )}
      <h1 className="text-lg font-bold">{t("err.title")}</h1>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
        {t("err.body")}
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <button type="button" className="btn btn-primary" onClick={reset}>
          {t("action.retry")}
        </button>
        <a href="/dashboard" className="btn btn-ghost">
          {t("nav.dashboard")}
        </a>
      </div>

      {(error.digest || error.message) && (
        <p
          className="num mt-6 select-all break-words rounded-xl border px-3 py-2 text-[0.68rem]"
          dir="ltr"
          style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}
        >
          {error.digest ?? error.message}
        </p>
      )}
    </div>
  );
}
