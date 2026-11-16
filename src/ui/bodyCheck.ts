// Waist measurements and weigh-ins (SPEC.md sections 4, 5.3, and 5.6, Q28 and
// Q29): every two weeks, asked for together at the end of a lifting session,
// so fat loss shows on the tape as well as the scale. No rule reads the waist.
// The weigh-in also keeps the chin and dip effective load current.

import { addDays, bodyweightHistory, READINGS, type AnyEvent, type EngineInput, type LocalDate, type WaistEvent } from '../engine';

export interface WaistPoint {
  date: LocalDate;
  inches: number;
}

/** Where to put the tape, said the same way everywhere. */
export const WAIST_HOW =
  'Halfway between the bottom of your ribs and the top of your hip bones, after a normal breath out. Snug, not tight.';

/** One measurement a day, the one logged last, oldest day first. */
export function waistHistory(events: readonly AnyEvent[]): WaistPoint[] {
  const byDate = new Map<LocalDate, WaistEvent>();
  for (const e of events) {
    if (e.type !== 'waist') continue;
    const kept = byDate.get(e.date);
    if (!kept || e.createdAt >= kept.createdAt) byDate.set(e.date, e);
  }
  return [...byDate.values()]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((e) => ({ date: e.date, inches: e.inches }));
}

/** The day a check is next due: today with none yet, then `every` days after the last one on or before today. */
export function nextCheck(dates: readonly LocalDate[], today: LocalDate, every: number): LocalDate {
  let last: LocalDate | null = null;
  for (const d of dates) if (d <= today && (last === null || d > last)) last = d;
  return last === null ? today : addDays(last, every);
}

export function nextWaistCheck(events: readonly AnyEvent[], today: LocalDate): LocalDate {
  return nextCheck(
    waistHistory(events).map((p) => p.date),
    today,
    READINGS.WAIST_CHECK_EVERY_DAYS,
  );
}

export function waistCheckDue(events: readonly AnyEvent[], today: LocalDate): boolean {
  return nextWaistCheck(events, today) <= today;
}

/** Setup's weight counts as the first weigh-in. */
export function nextWeighIn(input: EngineInput): LocalDate {
  return nextCheck(
    bodyweightHistory(input).map((b) => b.date),
    input.today,
    READINGS.WEIGH_IN_EVERY_DAYS,
  );
}

export function weighInDue(input: EngineInput): boolean {
  return nextWeighIn(input) <= input.today;
}

function parseNumber(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(n) ? n : null;
}

/** A tape reading in inches, or null if it isn't one. */
export function parseInches(text: string): number | null {
  const n = parseNumber(text);
  return n !== null && n >= 20 && n <= 90 ? Math.round(n * 100) / 100 : null;
}

/** A bodyweight in pounds, to a tenth, or null if it isn't one. */
export function parsePounds(text: string): number | null {
  const n = parseNumber(text);
  return n !== null && n > 50 && n < 700 ? Math.round(n * 10) / 10 : null;
}
