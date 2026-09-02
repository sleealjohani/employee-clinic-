"use client";
import { useEffect, useState, useRef } from "react";
import { useT } from "@/lib/i18n/client";
export function SessionGuard() {
  const t = useT(),
    [warning, setWarning] = useState(false),
    lastActivity = useRef(Date.now()),
    lastRefresh = useRef(Date.now());
  async function refresh() {
    try {
      const response = await fetch("/api/auth/refresh", { method: "POST" });
      if (response.status === 401) {
        window.location.assign(
          "/login?next=" + encodeURIComponent(window.location.pathname),
        );
        return;
      }
      if (response.ok) {
        lastRefresh.current = Date.now();
        lastActivity.current = Date.now();
        setWarning(false);
      }
    } catch {
      /* Preserve unsaved content during a temporary connection failure. */
    }
  }
  useEffect(() => {
    function activity() {
      lastActivity.current = Date.now();
    }
    for (const event of ["pointerdown", "keydown", "input"])
      window.addEventListener(event, activity, { passive: true });
    const timer = setInterval(() => {
      const now = Date.now();
      setWarning(now - lastRefresh.current > 13 * 60000);
      if (now - lastRefresh.current > 15 * 60000) {
        window.location.assign(
          "/login?next=" + encodeURIComponent(window.location.pathname),
        );
        return;
      }
      if (
        document.visibilityState === "visible" &&
        now - lastActivity.current < 60000 &&
        now - lastRefresh.current > 60000
      )
        void refresh();
    }, 15000);
    return () => {
      clearInterval(timer);
      for (const event of ["pointerdown", "keydown", "input"])
        window.removeEventListener(event, activity);
    };
  }, []);
  return warning ? (
    <div className="session-warning" role="alert">
      <p>{t("v2.sessionWarning")}</p>
      <button type="button" className="btn btn-primary" onClick={refresh}>
        {t("v2.continueSession")}
      </button>
    </div>
  ) : null;
}
