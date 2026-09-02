"use client";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
export function AttachmentPreview({
  id,
  page = 1,
}: {
  id: string;
  page?: number;
}) {
  const t = useT(),
    [state, setState] = useState<{
      url?: string;
      name?: string;
      type?: string;
      error?: boolean;
      percent: number;
    }>({ percent: 0 });
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    async function load() {
      try {
        setState({ percent: 0 });
        const meta = await fetch("/api/attachments/" + id + "?metadata=1", {
          signal: controller.signal,
        });
        if (!meta.ok) throw new Error("unavailable");
        const file = (await meta.json()) as {
          filename: string;
          mimeType: string;
          size: number;
          chunkBytes: number;
        };
        const parts: ArrayBuffer[] = [];
        let offset = 0;
        while (offset < file.size) {
          const response = await fetch("/api/attachments/" + id, {
            headers: {
              Range: `bytes=${offset}-${Math.min(file.size - 1, offset + file.chunkBytes - 1)}`,
            },
            signal: controller.signal,
          });
          if (response.status !== 206) throw new Error("invalid range");
          const bytes = await response.arrayBuffer();
          if (!bytes.byteLength) throw new Error("empty range");
          parts.push(bytes);
          offset += bytes.byteLength;
          setState({ percent: Math.round((offset / file.size) * 100) });
        }
        objectUrl = URL.createObjectURL(
          new Blob(parts, { type: file.mimeType }),
        );
        setState({
          url: objectUrl,
          name: file.filename,
          type: file.mimeType,
          percent: 100,
        });
      } catch {
        if (!controller.signal.aborted) setState({ error: true, percent: 0 });
      }
    }
    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);
  if (state.error)
    return (
      <p className="form-error" role="alert">
        {t("common.error")}
      </p>
    );
  if (!state.url)
    return (
      <div className="document-loading" role="status">
        <p>
          {t("v2.loading")} <span className="num">{state.percent}%</span>
        </p>
        <progress max={100} value={state.percent} />
      </div>
    );
  return (
    <div className="document-preview">
      <a
        className="btn btn-ghost btn-sm mb-3"
        href={state.url}
        download={state.name}
      >
        {t("action.download")}
      </a>
      {state.type === "application/pdf" ? (
        <iframe
          title={state.name || t("v2.file")}
          src={state.url + "#page=" + page}
          style={{
            width: "100%",
            height: "75vh",
            border: "1px solid var(--border)",
            borderRadius: 12,
          }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={state.url}
          alt={state.name || t("v2.file")}
          style={{ maxWidth: "100%", maxHeight: "75vh", objectFit: "contain" }}
        />
      )}
    </div>
  );
}
