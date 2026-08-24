"use client";

/* eslint-disable @next/next/no-img-element */

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useT } from "@/lib/i18n/client";
import { Alert, Field } from "@/components/ui";
import {
  beginTotpSetup,
  confirmTotpAction,
  disableTotpAction,
  revokeOtherSessionsAction,
} from "@/server/actions/users";
import type { ActionState } from "@/server/actions/employees";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
      {label}
    </button>
  );
}

export function TwoFactorPanel({ enabled }: { enabled: boolean }) {
  const t = useT();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmState, confirmAction] = useActionState<ActionState, FormData>(confirmTotpAction, {});
  const [disableState, disableAction] = useActionState<ActionState, FormData>(disableTotpAction, {});

  if (enabled && !disableState.ok) {
    return (
      <div>
        <div className="mb-3">
          <Alert tone="ok">{t("user.twoFactor")} — {t("user.active")}</Alert>
        </div>
        <form action={disableAction} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[14rem] flex-1">
            <Field label={t("auth.currentPassword")} required>
              <input className="input" name="password" type="password" required />
            </Field>
          </div>
          <button type="submit" className="btn btn-danger btn-sm">
            {t("user.disable2fa")}
          </button>
        </form>
        {disableState.error && (
          <p className="mt-2 text-xs font-semibold" style={{ color: "var(--danger)" }}>
            {t(disableState.error)}
          </p>
        )}
      </div>
    );
  }

  if (confirmState.ok) {
    return <Alert tone="ok">{t("user.twoFactor")} — {t("common.saved")}</Alert>;
  }

  if (!setup) {
    return (
      <div>
        <p className="mb-3 text-sm" style={{ color: "var(--text-muted)" }}>
          {t("user.2faRequired")}
        </p>
        <button
          className="btn btn-primary btn-sm"
          disabled={pending}
          onClick={() => startTransition(async () => setSetup(await beginTotpSetup()))}
        >
          {t("user.enable2fa")}
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-sm" style={{ color: "var(--text-muted)" }}>
        {t("user.2faScan")}
      </p>
      <div className="flex flex-wrap items-start gap-4">
        <img src={setup.qr} alt="" width={180} height={180} className="rounded-lg bg-white p-2" />
        <div className="min-w-[13rem] flex-1">
          <p className="label">{t("setup.token")}</p>
          <code className="num block select-all break-all rounded-lg p-2 text-xs" style={{ background: "var(--surface-3)" }} dir="ltr">
            {setup.secret}
          </code>
          <form action={confirmAction} className="mt-3">
            <Field label={t("auth.otp")} required>
              <input
                className="input num text-center tracking-[0.4em]"
                name="code"
                inputMode="numeric"
                maxLength={6}
                dir="ltr"
                required
              />
            </Field>
            {confirmState.error && (
              <p className="mt-2 text-xs font-semibold" style={{ color: "var(--danger)" }}>
                {t(confirmState.error)}
              </p>
            )}
            <div className="mt-3">
              <Submit label={t("action.confirm")} />
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export function RevokeSessionsButton() {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  return (
    <button
      className="btn btn-ghost btn-sm"
      disabled={pending || done}
      onClick={() =>
        startTransition(async () => {
          await revokeOtherSessionsAction();
          setDone(true);
        })
      }
    >
      {done ? t("common.saved") : t("action.logout")}
    </button>
  );
}
