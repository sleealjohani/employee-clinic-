"use client";
import { useRef, type ReactElement } from "react";

/**
 * Carry "which button was pressed" into a Server Action.
 *
 * A form whose `action` is a `useActionState` dispatcher does not receive the
 * submitter's `name`/`value` in its FormData — React builds that FormData
 * itself, and the pressed button is not part of it. A form that decided what
 * to do from `form.get("decision")` or `form.get("mode")` therefore read null
 * however the user submitted it: the lab review rejected every approval as
 * invalid, and the employee and OHC imports quietly took the preview branch on
 * every run, reporting rows they never wrote.
 *
 * The choice is written into a hidden field on click, which happens before the
 * form is submitted, so the action reads it back reliably.
 *
 * Render `field` inside the form and give each button `onClick={choose(...)}`.
 */
export function useSubmitChoice(
  name: string,
  fallback = "",
): {
  field: ReactElement;
  choose: (value: string) => () => void;
} {
  const ref = useRef<HTMLInputElement>(null);
  return {
    field: (
      <input type="hidden" name={name} ref={ref} defaultValue={fallback} />
    ),
    choose: (value: string) => () => {
      if (ref.current) ref.current.value = value;
    },
  };
}
