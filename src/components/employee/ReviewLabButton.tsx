"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { reviewLabAction, type ActionState } from "@/server/actions/clinical";
import { IconCheck } from "@/components/layout/icons";

function Button({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-ghost btn-sm" disabled={pending}>
      <IconCheck size={14} /> {label}
    </button>
  );
}

export function ReviewLabButton({ labId, label }: { labId: string; label: string }) {
  const [, formAction] = useActionState<ActionState, FormData>(reviewLabAction, {});
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={labId} />
      <Button label={label} />
    </form>
  );
}
