// The UI's clock. The engine never reads the clock (CLAUDE.md, ground rule
// 3), so today's date and session timestamps start here.

import { localDate } from '../data';
import { isValidDate, type IsoTimestamp, type LocalDate } from '../engine';

/**
 * Development only: `?today=YYYY-MM-DD` pins today's date, so a whole week
 * can be clicked through in a desktop browser (CLAUDE.md, M3). Production
 * builds drop this branch.
 */
export function devTodayOverride(): LocalDate | null {
  if (!import.meta.env.DEV) return null;
  const value = new URLSearchParams(location.search).get('today');
  return value && isValidDate(value) ? value : null;
}

export function currentDate(): LocalDate {
  return devTodayOverride() ?? localDate(new Date());
}

export function nowIso(): IsoTimestamp {
  return new Date().toISOString();
}
