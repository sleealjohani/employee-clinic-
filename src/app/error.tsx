"use client";

import { ErrorPanel } from "@/components/feedback/ErrorPanel";

export default function RouteError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel {...props} showLogo />;
}
