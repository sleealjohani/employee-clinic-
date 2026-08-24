import type { Locale } from "./i18n/dict";

const GREGORIAN_LOCALE: Record<Locale, string> = { ar: "ar-SA-u-ca-gregory-nu-latn", en: "en-GB" };

/** Gregorian is what we store and display. Hijri is a secondary label only. */
export function formatDate(d: Date | string | null | undefined, locale: Locale = "ar"): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(GREGORIAN_LOCALE[locale], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Riyadh",
  }).format(date);
}

export function formatDateTime(d: Date | string | null | undefined, locale: Locale = "ar"): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(GREGORIAN_LOCALE[locale], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Riyadh",
  }).format(date);
}

/** Day/month only — for dense chart axes, always Latin digits. */
export function formatShortDate(d: Date, locale: Locale = "ar"): string {
  void locale;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Riyadh",
  }).format(d);
}

export function formatHijri(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Riyadh",
    }).format(date);
  } catch {
    return "—";
  }
}

/** yyyy-mm-dd for <input type="date"> — always in Riyadh time so the day never slips. */
export function toDateInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Riyadh",
  }).format(date);
  return parts;
}

export function ageFrom(dob: Date | string | null | undefined): number | null {
  if (!dob) return null;
  const b = typeof dob === "string" ? new Date(dob) : dob;
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

export function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

export function startOfDay(d = new Date()): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

/** Lab values keep their own precision — 0.4 must not render as 0. */
export function formatValue(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(n);
}

export function percent(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

export function bmi(weightKg?: number | null, heightCm?: number | null): number | null {
  if (!weightKg || !heightCm || heightCm <= 0) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0][0] + parts[1][0];
}
