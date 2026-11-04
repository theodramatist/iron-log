// RULES.md section 13: nutrition prompts.
import { describe, expect, it } from 'vitest';
import { buildLog, plusDays, PROGRAM } from './helpers/log';

const N = PROGRAM.nutritionPrompts;
const weeks = (from: string, n: number) => Array.from({ length: n }, (_, i) => plusDays(from, i * 7));

describe('§13 Nutrition prompts', () => {
  it('T72 Day prompts', () => {
    const log = buildLog();
    expect(log.day('2026-11-04').foodLines).toEqual([N.liftingDay]);
    expect(log.day('2026-11-03').foodLines).toEqual([]);
    log.cond('2026-11-03');
    expect(log.day('2026-11-03').foodLines).toEqual(['Add a second Shake today.']);

    const later = buildLog();
    for (const monday of weeks('2026-11-02', 4)) later.condWeek(monday);
    expect(later.cplan('2026-12-01').phase).toBe(3);
    expect(later.day('2026-12-01').foodLines).toEqual([]);
    later.cond('2026-12-01');
    expect(later.day('2026-12-01').foodLines).toEqual(['Add a second Breakfast today.']);
  });

  it('T73 Food lever on', () => {
    const log = buildLog().foodLever('2026-11-03', 'squat', true).cond('2026-11-03');
    expect(log.day('2026-11-04').foodLines).toEqual([N.liftingDay, N.foodLeverOnLiftingDay]);
    expect(log.day('2026-11-03').foodLines).toEqual(['Add a second Shake today.']);
  });

  it('T74 Maintenance-break banner', () => {
    const log = buildLog();
    const banner = (d: string) => log.day(d).banners.find((b) => b.kind === 'maintenanceBreak');
    expect(banner('2027-03-01')?.message).toBe(N.maintenanceBreaks.banner);
    expect(banner('2027-03-14')).toBeDefined();
    expect(banner('2027-03-15')).toBeUndefined();
    expect(banner('2027-02-28')).toBeUndefined();
  });

  it('T75 No compensation', () => {
    const log = buildLog();
    for (const monday of weeks('2026-11-02', 3)) log.condWeek(monday);
    const texts: string[] = [];
    let liftingOffers = 0;
    for (let i = 0; i < 28; i++) {
      const d = plusDays('2026-11-02', i);
      const day = log.day(d, '2026-11-02');
      texts.push(...day.foodLines, ...day.notes, ...day.banners.map((b) => b.message), day.message ?? '');
      if (day.kind === 'lifting') liftingOffers++;
    }
    for (const s of log.suggestions()) texts.push(s.message);
    const joined = texts.join('\n');
    expect(joined).not.toMatch(/burn|earn|make up|pay for|compensat|extra session/i);
    expect(joined).not.toContain(N.noCompensation);
    expect(liftingOffers).toBeLessThanOrEqual(12);
  });
});
