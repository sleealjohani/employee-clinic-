"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { FileField } from "@/components/ui/FileField";
import { IconImport } from "@/components/layout/icons";
import { CHUNK_BYTES } from "@/lib/import/chunk";


/** A failing response is not always JSON — a gateway may answer with HTML. */
async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // fall through
  }
  return response.status === 413 ? "imp.tooLarge" : "common.error";
}

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; sent: number; total: number }
  | { kind: "extracting" }
  | { kind: "error"; message: string };

export function UploadForm({
  allowImages = false,
  maxBytes,
}: {
  allowImages?: boolean;
  maxBytes: number;
}) {
  const t = useT();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const busy = phase.kind === "uploading" || phase.kind === "extracting";

  /**
   * The file is sliced in the browser and posted a few megabytes at a time.
   * A screening batch is far larger than a serverless request body may be, so
   * sending it whole would be rejected before the server could read it.
   */
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = formRef.current?.querySelector<HTMLInputElement>('input[type="file"]');
    const file = input?.files?.[0];
    if (!file) return;

    if (file.size > maxBytes) {
      setPhase({ kind: "error", message: "imp.tooLarge" });
      return;
    }

    try {
      setPhase({ kind: "uploading", sent: 0, total: file.size });

      const started = await fetch("/api/import/upload?step=init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, size: file.size }),
      });
      if (!started.ok) {
        setPhase({ kind: "error", message: await readError(started) });
        return;
      }
      const init = (await started.json().catch(() => ({}))) as { batchId?: string; attachmentId?: string };
      if (!init.attachmentId || !init.batchId) {
        setPhase({ kind: "error", message: "common.error" });
        return;
      }

      // Sequential, so the chunks append in order. A phone on mobile data
      // drops requests; one lost chunk should cost a retry, not the upload.
      for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
        const slice = file.slice(offset, Math.min(offset + CHUNK_BYTES, file.size));
        let sent = false;
        for (let attempt = 0; attempt < 3 && !sent; attempt++) {
          try {
            const response = await fetch(`/api/import/upload?step=chunk&id=${init.attachmentId}`, {
              method: "POST",
              headers: { "content-type": "application/octet-stream" },
              body: slice,
            });
            if (response.ok) {
              sent = true;
              break;
            }
            // A refusal from the server is final — retrying cannot help.
            const failed = await readError(response);
            setPhase({ kind: "error", message: failed });
            return;
          } catch {
            // Network-level failure: wait a moment and try this chunk again.
            if (attempt === 2) {
              setPhase({ kind: "error", message: "imp.uploadInterrupted" });
              return;
            }
            await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
          }
        }
        setPhase({ kind: "uploading", sent: Math.min(offset + CHUNK_BYTES, file.size), total: file.size });
      }

      setPhase({ kind: "extracting" });
      const done = await fetch("/api/import/upload?step=finish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ batchId: init.batchId }),
      });
      if (!done.ok) {
        setPhase({ kind: "error", message: await readError(done) });
        return;
      }
      const result = (await done.json().catch(() => ({}))) as { batchId?: string };
      if (!result.batchId) {
        setPhase({ kind: "error", message: "common.error" });
        return;
      }

      router.push(`/labs/import/${result.batchId}`);
    } catch {
      setPhase({ kind: "error", message: "common.error" });
    }
  }

  const percent =
    phase.kind === "uploading" && phase.total > 0
      ? Math.round((phase.sent / phase.total) * 100)
      : 0;

  return (
    <form ref={formRef} onSubmit={upload}>
      <FileField
        name="file"
        accept={allowImages ? "application/pdf,image/jpeg,image/png,image/webp" : "application/pdf"}
        required
        hint={t("imp.uploadHint", { mb: Math.round(maxBytes / (1024 * 1024)) })}
      />

      <div className="mt-4">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          <IconImport size={16} />
          {phase.kind === "uploading"
            ? `${t("imp.uploading")} ${percent}%`
            : phase.kind === "extracting"
              ? t("imp.extracting")
              : t("action.upload")}
        </button>
      </div>

      {phase.kind === "uploading" && (
        <div className="mt-3">
          <div className="upload-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${percent}%` }} />
          </div>
          <p className="num mt-1.5 text-xs" style={{ color: "var(--text-faint)" }} dir="ltr">
            {(phase.sent / 1048576).toFixed(1)} / {(phase.total / 1048576).toFixed(1)} MB
          </p>
        </div>
      )}

      {phase.kind === "extracting" && (
        <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
          {t("imp.extracting")} — {t("imp.extractingLong")}
        </p>
      )}

      {phase.kind === "error" && (
        <p
          className="mt-3 rounded-lg px-3 py-2 text-xs font-semibold"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
          role="alert"
        >
          {t(phase.message, { mb: Math.round(maxBytes / (1024 * 1024)) })}
        </p>
      )}
    </form>
  );
}
