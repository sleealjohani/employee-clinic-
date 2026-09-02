import type { Comparison } from "@prisma/client";
export function latinDigits(value: string) {
  return value
    .replace(/[٠-٩۰-۹]/g, (c) =>
      String(c.charCodeAt(0) - (c <= "٩" ? 0x660 : 0x6f0)),
    )
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");
}
export function parseLabNumber(raw: string): {
  value: number | null;
  comparator: Comparison;
  raw: string;
} {
  let text = latinDigits(raw).trim();
  if (/^[<>≤≥=\s+-]*\d{1,3}(,\d{3})+(\.\d+)?$/.test(text))
    text = text.replace(/,/g, "");
  const match =
    /^(<=|>=|<|>|≤|≥|=)?\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)$/i.exec(
      text,
    );
  if (!match) return { value: null, comparator: "EQ", raw: raw.trim() };
  const value = Number(match[2]);
  const comparator: Comparison =
    match[1] === "<"
      ? "LT"
      : match[1] === "<=" || match[1] === "≤"
        ? "LE"
        : match[1] === ">"
          ? "GT"
          : match[1] === ">=" || match[1] === "≥"
            ? "GE"
            : "EQ";
  return {
    value: Number.isFinite(value) ? value : null,
    comparator,
    raw: raw.trim(),
  };
}
export function sameUnit(
  actual: string | null | undefined,
  expected: string | null | undefined,
) {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[µμ]/g, "u")
      .replace(/\s/g, "")
      .replace(/lit(er|re)s?/g, "l");
  return Boolean(actual && expected && norm(actual) === norm(expected));
}
