import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Two chart forms, both server-rendered SVG, both single-series.
 *
 * Single series is a deliberate constraint: every number on this dashboard is a
 * magnitude, so one hue carries it and no legend is needed. Where the data is
 * really a set of distinct states (immunity status), it is rendered as a table
 * with per-row meters instead of a stacked bar — five statuses cannot be told
 * apart by colour alone, and the label is the identity channel.
 */

const AXIS = "var(--text-faint)";
const GRID = "var(--grid)";

function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

export function ColumnChart({
  data,
  height = 170,
  labelEvery = 2,
  emptyLabel,
}: {
  data: { label: string; value: number; title?: string }[];
  height?: number;
  labelEvery?: number;
  emptyLabel: string;
}) {
  if (data.length === 0 || data.every((d) => d.value === 0)) {
    return (
      <p className="py-8 text-center text-xs" style={{ color: "var(--text-faint)" }}>
        {emptyLabel}
      </p>
    );
  }

  const W = 640;
  const padTop = 14;
  const padBottom = 26;
  const padStart = 34;
  const plotH = height - padTop - padBottom;
  const plotW = W - padStart - 8;

  const max = Math.max(...data.map((d) => d.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;

  const band = plotW / data.length;
  const barW = Math.min(24, band - 6);
  const peak = data.reduce((a, b) => (b.value > a.value ? b : a), data[0]);

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      height={height}
      role="img"
      style={{ overflow: "visible" }}
    >
      {ticks.map((tick) => {
        const y = padTop + plotH - (tick / top) * plotH;
        return (
          <g key={tick}>
            <line x1={padStart} x2={W - 8} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
            <text x={padStart - 6} y={y + 3.5} textAnchor="end" fontSize={10} fill={AXIS}>
              {tick}
            </text>
          </g>
        );
      })}

      {data.map((d, i) => {
        const h = top === 0 ? 0 : (d.value / top) * plotH;
        const x = padStart + i * band + (band - barW) / 2;
        const y = padTop + plotH - h;
        const isPeak = d.label === peak.label && d.value === peak.value;
        return (
          <g key={`${d.label}-${i}`}>
            {h > 0 && (
              <path
                className="bar-grow"
                style={{ animationDelay: `${i * 45}ms`, transformOrigin: `${x + barW / 2}px ${padTop + plotH}px` }}
                d={roundedTopBar(x, y, barW, h, 4)}
                fill="var(--mark-accent)"
                opacity={isPeak ? 1 : 0.82}
              >
                <title>{d.title ?? `${d.label}: ${d.value}`}</title>
              </path>
            )}
            {isPeak && h > 0 && (
              <text x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--text)">
                {d.value}
              </text>
            )}
            {i % labelEvery === 0 && (
              <text
                x={x + barW / 2}
                y={height - padBottom + 15}
                textAnchor="middle"
                fontSize={9.5}
                fill={AXIS}
              >
                {d.label}
              </text>
            )}
          </g>
        );
      })}

      <line x1={padStart} x2={W - 8} y1={padTop + plotH} y2={padTop + plotH} stroke={GRID} strokeWidth={1} />
    </svg>
  );
}

/** 4px rounded data-end, square where it meets the baseline. */
function roundedTopBar(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.min(r, h, w / 2);
  return [
    `M ${x} ${y + h}`,
    `L ${x} ${y + radius}`,
    `Q ${x} ${y} ${x + radius} ${y}`,
    `L ${x + w - radius} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + radius}`,
    `L ${x + w} ${y + h}`,
    "Z",
  ].join(" ");
}

export function RowBars({
  data,
  emptyLabel,
  max: providedMax,
}: {
  data: { label: string; value: number; href?: string }[];
  emptyLabel: string;
  max?: number;
}) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-xs" style={{ color: "var(--text-faint)" }}>
        {emptyLabel}
      </p>
    );
  }
  const max = providedMax ?? Math.max(...data.map((d) => d.value), 1);

  return (
    <ul className="space-y-2.5">
      {data.map((d, i) => (
        <li key={d.label} className="grid grid-cols-[minmax(6rem,9rem)_1fr_2.2rem] items-center gap-2.5">
          <span className="truncate text-xs" style={{ color: "var(--text-muted)" }} title={d.label}>
            {d.label}
          </span>
          <span
            className="h-2.5 overflow-hidden rounded-full"
            style={{ background: "var(--surface-3)" }}
            role="img"
            aria-label={`${d.label}: ${d.value}`}
          >
            <span
              className="meter-fill block h-full rounded-e-[4px]"
              style={{
                width: `${Math.max(2, (d.value / max) * 100)}%`,
                background: "var(--mark-accent)",
                animationDelay: `${i * 55}ms`,
              }}
            />
          </span>
          <span className="num text-end text-xs font-bold">{d.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** Headline count with a label and an optional link — a stat tile, not a one-bar chart. */
export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
  href,
  definition,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "neutral" | "ok" | "warn" | "danger" | "accent";
  href?: string;
  definition?: string;
}) {
  const color =
    tone === "danger"
      ? "var(--danger)"
      : tone === "warn"
        ? "var(--warn)"
        : tone === "ok"
          ? "var(--ok)"
          : tone === "accent"
            ? "var(--accent-text)"
            : "var(--text)";

  const body = (
    <>
      <p className="text-[0.72rem] font-semibold" style={{ color: "var(--text-muted)" }} title={definition}>
        {label}
      </p>
      <p className="num mt-1 text-[1.7rem] font-bold leading-none" style={{ color }}>
        {value}
      </p>
      {hint && (
        <p className="mt-1.5 text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
          {hint}
        </p>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="card card-pad block transition-shadow hover:shadow-md">
        {body}
      </Link>
    );
  }
  return <div className="card card-pad">{body}</div>;
}
