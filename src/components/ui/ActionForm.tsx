"use client";
import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useT } from "@/lib/i18n/client";
import type { ResultState } from "@/lib/action-result";
export function SubmitButton({
  label,
  danger = false,
  disabled = false,
}: {
  label?: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button
      type="submit"
      className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
      disabled={pending || disabled}
    >
      {pending ? t("v2.saving") : label || t("action.save")}
    </button>
  );
}
export function ActionForm({
  action,
  children,
  label,
  className = "",
  success = true,
  danger = false,
}: {
  action: (prev: ResultState, form: FormData) => Promise<ResultState>;
  children?: ReactNode;
  label?: string;
  className?: string;
  success?: boolean;
  danger?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  const t = useT();
  return (
    <form action={formAction} className={className}>
      {children}
      <div className="form-feedback" aria-live="polite">
        {state.error && (
          <p role="alert" className="form-error">
            {t(state.error)}
          </p>
        )}
        {state.ok && success && <p className="form-success">{t("v2.saved")}</p>}
      </div>
      <SubmitButton label={label} danger={danger} />
    </form>
  );
}
