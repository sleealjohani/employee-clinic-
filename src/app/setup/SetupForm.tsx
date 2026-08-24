"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { setupAction, type SetupState } from "@/server/actions/auth";
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

export function SetupForm() {
  const t = useT();
  const [state, formAction] = useActionState<SetupState, FormData>(setupAction, {});

  return (
    <form action={formAction} className="space-y-3.5">
      <Field label={t("setup.token")} hint={t("setup.tokenHint")} required>
        <input className="input" name="token" type="password" dir="ltr" required />
      </Field>
      <Field label={t("user.name")} required>
        <input className="input" name="name" required />
      </Field>
      <Field label={t("auth.username")} required>
        <input className="input" name="username" dir="ltr" required />
      </Field>
      <Field label={t("auth.password")} hint={t("auth.passwordWeak")} required>
        <input className="input" name="password" type="password" required />
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
