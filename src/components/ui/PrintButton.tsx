"use client";

import { useT } from "@/lib/i18n/client";

/** Printing uses the browser's own dialog and the print stylesheet in globals.css. */
export function PrintButton() {
  const t = useT();
  return (
    <button type="button" className="btn btn-ghost no-print" onClick={() => window.print()}>
      {t("action.print")}
    </button>
  );
}
