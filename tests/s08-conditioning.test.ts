// RULES.md section 8: conditioning.
import { describe, expect, it } from 'vitest';
import { buildLog, plusDays } from './helpers/log';

const weeks = (from: string, n: number) => Array.from({ length: n }, (_, i) => plusDays(from, i * 7));

describe('§8 Conditioning', () => {
  it('T45 Phases and targets', () => {
    const log = buildLog();
    expect(log.cplan('2026-11-03')).toMatchObject({ conditioningWeek: 1, phase: 1, targetMinutes: 20, intervals: 0 });

    log.condWeek('2026-11-02').condWeek('2026-11-09');
    expect(log.cplan('2026-11-17')).toMatchObject({ conditioningWeek: 3, phase: 2, targetMinutes: 30, intervals: 0 });
    expect(log.cplan('2026-11-19')).toMatchObject({
      conditioningWeek: 3,
      targetMinutes: 30,
      intervals: 6,
      layout: { easyBeforeSec: 540, intervalBlockSec: 720, easyAfterSec: 540 },
    });

    log.ack('2026-11-19').condWeek('2026-11-16').condWeek('2026-11-23');
    expect(log.cplan('2026-12-01')).toMatchObject({ conditioningWeek: 5, phase: 3, targetMinutes: 40, intervals: 0 });
    expect(log.cplan('2026-12-03')).toMatchObject({
      targetMinutes: 40,
      intervals: 8,
      layout: { easyBeforeSec: 720, intervalBlockSec: 960, easyAfterSec: 720 },
    });
    expect(log.plan('2026-11-30').afterLiftingSpin).toEqual({ minutes: 10, optional: true });
    expect(buildLog().plan('2026-11-04').afterLiftingSpin).toBeNull();
  });

  it('T46 Weeks that don’t count', () => {
    const log = buildLog().ack('2026-11-02');
    for (const monday of weeks('2026-11-02', 7)) log.condWeek(monday); // through 12-14; 12-21 is the floor week
    expect(log.cplan('2026-12-29')).toMatchObject({ conditioningWeek: 8, phase: 3, targetMinutes: 50 });
    log.condWeek('2026-12-28');
    expect(log.cplan('2027-01-05')).toMatchObject({ conditioningWeek: 9, phase: 4, targetMinutes: 50 });
    expect(log.cplan('2027-01-07')).toMatchObject({ intervals: 8, maxIntervals: 10 });
    expect(log.cplan('2027-01-07', { intervals: 10 }).intervals).toBe(10);
  });

  it('T47 Missed and half weeks hold the phase', () => {
    const log = buildLog().condWeek('2026-11-02').condWeek('2026-11-09');
    expect(log.cplan('2026-12-01')).toMatchObject({ conditioningWeek: 3, phase: 2, layoffDrop: 'none' });

    const half = buildLog().condWeek('2026-11-02').cond('2026-11-10');
    expect(half.cplan('2026-11-17').conditioningWeek).toBe(2);
  });

  it('T48 Conditioning layoff', () => {
    const log = buildLog();
    for (const monday of weeks('2026-11-02', 5)) log.condWeek(monday); // last session Thursday 12-03
    expect(log.cplan('2026-12-28')).toMatchObject({ conditioningWeek: 3, phase: 2, layoffDrop: 'phase' });
    expect(log.cplan('2027-02-02')).toMatchObject({ conditioningWeek: 1, phase: 1, layoffDrop: 'restart' });
  });

  it('T49 Screening gate', () => {
    const log = buildLog();
    expect(log.program().screeningAtSetup).toBe(true);
    log.condWeek('2026-11-02').condWeek('2026-11-09');
    expect(log.cplan('2026-11-17').screeningGate).toBe(false); // Tuesday, no intervals
    expect(log.cplan('2026-11-19').screeningGate).toBe(true);
    log.ack('2026-11-19');
    expect(log.cplan('2026-11-19').screeningGate).toBe(false);
    log.condWeek('2026-11-16');
    expect(log.cplan('2026-11-26').screeningGate).toBe(false);
  });

  it('T50 Light-week conditioning', () => {
    const log = buildLog().condWeek('2026-11-02').condWeek('2026-11-09').declare('2026-11-16', 'light');
    expect(log.cplan('2026-11-19')).toMatchObject({ intervals: 0, targetMinutes: 30 });
    log.condWeek('2026-11-16');
    expect(log.cplan('2026-11-24').conditioningWeek).toBe(3);
  });

  it('T51 Flat from intervals', () => {
    const log = buildLog().ack('2026-11-02');
    for (const monday of weeks('2026-11-02', 4)) log.condWeek(monday);
    log.cond('2026-12-01').cond('2026-12-03');
    expect(log.events.at(-1)).toMatchObject({ intervalsDone: 8 });
    expect(log.plan('2026-12-04').askFlatFromIntervals).toBe(true);
    log.lift('2026-12-04', {}, { checkIns: { flatFromIntervals: true } });
    expect(log.plan('2026-12-07').askFlatFromIntervals).toBe(false);
    expect(log.cplan('2026-12-10').intervals).toBe(4);
  });

  it('T52 Weekly bar', () => {
    const log = buildLog()
      .lift('2026-11-09', {}, { spinMinutes: 10 })
      .cond('2026-11-10', { minutes: 40 })
      .lift('2026-11-11', {}, { spinMinutes: 10 })
      .cond('2026-11-12', { minutes: 40 });
    const week = log.week('2026-11-09', '2026-11-13');
    expect(week.conditioningMinutes).toBe(100);
    expect(week.conditioningTargetMinutes).toBe(150);
  });

  it('T88 Short sessions', () => {
    const log = buildLog().condWeek('2026-11-02').condWeek('2026-11-09').ack('2026-11-16');
    log.cond('2026-11-17', { minutes: 20 });
    const thu = log.cplan('2026-11-19', { targetMinutes: 25 });
    expect(thu).toMatchObject({ targetMinutes: 25, intervals: 0, layout: null, minMinutes: 20 });
    log.cond('2026-11-19', { target: 25, minutes: 25 });
    expect(log.cplan('2026-11-24').conditioningWeek).toBe(4);

    log.cond('2026-11-24', { minutes: 15 }).cond('2026-11-26', { minutes: 30 });
    expect(log.cplan('2026-12-01').conditioningWeek).toBe(4);
  });

  it('T87 Short night: conditioning', () => {
    const log = buildLog().condWeek('2026-11-02').condWeek('2026-11-09').ack('2026-11-16');
    expect(log.cplan('2026-11-19').intervals).toBe(6);
    expect(log.cplan('2026-11-19', { shortNight: true })).toMatchObject({ intervals: 0, layout: null });
  });

  it('T89 Equipment down: SkiErg and air bike', () => {
    const log = buildLog().condWeek('2026-11-02').condWeek('2026-11-09').ack('2026-11-16');
    expect(log.cplan('2026-11-19').machines).toEqual({ easy: 'air bike', intervals: 'SkiErg' });
    expect(log.cplan('2026-11-19', { equipmentDown: ['skiErg'] }).machines.intervals).toBe('air bike');
    expect(log.cplan('2026-11-19', { equipmentDown: ['airBike'] }).machines.easy).toBe('treadmill walk');
    log.setting('2026-11-18', 'skiErgToAirBike', true);
    expect(log.cplan('2026-11-19').machines.intervals).toBe('air bike');
  });

  it('a floor week has no conditioning and doesn’t count', () => {
    const log = buildLog();
    for (const monday of weeks('2026-11-02', 7)) log.condWeek(monday);
    expect(log.day('2026-12-22').kind).toBe('off');
    expect(log.day('2026-12-24').kind).toBe('off');
  });

  it('T95 Intervals stay on Thursday', () => {
    const base = () => buildLog().condWeek('2026-11-02').condWeek('2026-11-09').ack('2026-11-16');
    // Tuesday missed: Thursday keeps its 6.
    expect(base().cplan('2026-11-19')).toMatchObject({ conditioningWeek: 3, phase: 2, intervals: 6 });

    // Tuesday done, Thursday swapped to lifting: Friday's conditioning is easy only.
    const swapped = base().cond('2026-11-17').lift('2026-11-19');
    expect(swapped.day('2026-11-20').swapTo).toBe('conditioning');
    expect(swapped.cplan('2026-11-20')).toMatchObject({ conditioningWeek: 3, intervals: 0, layout: null, machines: { intervals: null } });

    // Monday swapped to conditioning, Tuesday done: no session that week has intervals.
    const early = base().cond('2026-11-16').cond('2026-11-17');
    const planned = early.events.flatMap((e) => (e.type === 'conditioningSession' && e.date >= '2026-11-16' ? [e.intervalsPlanned] : []));
    expect(planned).toEqual([0, 0]);
    expect(early.day('2026-11-19')).toMatchObject({ kind: 'off', conditioning: null });
  });

  it('Q5 Short sessions still add to the weekly bar', () => {
    const log = buildLog().cond('2026-11-10', { minutes: 15 }).cond('2026-11-12', { minutes: 25 });
    expect(log.week('2026-11-09', '2026-11-13')).toMatchObject({ conditioningMinutes: 40, conditioningDone: 1 });
  });
});
