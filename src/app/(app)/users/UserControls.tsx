"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useT } from "@/lib/i18n/client";
import { Alert, Field } from "@/components/ui";
import { CloseOnSuccess, FormError, Modal, SubmitRow } from "@/components/ui/Modal";
import {
  clearUserTotpAction,
  createUserAction,
  resetUserPasswordAction,
  toggleUserActiveAction,
  updateUserRoleAction,
  type UserState,
} from "@/server/actions/users";
import { ROLES } from "@/lib/auth/rbac";
import { IconPlus } from "@/components/layout/icons";

function TempPassword({ value }: { value?: string }) {
  const t = useT();
  if (!value) return null;
  return (
    <div className="mt-3">
      <Alert tone="ok" title={t("user.tempPassword")}>
        <code className="num select-all text-base font-bold" dir="ltr">
          {value}
        </code>
        <p className="mt-1 text-xs">{t("user.tempPasswordHint")}</p>
      </Alert>
    </div>
  );
}

export function NewUserButton() {
  const t = useT();
  const [state, formAction] = useActionState<UserState, FormData>(createUserAction, {});

  return (
    <Modal
      title={t("user.new")}
      trigger={
        <button className="btn btn-primary">
          <IconPlus /> {t("user.new")}
        </button>
      }
    >
      <form action={formAction}>
        {/* The modal stays open on success so the temporary password can be copied. */}
        <div className="grid gap-3">
          <Field label={t("user.name")} required>
            <input className="input" name="name" required />
          </Field>
          <Field label={t("user.username")} required>
            <input className="input" name="username" dir="ltr" required />
          </Field>
          <Field label={t("emp.email")}>
            <input className="input" name="email" type="email" dir="ltr" />
          </Field>
          <Field label={t("user.role")} required>
            <select className="select" name="role" defaultValue="STAFF">
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`role.${role}`)} — {t(`role.${role}.desc`)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <TempPassword value={state.tempPassword} />
        <FormError error={state.error} />
        <SubmitRow />
      </form>
    </Modal>
  );
}

function InlineSubmit({ label, danger }: { label: string; danger?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`btn btn-sm ${danger ? "btn-danger" : "btn-ghost"}`} disabled={pending}>
      {label}
    </button>
  );
}

export function RoleSelect({ userId, role, disabled }: { userId: string; role: string; disabled: boolean }) {
  const t = useT();
  const [state, formAction] = useActionState<UserState, FormData>(updateUserRoleAction, {});

  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="id" value={userId} />
      <select className="select" name="role" defaultValue={role} disabled={disabled} style={{ minWidth: "9rem" }}>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {t(`role.${r}`)}
          </option>
        ))}
      </select>
      {!disabled && <InlineSubmit label={t("action.save")} />}
      {state.error && (
        <span className="text-[0.68rem]" style={{ color: "var(--danger)" }}>
          {t(state.error)}
        </span>
      )}
    </form>
  );
}

export function ToggleActive({ userId, isActive, disabled }: { userId: string; isActive: boolean; disabled: boolean }) {
  const t = useT();
  const [, formAction] = useActionState<UserState, FormData>(toggleUserActiveAction, {});
  if (disabled) return null;

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={userId} />
      <InlineSubmit label={isActive ? t("user.deactivate") : t("user.activate")} danger={isActive} />
    </form>
  );
}

export function ResetPassword({ userId, username }: { userId: string; username: string }) {
  const t = useT();
  const [state, formAction] = useActionState<UserState, FormData>(resetUserPasswordAction, {});

  return (
    <Modal
      title={`${t("user.resetPassword")} — ${username}`}
      trigger={<button className="btn btn-ghost btn-sm">{t("user.resetPassword")}</button>}
    >
      <form action={formAction}>
        <input type="hidden" name="id" value={userId} />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("user.tempPasswordHint")}
        </p>
        <TempPassword value={state.tempPassword} />
        <FormError error={state.error} />
        <SubmitRow submitLabel={t("user.resetPassword")} />
      </form>
    </Modal>
  );
}

export function ClearTotp({ userId, username }: { userId: string; username: string }) {
  const t = useT();
  const [state, formAction] = useActionState<UserState, FormData>(clearUserTotpAction, {});

  return (
    <Modal
      title={`${t("user.disable2fa")} — ${username}`}
      trigger={<button className="btn btn-ghost btn-sm">{t("user.disable2fa")}</button>}
    >
      <form action={formAction}>
        <CloseOnSuccess ok={state.ok} />
        <input type="hidden" name="id" value={userId} />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("user.2faScan")}
        </p>
        <FormError error={state.error} />
        <SubmitRow submitLabel={t("user.disable2fa")} danger />
      </form>
    </Modal>
  );
}
