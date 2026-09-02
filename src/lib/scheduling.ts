import type { ClinicConfig } from "./clinic-config";
import { clinicDateTime, clinicDay, validDay } from "./clinic-config";

export const ACTIVE_APPOINTMENT_STATUSES = [
  "REQUESTED",
  "CONFIRMED",
  "CHECKED_IN",
] as const;
type Interval = { startsAt: Date; endsAt: Date };
export function overlaps(a: Interval, b: Interval) {
  return a.startsAt < b.endsAt && a.endsAt > b.startsAt;
}
export function availableSlots(
  day: string,
  duration: number,
  config: ClinicConfig,
  appointments: Interval[],
  blocks: Interval[],
  now = new Date(),
): { start: string; end: string; available: boolean }[] {
  if (!validDay(day) || duration < 10 || duration > 180) return [];
  const start = clinicDateTime(day, config.opensAt);
  const end = clinicDateTime(day, config.closesAt);
  const horizon = clinicDateTime(clinicDay(now));
  horizon.setUTCDate(horizon.getUTCDate() + config.bookingDays + 1);
  if (
    !config.workingDays.includes(new Date(day + "T12:00:00Z").getUTCDay()) ||
    start >= horizon ||
    day < clinicDay(now)
  )
    return [];
  const results = [];
  for (
    let ms = start.getTime();
    ms + duration * 60000 <= end.getTime();
    ms += config.slotMinutes * 60000
  ) {
    const slot = {
      startsAt: new Date(ms),
      endsAt: new Date(ms + duration * 60000),
    };
    // Capacity is simultaneous occupancy, not the number of distinct bookings that touch a long slot.
    const events = appointments
      .filter((a) => overlaps(a, slot))
      .flatMap((a) => [
        { at: Math.max(a.startsAt.getTime(), ms), change: 1 },
        { at: Math.min(a.endsAt.getTime(), slot.endsAt.getTime()), change: -1 },
      ])
      .sort((a, b) => a.at - b.at || a.change - b.change);
    let occupancy = 0,
      peak = 0;
    for (const event of events) {
      occupancy += event.change;
      peak = Math.max(peak, occupancy);
    }
    results.push({
      start: slot.startsAt.toISOString(),
      end: slot.endsAt.toISOString(),
      available:
        ms >= now.getTime() + config.minimumNoticeHours * 3600000 &&
        peak < config.capacity &&
        !blocks.some((b) => overlaps(b, slot)),
    });
  }
  return results;
}
