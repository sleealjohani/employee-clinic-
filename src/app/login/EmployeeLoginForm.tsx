"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import {
  employeeLoginAction,
  type EmployeeLoginState,
} from "@/server/actions/employee-auth";

function Submit() {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button className="btn btn-primary w-full" type="submit" disabled={pending}>
      {t(pending ? "common.loading" : "auth.signin")}
    </button>
  );
}

export function EmployeeLoginForm({ next }: { next: string }) {
  const t = useT();
  const [state, action] = useActionState<EmployeeLoginState, FormData>(
    employeeLoginAction,
    {},
  );
  return (
    <form action={action} className="space-y-3.5">
      <input type="hidden" name="next" value={next} />
      <Field
        label={t("emp.nationalId")}
        hint={t("auth.employeeIdHint")}
        required
      >
        <input
          className="input num"
          name="nationalId"
          type="text"
          inputMode="numeric"
          autoComplete="username"
          dir="ltr"
          minLength={10}
          maxLength={10}
          pattern="[0-9٠-٩۰-۹]{10}"
          required
          autoFocus
          aria-describedby={state.error ? "employee-login-error" : undefined}
        />
      </Field>
      {state.error && (
        <p
          id="employee-login-error"
          role="alert"
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          {t(state.error)}
        </p>
      )}
      <Submit />
    </form>
  );
}
