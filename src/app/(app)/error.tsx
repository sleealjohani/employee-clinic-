"use client";

import { ErrorPanel } from "@/components/feedback/ErrorPanel";

/**
 * Sits inside the workspace layout, so a page that fails keeps the navigation
 * around it — the reader can move on rather than being stranded.
 */
export default function WorkspaceError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel {...props} />;
}
