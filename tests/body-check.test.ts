// Waist measurements and weigh-ins (SPEC.md sections 4, 5.3, and 5.6, Q28 and
// Q29): every two weeks, asked for together at the end of a lifting session.
import { describe, expect, it } from 'vitest';
import { buildBackup, parseBackup, serializeBackup } from '../src/data';
import { nextWaistCheck, nextWeighIn, parsePounds, waistCheckDue, waistHistory, weighInDue } from '../src/ui/bodyCheck';
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

  it('T111 weigh-ins come with the waist check', () => {
    const log = buildLog().bodyweight('2026-11-04', 268.8).bodyweight('2026-11-14', 269.4);
    expect(weighInDue(log.input('2026-11-16'))).toBe(false);
    expect(waistCheckDue(log.events, '2026-11-16')).toBe(true);
    log.bodyweight('2026-11-16', 268).waist('2026-11-16', 41.5);
    expect(nextWeighIn(log.input('2026-11-16'))).toBe('2026-11-30');
    expect(nextWaistCheck(log.events, '2026-11-16')).toBe('2026-11-30');

    // A weigh-in can come due by itself.
    const alone = buildLog().bodyweight('2026-11-04', 268.8).waist('2026-11-16', 41.5);
    expect(weighInDue(alone.input('2026-11-17'))).toBe(false);
    expect(weighInDue(alone.input('2026-11-18'))).toBe(true);
    expect(waistCheckDue(alone.events, '2026-11-18')).toBe(false);
  });

  it('T111 a weight has to look like one', () => {
    expect(parsePounds('268.4')).toBe(268.4);
    expect(parsePounds('268,45')).toBe(268.5);
    expect(parsePounds('26.8')).toBeNull();
    expect(parsePounds('')).toBeNull();
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
