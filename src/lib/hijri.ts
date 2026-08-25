/**
 * Hijri → Gregorian, from the same Umm al-Qura data the app uses to display
 * Hijri dates in `formatHijri`. Personnel files in Saudi hospitals carry both
 * calendars — often in the same column — and a Hijri year read as a Gregorian
 * one puts a birth date in the 15th century, so this conversion has to be
 * exact rather than approximate.
 */

const UMALQURA = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  timeZone: "UTC",
});

/** Hijri year/month/day for a Gregorian instant. */
export function hijriPartsOf(date: Date): { year: number; month: number; day: number } {
  const parts = Object.fromEntries(
    UMALQURA.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    // The era is formatted alongside the year ("1411 AH"); keep the digits.
    year: Number(String(parts.year ?? "").replace(/\D/g, "")),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

/** Plausible Hijri years for a personnel record: roughly 1880–2080 Gregorian. */
export const HIJRI_MIN_YEAR = 1290;
export const HIJRI_MAX_YEAR = 1510;

export function looksHijriYear(year: number): boolean {
  return year >= HIJRI_MIN_YEAR && year <= HIJRI_MAX_YEAR;
}

/**
 * Convert a Hijri date to the Gregorian day it falls on, or null when the date
 * does not exist (a 30th of a 29-day month, say).
 *
 * The arithmetic civil-calendar formula lands within a few days of Umm al-Qura;
 * the surrounding days are then checked against ICU so the answer is the real
 * Umm al-Qura date, not the approximation.
 */
export function hijriToGregorian(year: number, month: number, day: number): Date | null {
  if (!looksHijriYear(year) || month < 1 || month > 12 || day < 1 || day > 30) return null;

  const julianDay =
    Math.floor((11 * year + 3) / 30) +
    354 * year +
    30 * month -
    Math.floor((month - 1) / 2) +
    day +
    1948440 -
    385;
  const approx = (julianDay - 2440588) * 86_400_000;

  for (let delta = 0; delta <= 4; delta++) {
    for (const sign of delta === 0 ? [0] : [-1, 1]) {
      const candidate = new Date(approx + sign * delta * 86_400_000);
      const parts = hijriPartsOf(candidate);
      if (parts.year === year && parts.month === month && parts.day === day) return candidate;
    }
  }
  return null;
}
