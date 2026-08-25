"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createPortal, useFormStatus } from "react-dom";
import { useT } from "@/lib/i18n/client";
import { IconX } from "@/components/layout/icons";
import styles from "./Modal.module.css";

const ModalContext = createContext<{ close: () => void }>({ close: () => {} });

export function useModalClose() {
  return useContext(ModalContext).close;
}

export function Modal({
  trigger,
  title,
  description,
  children,
  wide = false,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close]);

  // Every card and rail in this app carries a backdrop-filter, and a filtered
  // element becomes the containing block for its fixed-position descendants.
  // A dialog left where its trigger sits is therefore positioned against that
  // card and clipped by it — which is exactly what a modal must never be. The
  // portal lifts it out to the document so `position: fixed` means the
  // viewport again.
  const layer = (
    <div className={styles.layer}>
      <div className={styles.backdrop} onClick={close} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`${styles.dialog} ${wide ? styles.wide : styles.normal}`}
      >
        <div className={styles.head}>
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button className="btn btn-ghost btn-sm" type="button" onClick={close} aria-label="Close">
            <IconX />
          </button>
        </div>
        <ModalContext.Provider value={{ close }}>
          <div className={styles.body}>{children}</div>
        </ModalContext.Provider>
      </div>
    </div>
  );

  return (
    <>
      <span onClick={() => setOpen(true)} className="contents">
        {trigger}
      </span>
      {open && mounted && createPortal(layer, document.body)}
    </>
  );
}

/** Closes the surrounding modal (and refreshes the page data) once an action succeeds. */
export function CloseOnSuccess({ ok }: { ok?: boolean }) {
  const close = useModalClose();
  useEffect(() => {
    if (ok) close();
  }, [ok, close]);
  return null;
}

export function SubmitRow({
  submitLabel,
  danger = false,
}: {
  submitLabel?: string;
  danger?: boolean;
}) {
  const t = useT();
  const close = useModalClose();
  const { pending } = useFormStatus();
  return (
    <div className="mt-5 flex items-center justify-end gap-2 border-t pt-4">
      <button type="button" className="btn btn-ghost" onClick={close} disabled={pending}>
        {t("action.cancel")}
      </button>
      <button type="submit" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} disabled={pending}>
        {pending ? t("action.saving") : (submitLabel ?? t("action.save"))}
      </button>
    </div>
  );
}

export function FormError({ error }: { error?: string }) {
  const t = useT();
  if (!error) return null;
  return (
    <p
      className="mt-3 rounded-xl border px-3 py-2 text-xs font-semibold"
      style={{ background: "var(--danger-soft)", borderColor: "color-mix(in srgb, var(--danger) 22%, var(--border))", color: "var(--danger)" }}
      role="alert"
    >
      {t(error)}
    </p>
  );
}
