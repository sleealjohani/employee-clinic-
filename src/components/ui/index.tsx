import Link from "next/link";
import type { ReactNode } from "react";

export type Tone = "ok" | "warn" | "danger" | "info" | "neutral" | "accent";

const TONE_STYLE: Record<Tone, { background: string; color: string; border?: string }> = {
  ok: { background: "var(--ok-soft)", color: "var(--ok)" },
  warn: { background: "var(--warn-soft)", color: "var(--warn)" },
  danger: { background: "var(--danger-soft)", color: "var(--danger)" },
  info: { background: "var(--info-soft)", color: "var(--info)" },
  accent: { background: "var(--accent-soft)", color: "var(--accent-text)" },
  neutral: { background: "var(--surface-3)", color: "var(--text-muted)" },
};

export function Chip({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
}) {
  const style = TONE_STYLE[tone];
  return (
    <span className="chip" style={{ background: style.background, color: style.color }}>
      {dot && (
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: "currentColor",
            display: "inline-block",
          }}
        />
      )}
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  badge,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 no-print">{actions}</div>}
    </header>
  );
}

export function Card({
  children,
  className = "",
  pad = true,
}: {
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return <section className={`card ${pad ? "card-pad" : ""} ${className}`}>{children}</section>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-bold" style={{ color: "var(--text)" }}>
        {children}
      </h2>
      {action}
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden style={{ opacity: 0.35 }}>
        <path
          d="M4 7.5A2.5 2.5 0 0 1 6.5 5h4l2 2.5h5A2.5 2.5 0 0 1 20 10v6.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
        {title}
      </p>
      {hint && (
        <p className="max-w-sm text-xs" style={{ color: "var(--text-faint)" }}>
          {hint}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  error,
  required,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="label">
        {label}
        {required && <span style={{ color: "var(--danger)" }}> *</span>}
      </span>
      {children}
      {hint && !error && (
        <span className="mt-1 block text-[0.7rem]" style={{ color: "var(--text-faint)" }}>
          {hint}
        </span>
      )}
      {error && (
        <span className="mt-1 block text-[0.7rem] font-semibold" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </label>
  );
}

export function KeyValue({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.7rem] font-semibold" style={{ color: "var(--text-faint)" }}>
        {label}
      </dt>
      <dd className={`mt-0.5 text-sm ${mono ? "num" : ""}`} style={{ color: "var(--text)" }}>
        {value ?? "—"}
      </dd>
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
}) {
  const style = TONE_STYLE[tone];
  return (
    <div
      className="rounded-xl px-3.5 py-3 text-sm"
      style={{
        background: style.background,
        color: style.color,
        border: `1px solid color-mix(in srgb, ${style.color} 25%, transparent)`,
      }}
    >
      {title && <p className="mb-0.5 font-bold">{title}</p>}
      <div className="leading-relaxed" style={{ opacity: 0.95 }}>
        {children}
      </div>
    </div>
  );
}

export function LinkButton({
  href,
  children,
  variant = "ghost",
  size,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "ghost";
  size?: "sm";
}) {
  return (
    <Link href={href} className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""}`}>
      {children}
    </Link>
  );
}

/** Thin horizontal meter — used for completeness and coverage, never as decoration. */
export function Meter({ value, tone = "accent" }: { value: number; tone?: Tone }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = tone === "accent" ? "var(--accent)" : TONE_STYLE[tone].color;
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full"
      style={{ background: "var(--surface-3)" }}
      role="img"
      aria-label={`${pct}%`}
    >
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
