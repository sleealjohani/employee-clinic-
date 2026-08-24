"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction, type LoginState } from "@/server/actions/auth";
import { useT } from "@/lib/i18n/client";
import { Field } from "@/components/ui";

function SubmitButton({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {pending ? busy : label}
    </button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const t = useT();
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="space-y-3.5">
      <input type="hidden" name="next" value={next} />

      <Field label={t("auth.username")} required>
        <input
          className="input"
          name="username"
          autoComplete="username"
          defaultValue={state.username}
          dir="ltr"
          required
          autoFocus={!state.needsOtp}
        />
      </Field>

      <Field label={t("auth.password")} required>
        <input className="input" name="password" type="password" autoComplete="current-password" required />
      </Field>

      {state.needsOtp && (
        <Field label={t("auth.otp")} hint={t("auth.otpHint")} required>
          <input
            className="input num text-center tracking-[0.4em]"
            name="otp"
            inputMode="numeric"
            maxLength={6}
            dir="ltr"
            autoComplete="one-time-code"
            required
            autoFocus
          />
        </Field>
      )}

      {state.error && (
        <p
          className="rounded-lg px-3 py-2 text-xs font-semibold"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
          role="alert"
        >
          {t(state.error)}
        </p>
      )}

      <SubmitButton label={t("auth.signin")} busy={t("common.loading")} />
    </form>
  );
}
