"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { savePersonalHealthFileAction } from "@/server/actions/personal-health-file";

type PhfChange = {
  path: string;
  value: unknown;
  data: Record<string, unknown>;
};

type PersonalHealthFileApi = {
  setData(data: Record<string, unknown>): PersonalHealthFileApi;
  getData(): Record<string, unknown>;
  setEditable(on: boolean): PersonalHealthFileApi;
  onChange(fn: (detail: PhfChange) => void): () => void;
  isDirty(): boolean;
  markSaved(): PersonalHealthFileApi;
  next(): PersonalHealthFileApi;
  prev(): PersonalHealthFileApi;
  print(): PersonalHealthFileApi;
  setChrome(on: boolean): PersonalHealthFileApi;
};

type PhfWindow = Window & {
  PersonalHealthFile?: PersonalHealthFileApi;
};

type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict" | "loading";

const STATUS: Record<SaveState, string> = {
  loading: "جاري فتح الملف الصحي…",
  saved: "محفوظ",
  dirty: "تغييرات غير محفوظة",
  saving: "جاري الحفظ…",
  error: "تعذر الحفظ — حاول مرة أخرى",
  conflict: "تم تعديل الملف من مستخدم آخر — أعد فتح الصفحة قبل الحفظ",
};

export function PersonalHealthFileHost({
  employeeId,
  initialData,
  initialRevision,
  editable,
}: {
  employeeId: string;
  initialData: Record<string, unknown>;
  initialRevision: number;
  editable: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const apiRef = useRef<PersonalHealthFileApi | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const revisionRef = useRef(initialRevision);
  const [status, setStatus] = useState<SaveState>("loading");
  const [dirty, setDirty] = useState(false);

  const attach = useCallback(() => {
    const frame = iframeRef.current;
    const api = (frame?.contentWindow as PhfWindow | null)?.PersonalHealthFile;
    if (!api) {
      setStatus("error");
      return;
    }

    unsubscribeRef.current?.();
    apiRef.current = api;

    // The standalone booklet stays read-only by default. The clinic host is
    // the explicit owner of editing and persistence, so hide its demo chrome.
    api.setData(initialData).setEditable(editable).setChrome(false).markSaved();
    setDirty(false);
    setStatus("saved");

    unsubscribeRef.current = api.onChange(() => {
      const isDirty = api.isDirty();
      setDirty(isDirty);
      if (isDirty) setStatus((current) => (current === "saving" ? current : "dirty"));
    });
  }, [editable, initialData]);

  useEffect(() => {
    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      apiRef.current = null;
    };
  }, []);

  // The iframe suppresses its own beforeunload prompt once a host onChange
  // consumer exists. Mirror the dirty state at the application boundary.
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  const save = useCallback(async () => {
    const api = apiRef.current;
    if (!api || !editable || status === "saving") return;

    const data = api.getData();
    const savedSnapshot = JSON.stringify(data);
    setStatus("saving");

    const result = await savePersonalHealthFileAction(
      employeeId,
      data,
      revisionRef.current,
    );

    if (!result.ok || result.revision === undefined) {
      setDirty(api.isDirty());
      setStatus(result.error === "v2.conflict" ? "conflict" : "error");
      return;
    }

    revisionRef.current = result.revision;

    // A nurse may continue typing while the request is in flight. Only clear
    // dirty when the live DATA is byte-for-byte the snapshot just persisted.
    if (JSON.stringify(api.getData()) === savedSnapshot) {
      api.markSaved();
      setDirty(false);
      setStatus("saved");
    } else {
      setDirty(true);
      setStatus("dirty");
    }
  }, [editable, employeeId, status]);

  const statusTone =
    status === "saved"
      ? "var(--ok)"
      : status === "conflict" || status === "error"
        ? "var(--danger)"
        : status === "dirty"
          ? "var(--warn)"
          : "var(--text-muted)";

  return (
    <section className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
      <div
        className="no-print flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => apiRef.current?.prev()}>
            السابق
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => apiRef.current?.next()}>
            التالي
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => apiRef.current?.print()}>
            طباعة الملف
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: statusTone }} role="status" aria-live="polite">
            {STATUS[status]}
          </span>
          {!editable && (
            <span className="chip" style={{ background: "var(--surface-3)", color: "var(--text-muted)" }}>
              للقراءة فقط
            </span>
          )}
          {editable && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={save}
              disabled={!dirty || status === "saving" || status === "conflict"}
            >
              {status === "saving" ? "جاري الحفظ…" : "حفظ التغييرات"}
            </button>
          )}
        </div>
      </div>

      <iframe
        ref={iframeRef}
        src="/forms/personal-health-file.html"
        title="الملف الصحي الشخصي"
        className="block w-full border-0"
        style={{ height: "calc(100vh - 15rem)", minHeight: 760, background: "#23272c" }}
        onLoad={attach}
      />
    </section>
  );
}
