// Waist measurements (SPEC.md sections 4, 5.3, and 5.6, Q28): a tape check
// every two weeks, asked for at the end of a lifting session.
import { describe, expect, it } from 'vitest';
import { buildBackup, parseBackup, serializeBackup } from '../src/data';
import { nextWaistCheck, waistCheckDue, waistHistory } from '../src/ui/waist';
import { PROGRAM, buildLog } from './helpers/log';

describe('Waist checks', () => {
  it('T110 a check every two weeks, starting with the first session', () => {
    const log = buildLog().lift('2026-11-04');
    expect(waistCheckDue(log.events, '2026-11-16')).toBe(true);
    expect(nextWaistCheck(log.events, '2026-11-16')).toBe('2026-11-16');

    log.waist('2026-11-16', 41.5);
    expect(waistCheckDue(log.events, '2026-11-16')).toBe(false);
    expect(nextWaistCheck(log.events, '2026-11-16')).toBe('2026-11-30');
    expect(waistCheckDue(log.events, '2026-11-29')).toBe(false);
    expect(waistCheckDue(log.events, '2026-11-30')).toBe(true);
  });

  it('T110 one measurement a day, the one logged last, oldest day first', () => {
    const log = buildLog().waist('2026-11-30', 41).waist('2026-11-16', 41.5).waist('2026-11-30', 40.75);
    expect(waistHistory(log.events)).toEqual([
      { date: '2026-11-16', inches: 41.5 },
      { date: '2026-11-30', inches: 40.75 },
    ]);
  });

  it('T110 a measurement changes no prescription', () => {
    const plain = buildLog().lift('2026-11-04');
    const measured = buildLog().lift('2026-11-04').waist('2026-11-04', 41.5);
    expect(measured.plan('2026-11-06')).toEqual(plain.plan('2026-11-06'));
    expect(measured.day('2026-11-06', '2026-11-05')).toEqual(plain.day('2026-11-06', '2026-11-05'));
  });

  it('T110 measurements go into backups and come back', () => {
    const log = buildLog().lift('2026-11-04').waist('2026-11-04', 41.5);
    const file = buildBackup(log.events, log.settings, PROGRAM, '2026-11-04T21:00:00.000Z');
    const back = parseBackup(serializeBackup(file));
    expect(back.ok).toBe(true);
    if (back.ok) expect(waistHistory(back.file.events)).toEqual([{ date: '2026-11-04', inches: 41.5 }]);

    const bad = JSON.parse(serializeBackup(file)) as { events: { type: string; inches?: unknown }[] };
    bad.events.find((e) => e.type === 'waist')!.inches = 'forty';
    expect(parseBackup(JSON.stringify(bad))).toMatchObject({ ok: false });
  });
});
