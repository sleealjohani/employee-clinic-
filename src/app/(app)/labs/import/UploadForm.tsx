"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { uploadAndExtractAction, type UploadState } from "@/server/actions/import";
import { useT } from "@/lib/i18n/client";
import { Field } from "@/components/ui";
import { IconImport } from "@/components/layout/icons";

function Submit() {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      <IconImport size={16} />
      {pending ? t("imp.extracting") : t("action.upload")}
    </button>
  );
}

function Progress() {
  const t = useT();
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
      {t("imp.extracting")} — {t("common.loading")}
    </p>
  );
}

export function UploadForm() {
  const t = useT();
  const [state, formAction] = useActionState<UploadState, FormData>(uploadAndExtractAction, {});

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[16rem] flex-1">
        <Field label={t("imp.file")} hint={t("imp.uploadHint")} required>
          <input
            className="input"
            type="file"
            name="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            required
          />
        </Field>
      </div>
      <Submit />
      <div className="w-full">
        <Progress />
        {state.error && (
          <p
            className="mt-3 rounded-lg px-3 py-2 text-xs font-semibold"
            style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
            role="alert"
          >
            {t(state.error)}
          </p>
        )}
      </div>
    </form>
  );
}
