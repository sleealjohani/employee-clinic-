"use client";

import { useActionState, useEffect, useState } from "react";
import { Modal, useModalClose } from "@/components/ui/Modal";
import { IconCheck } from "@/components/layout/icons";
import { useT } from "@/lib/i18n/client";
import { approveAllLabsAction } from "@/server/actions/clinical";

type Snapshot = { count: number; version: string };

function ApprovalForm({
  snapshot,
  onSuccess,
}: {
  snapshot: Snapshot;
  onSuccess: (count: number) => void;
}) {
  // Keep the scope shown at opening fixed until the user explicitly reopens.
  const [scope] = useState(snapshot);
  const [confirmed, setConfirmed] = useState(false);
  const [state, action, pending] = useActionState(approveAllLabsAction, {});
  const close = useModalClose();
  const t = useT();
  useEffect(() => {
    if (state.ok) {
      onSuccess(state.approvedCount ?? 0);
      close();
    }
  }, [state, close, onSuccess]);
  return (
    <form action={action} className="space-y-4" aria-busy={pending}>
      <input type="hidden" name="version" value={scope.version} />
      <p>{t("lab.bulkScope", { count: scope.count })}</p>
      <p className="muted">{t("lab.bulkSharingHint")}</p>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="confirm"
          value="yes"
          required
          checked={confirmed}
          disabled={pending}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>{t("lab.bulkAttestation")}</span>
      </label>
      {state.error && (
        <p role="alert" className="form-error">
          {t(state.error)}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={pending || !confirmed}
        >
          {pending
            ? t("action.saving")
            : t("lab.bulkConfirm", { count: scope.count })}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={pending}
          onClick={close}
        >
          {t("action.cancel")}
        </button>
      </div>
    </form>
  );
}

export function ApproveAllLabsButton({ snapshot }: { snapshot: Snapshot }) {
  const t = useT();
  const [approved, setApproved] = useState<number | null>(null);
  const trigger = (
    <button
      type="button"
      className="btn btn-primary"
      disabled={!snapshot.count}
    >
      <IconCheck size={16} /> {t("lab.approveAll")}{" "}
      <span className="num">({snapshot.count})</span>
    </button>
  );
  return (
    <div>
      <Modal title={t("lab.approveAll")} trigger={trigger}>
        <ApprovalForm snapshot={snapshot} onSuccess={setApproved} />
      </Modal>
      <div role="status" aria-live="polite">
        {approved !== null && (
          <p className="form-success">
            {t("lab.bulkSuccess", { count: approved })}
          </p>
        )}
      </div>
    </div>
  );
}
