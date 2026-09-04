# Employee Clinic — working notes

Internal occupational-health system for Al Hadeethah General Hospital.
Arabic-first (RTL), Next.js App Router, Prisma + PostgreSQL.

## Rules that must not be broken

1. **No clinical record is ever deleted, with one exception.** Archive an
   employee; mark a record `ENTERED_IN_ERROR` with a reason. Voiding stays the
   correction for everything — labs, vaccinations, visits — and no delete path
   may be added for them.
   The exception, added at the clinic's explicit request: an exposure incident
   can be deleted permanently by an ADMIN holding `clinical.delete`
   (`deleteNeedleStickIncidentAction`). It writes the whole record into the
   append-only `AuditLog` before removing the row, because that entry then
   becomes the only evidence the incident was reported. Do not widen this to
   other record types, and do not grant `clinical.delete` to another role,
   without the clinic asking for it in the same explicit terms.
2. **The model extracts, the system interprets.** `src/lib/ai/extract.ts` returns
   values, units and ranges verbatim. Flags, criticality, immunity and due dates
   are computed in `src/lib/clinical/*` from those values. Never let an extracted
   field carry a clinical judgement.
3. **Nothing imported reaches a health record without human approval.** The path
   is upload → extract → `LabImportItem` (candidates) → review screen → commit.
   Employees are never auto-created from an extraction.
4. **`AuditLog` is append-only.** Only `writeAudit()` touches it.
5. **VIEWER never sees clinical detail.** Check `can(role, …)` in
   `src/lib/auth/rbac.ts` before exposing anything beyond aggregates.

## Conventions

- Server Actions for writes, server components for reads; `revalidatePath` after
  every mutation.
- Every user-facing string goes through `t()` and needs a key in **both** `ar`
  and `en` in `src/lib/i18n/dict.ts`.
- Latin runs inside Arabic text (IDs, dates, values, units) need `.num` or
  `dir="ltr"`, or the bidi algorithm reorders them.
- Colours come from CSS variables in `globals.css`. `--ok/--warn/--danger` are
  text tokens (4.5:1 on their chip background); `--mark-*` are the validated
  chart-mark tokens. Do not mix them.
- Test codes and vaccine codes come from `src/lib/catalog/*`. Adding a test means
  adding it there — the extractor's enum is generated from that list.

## Checks before pushing

```bash
npm run typecheck && npm run lint && npm run build
```
