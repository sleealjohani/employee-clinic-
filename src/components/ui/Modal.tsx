"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { useT } from "@/lib/i18n/client";
import { IconX } from "@/components/layout/icons";

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
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close]);

  return (
    <>
      <span onClick={() => setOpen(true)} className="contents">
        {trigger}
      </span>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 no-print">
          <div
            className="fixed inset-0"
            style={{ background: "rgb(6 18 25 / 0.55)" }}
            onClick={close}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`card relative my-6 w-full ${wide ? "max-w-4xl" : "max-w-lg"}`}
            style={{ boxShadow: "var(--shadow-md)" }}
          >
            <div className="flex items-start justify-between gap-3 border-b px-5 py-3.5">
              <div>
                <h2 className="text-sm font-bold">{title}</h2>
                {description && (
                  <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    {description}
                  </p>
                )}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={close} aria-label="Close">
                <IconX />
              </button>
            </div>
            <ModalContext.Provider value={{ close }}>
              <div className="px-5 py-4">{children}</div>
            </ModalContext.Provider>
          </div>
        </div>
      )}
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
      className="mt-3 rounded-lg px-3 py-2 text-xs font-semibold"
      style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
      role="alert"
    >
      {t(error)}
    </p>
  );
}
