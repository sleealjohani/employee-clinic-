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

export function UploadForm({ allowImages = false }: { allowImages?: boolean }) {
  const t = useT();
  const ar = t.locale === "ar";
  const [state, formAction] = useActionState<UploadState, FormData>(uploadAndExtractAction, {});

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[16rem] flex-1">
        <Field
          label={t("imp.file")}
          hint={
            allowImages
              ? t("imp.uploadHint")
              : ar
                ? "PDF رقمي حتى 10 MB. تتم معالجة النص داخل الخادم دون إرسال التقرير إلى خدمة ذكاء اصطناعي خارجية."
                : "Digital PDF up to 10 MB. Text is processed on the server without sending the report to an external AI service."
          }
          required
        >
          <input
            className="input"
            type="file"
            name="file"
            accept={allowImages ? "application/pdf,image/jpeg,image/png,image/webp" : "application/pdf"}
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
