// RULES.md section 1: scheduling.
import { describe, expect, it } from 'vitest';
import { prescribe, type LiftingSessionEvent } from '../src/engine';
import { PROGRAM, buildLog, calibrate, made } from './helpers/log';

const sessions = (events: { type: string }[]) =>
  events.filter((e): e is LiftingSessionEvent => e.type === 'liftingSession');

describe('§1 Scheduling', () => {
  it('T02 Alternation', () => {
    const log = buildLog();
    for (const d of ['2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13']) log.lift(d);
    expect(sessions(log.events).map((s) => [s.date, s.workout])).toEqual([
      ['2026-11-02', 'A'],
      ['2026-11-04', 'B'],
      ['2026-11-06', 'A'],
      ['2026-11-09', 'B'],
      ['2026-11-11', 'A'],
      ['2026-11-13', 'B'],
    ]);
  });

  it('a week summary takes turns A and B on later planned days', () => {
    const lifting = buildLog()
      .week('2026-11-02', '2026-11-03')
      .days.filter((d) => d.kind === 'lifting');
    expect(lifting.map((d) => [d.date, d.workout, d.status, d.projected])).toEqual([
      ['2026-11-02', 'A', 'done', false],
      ['2026-11-04', 'B', 'planned', false],
      ['2026-11-06', 'A', 'planned', true],
    ]);
    expect(lifting[1]!.summary.length).toBeGreaterThan(0);
    expect(lifting[2]!.summary).toEqual([]);
  });

  it('T03 A missed session keeps the alternation', () => {
    const log = buildLog({ setup: { squat: 'rir3to4', press: 'rir1to2', deadlift: 'rir3to4' } }).lift('2026-11-04', {
      squat: made('rir3to4'),
      deadlift: made('rir3to4'),
      bench: calibrate([
        [45, 'fast'],
        [65, 'fast'],
        [85, 'slowing'],
        [95, 'slowed'],
      ]),
    });
    const plan = log.plan('2026-11-09');
    expect(plan.workout).toBe('A');
    expect(plan.daysAway).toBe(5);
    expect(plan.missedBand).toBe('normal');
    const w = Object.fromEntries(plan.lifts.map((l) => [l.lift, l.weight]));
    expect(w).toEqual({ squat: 115, press: 67.5, deadlift: 175 });
  });

  it('T04 Swap today', () => {
    const log = buildLog().lift('2026-11-04', { squat: made('rir3to4') }).lift('2026-11-06', { squat: made('rir3to4') });
    expect(log.day('2026-11-10').kind).toBe('conditioning');
    expect(log.day('2026-11-10').swapTo).toBe('lifting');

    const tue = log.plan('2026-11-10');
    expect(tue.workout).toBe('B');
    expect(tue.daysAway).toBe(4);
    expect(tue.missedBand).toBe('normal');
    expect(tue.needsConsecutiveConfirm).toBe(false);

    log.lift('2026-11-10', { squat: made('rir3to4') });
    // Tuesday's conditioning is dropped: Wednesday stays a lifting day with the
    // two-in-a-row confirmation, and Thursday is the week's only conditioning day.
    const wed = log.day('2026-11-11');
    expect(wed.kind).toBe('lifting');
    expect(wed.needsConsecutiveConfirm).toBe(true);
    expect(log.plan('2026-11-11').needsConsecutiveConfirm).toBe(true);
    expect(log.day('2026-11-12').kind).toBe('conditioning');
    expect(log.day('2026-11-10', '2026-11-12').loggedConditioning).toHaveLength(0);
  });

  it('T05 Weekly caps', () => {
    const log = buildLog()
      .lift('2026-11-04')
      .lift('2026-11-06')
      .lift('2026-11-09')
      .lift('2026-11-10')
      .lift('2026-11-11');
    // Three lifting sessions done in the week of 11-09: none more, even by swap.
    for (const d of ['2026-11-12', '2026-11-13']) {
      const day = log.day(d);
      expect(day.kind).not.toBe('lifting');
      expect(day.swapTo).not.toBe('lifting');
    }

    // Two conditioning sessions done: no more conditioning that week.
    log.cond('2026-11-17').cond('2026-11-19');
    const fri = log.day('2026-11-20');
    expect(fri.kind).toBe('lifting');
    expect(fri.swapTo).toBeNull();

    log.cond('2026-11-23').cond('2026-11-24');
    const thu = log.day('2026-11-26');
    expect(thu.kind).not.toBe('conditioning');
    expect(thu.swapTo).not.toBe('conditioning');

    for (const d of ['2026-11-14', '2026-11-15', '2026-11-21', '2026-11-22']) {
      const day = log.day(d);
      expect(day.kind).toBe('off');
      expect(day.message).toBe('Off.');
      expect(day.swapTo).toBeNull();
    }
  });

  it('T90 Calendar notes', () => {
    const log = buildLog();
    const note = (monday: string, date: string) =>
      log.week(monday).days.find((d) => d.date === date)?.calendarNote ?? '';
    expect(note('2026-11-23', '2026-11-26')).toMatch(/^Thanksgiving/);
    expect(note('2026-12-28', '2027-01-01')).toMatch(/^New Year's Day/);
    expect(note('2027-02-08', '2027-02-10')).toMatch(/^Ash Wednesday/);

    const withNotes = log.input('2026-11-03');
    const without = { ...withNotes, program: { ...PROGRAM, calendarNotes: [] } };
    for (const date of ['2026-11-26', '2027-01-01', '2027-02-10']) {
      expect(prescribe(without, date)).toEqual(prescribe(withNotes, date));
    }
  });

  it('T97 No time on Wednesday', () => {
    const log = buildLog().cond('2026-11-03');
    const wednesday = log.day('2026-11-04', '2026-11-04');
    expect(wednesday).toMatchObject({ kind: 'lifting', status: 'planned', workout: 'B' });
    log.skip('2026-11-04', 'lifting');
    expect(log.day('2026-11-04', '2026-11-04')).toMatchObject({ kind: 'lifting', status: 'skipped', workout: null, swapTo: null });
    const thursday = log.day('2026-11-05', '2026-11-04');
    expect(thursday).toMatchObject({ kind: 'lifting', status: 'planned', workout: 'B' });
    expect(thursday.summary).toEqual(wednesday.summary);
    expect(log.week('2026-11-02', '2026-11-04').days.map((d) => [d.date, d.kind, d.status, d.workout])).toEqual([
      ['2026-11-02', 'lifting', 'done', 'A'],
      ['2026-11-03', 'conditioning', 'done', null],
      ['2026-11-04', 'lifting', 'skipped', null],
      ['2026-11-05', 'lifting', 'planned', 'B'],
      ['2026-11-06', 'conditioning', 'planned', null],
      ['2026-11-07', 'lifting', 'planned', 'A'],
      ['2026-11-08', 'off', 'off', null],
    ]);
  });

  it('T98 No time on Friday', () => {
    const log = buildLog().cond('2026-11-03').lift('2026-11-04').cond('2026-11-05').skip('2026-11-06', 'lifting');
    expect(log.day('2026-11-07', '2026-11-06')).toMatchObject({ kind: 'lifting', status: 'planned', workout: 'A' });
    expect(log.day('2026-11-08', '2026-11-06').kind).toBe('off');
    log.lift('2026-11-07');
    expect(log.day('2026-11-09', '2026-11-09')).toMatchObject({ kind: 'lifting', workout: 'B', needsConsecutiveConfirm: false });
  });

  it('T99 No time for conditioning', () => {
    const log = buildLog().skip('2026-11-03', 'conditioning');
    expect(log.day('2026-11-03', '2026-11-03')).toMatchObject({ kind: 'conditioning', status: 'skipped', conditioning: null });
    expect(log.day('2026-11-04', '2026-11-03')).toMatchObject({ kind: 'lifting', status: 'planned', workout: 'B' });
    expect(log.day('2026-11-05', '2026-11-03')).toMatchObject({ kind: 'conditioning', status: 'planned' });
    expect(log.day('2026-11-07', '2026-11-03').kind).toBe('off');
  });

  it('T100 Sunday stays off', () => {
    const log = buildLog().cond('2026-11-03').skip('2026-11-04', 'lifting');
    expect(log.day('2026-11-05', '2026-11-05').kind).toBe('lifting');
    log.skip('2026-11-05', 'lifting');
    expect(
      log
        .week('2026-11-02', '2026-11-05')
        .days.slice(3)
        .map((d) => [d.date, d.kind, d.status]),
    ).toEqual([
      ['2026-11-05', 'lifting', 'skipped'],
      ['2026-11-06', 'lifting', 'planned'],
      ['2026-11-07', 'conditioning', 'planned'],
      ['2026-11-08', 'off', 'off'],
    ]);
  });

  it('T101 Time after all', () => {
    const log = buildLog().cond('2026-11-03').skip('2026-11-04', 'lifting').lift('2026-11-04');
    expect(log.day('2026-11-04', '2026-11-04')).toMatchObject({ kind: 'lifting', status: 'done', workout: 'B' });
    expect(log.day('2026-11-05', '2026-11-04').kind).toBe('conditioning');
    expect(log.day('2026-11-07', '2026-11-04').kind).toBe('off');
  });
});
