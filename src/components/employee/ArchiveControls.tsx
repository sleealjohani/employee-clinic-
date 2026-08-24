"use client";

import { useActionState } from "react";
import { useT } from "@/lib/i18n/client";
import { Field } from "@/components/ui";
import { CloseOnSuccess, FormError, Modal, SubmitRow } from "@/components/ui/Modal";
import { archiveEmployeeAction, restoreEmployeeAction, type ActionState } from "@/server/actions/employees";

export function ArchiveEmployeeButton({ employeeId }: { employeeId: string }) {
  const t = useT();
  const [state, formAction] = useActionState<ActionState, FormData>(archiveEmployeeAction, {});

  return (
    <Modal
      title={t("action.archive")}
      description={t("emp.archiveConfirm")}
      trigger={<button className="btn btn-ghost">{t("action.archive")}</button>}
    >
      <form action={formAction}>
        <CloseOnSuccess ok={state.ok} />
        <input type="hidden" name="id" value={employeeId} />
        <Field label={t("common.reason")} required>
          <textarea className="textarea" name="reason" rows={3} required />
        </Field>
        <FormError error={state.error} />
        <SubmitRow submitLabel={t("action.archive")} danger />
      </form>
    </Modal>
  );
}

export function RestoreEmployeeButton({ employeeId }: { employeeId: string }) {
  const t = useT();
  const [, formAction] = useActionState<ActionState, FormData>(restoreEmployeeAction, {});

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={employeeId} />
      <button type="submit" className="btn btn-ghost">
        {t("action.restore")}
      </button>
    </form>
  );
}
