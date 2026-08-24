"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { changePasswordAction, type PasswordState } from "@/server/actions/auth";
import { useT } from "@/lib/i18n/client";
import { Field } from "@/components/ui";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {label}
    </button>
  );
}

export function PasswordForm() {
  const t = useT();
  const [state, formAction] = useActionState<PasswordState, FormData>(changePasswordAction, {});

  return (
    <form action={formAction} className="space-y-3.5">
      <Field label={t("auth.currentPassword")} required>
        <input className="input" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label={t("auth.newPassword")} hint={t("auth.passwordWeak")} required>
        <input className="input" name="next" type="password" autoComplete="new-password" required />
      </Field>
      <Field label={t("auth.confirmPassword")} required>
        <input className="input" name="confirm" type="password" autoComplete="new-password" required />
      </Field>

      {state.error && (
        <p
          className="rounded-lg px-3 py-2 text-xs font-semibold"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
          role="alert"
        >
          {t(state.error)}
        </p>
      )}

      <Submit label={t("action.save")} />
    </form>
  );
}
