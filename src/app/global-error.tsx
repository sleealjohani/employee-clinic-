"use client";

import { useEffect } from "react";

/**
 * Last resort: this replaces the whole document, so it cannot rely on the root
 * layout, the theme cookie or the translator — everything it needs is inline.
 * It is deliberately bilingual for the same reason.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[clinic] fatal error", error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "1.5rem",
          background: "#f4f7fa",
          color: "#12303c",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <main style={{ maxWidth: "26rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.05rem", fontWeight: 800, margin: 0 }}>
            تعذّر عرض الصفحة
          </h1>
          <p style={{ marginTop: ".6rem", fontSize: ".85rem", lineHeight: 1.7, color: "#4a6472" }}>
            حدث خطأ غير متوقع. لم يُفقد أي سجل — أعد المحاولة أو ارجع إلى لوحة التحكم.
            <br />
            <span style={{ direction: "ltr", display: "inline-block", marginTop: ".35rem" }}>
              Something went wrong. No record was lost.
            </span>
          </p>

          <div style={{ marginTop: "1.25rem", display: "flex", gap: ".5rem", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: ".55rem 1.1rem",
                borderRadius: ".7rem",
                border: 0,
                background: "#1489bd",
                color: "#fff",
                fontWeight: 700,
                fontSize: ".85rem",
              }}
            >
              إعادة المحاولة
            </button>
            <a
              href="/dashboard"
              style={{
                padding: ".55rem 1.1rem",
                borderRadius: ".7rem",
                border: "1px solid #cfdde5",
                color: "#12303c",
                fontWeight: 700,
                fontSize: ".85rem",
                textDecoration: "none",
              }}
            >
              لوحة التحكم
            </a>
          </div>

          {(error.digest || error.message) && (
            <p
              style={{
                marginTop: "1.5rem",
                padding: ".55rem .75rem",
                borderRadius: ".7rem",
                background: "#e7eef3",
                color: "#5b7684",
                fontSize: ".68rem",
                direction: "ltr",
                wordBreak: "break-word",
                userSelect: "all",
              }}
            >
              {error.digest ?? error.message}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
