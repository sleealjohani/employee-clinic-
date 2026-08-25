"use client";

import { useId, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";

/**
 * A localised drop target for a single file.
 *
 * The native control renders "Choose File / No file chosen" in the browser's own
 * language and lays it out left-to-right, which reads as broken inside an Arabic
 * form. The real <input type="file"> is still here and still focusable — it is
 * only visually replaced, so keyboard and assistive-technology behaviour is the
 * browser's, not a reimplementation.
 */
export function FileField({
  name,
  accept,
  required,
  hint,
}: {
  name: string;
  accept?: string;
  required?: boolean;
  hint?: string;
}) {
  const t = useT();
  const id = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [filename, setFilename] = useState("");
  const [dragging, setDragging] = useState(false);

  return (
    <div>
      <label
        htmlFor={id}
        className="file-field lift"
        data-dragging={dragging || undefined}
        data-filled={filename ? true : undefined}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const dropped = event.dataTransfer.files?.[0];
          if (!dropped || !inputRef.current) return;
          inputRef.current.files = event.dataTransfer.files;
          setFilename(dropped.name);
        }}
      >
        <input
          ref={inputRef}
          id={id}
          className="file-field-input"
          type="file"
          name={name}
          accept={accept}
          required={required}
          onChange={(event) => setFilename(event.target.files?.[0]?.name ?? "")}
        />

        <span className="file-field-icon" aria-hidden>
          {filename ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </span>

        <span className="file-field-name" dir="auto">
          {filename || t("file.drop")}
        </span>
        <span className="file-field-button">{t("file.choose")}</span>
      </label>
      {hint && (
        <span className="mt-2 block text-[0.7rem] leading-relaxed" style={{ color: "var(--text-faint)" }}>
          {hint}
        </span>
      )}
    </div>
  );
}
