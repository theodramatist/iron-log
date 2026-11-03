// RULES.md section 10: deloads, illness, and floor weeks.
import { describe, expect, it } from 'vitest';
import type { SessionPlan } from '../src/engine';
import { PROGRAM, buildLog, made, madeAt, missed, missedAt, type Log } from './helpers/log';

const lightWeekSuggested = (log: Log) => log.suggestions().some((s) => s.kind === 'lightWeek');
const byLift = (p: SessionPlan) => Object.fromEntries(p.lifts.map((l) => [l.lift, [l.sets, l.reps, l.weight]]));

describe('§10 Deloads, illness, and floor weeks', () => {
  it('T56 Light-week loads', () => {
    const log = buildLog()
      .lift(
        '2027-01-04',
        {
          squat: madeAt(250, 'rir1to2'),
          press: madeAt(100, 'rir1to2'),
          bench: madeAt(180, 'rir1to2'),
          deadlift: madeAt(330, 'rir1to2'),
          row: madeAt(155, 'crisp'),
          powerClean: madeAt(135, 'crisp'),
        },
        { workout: 'A' },
      )
      .override('2027-01-05', 'chin', 'assistance', 120)
      .declare('2027-01-11', 'light');

    const b = log.plan('2027-01-11');
    expect(b.workout).toBe('B');
    expect(b.weekType).toBe('light');
    expect(byLift(b)).toEqual({ squat: [2, 5, 225], bench: [2, 5, 160], row: [2, 5, 137.5] });
    expect(b.assist?.rounds).toBe(2);
    expect(b.assist?.chin).toMatchObject({ assistance: 130, kind: 'lightWeek' });

    log.lift('2027-01-11');
    const a = log.plan('2027-01-13');
    expect(byLift(a)).toEqual({ squat: [2, 5, 225], press: [2, 5, 90], deadlift: [1, 5, 295] });

    log.lift('2027-01-13').setting('2027-01-14', 'pullChoice', 'powerClean');
    expect(byLift(log.plan('2027-01-15')).powerClean).toEqual([3, 3, 120]);
  });

  it('T57 After a light week', () => {
    const log = buildLog()
      .lift('2027-01-04', { squat: madeAt(240, 'rir3to4') })
      .lift('2027-01-08', { squat: madeAt(250, 'rir1to2'), press: madeAt(100, 'rir3to4') })
      .lift('2027-01-11')
      .lift('2027-01-15', { press: missedAt(105) })
      .lift('2027-01-18')
      .lift('2027-01-22', { press: missedAt(105) })
      .lift('2027-01-25')
      .lift('2027-01-29', { press: made() });
    expect(log.state('squat')).toMatchObject({ stage: 'NORMAL', lcw: 250, next: { weight: 255 } });
    expect(log.state('press')).toMatchObject({ stage: 'BRIDGE_NORMAL', next: { weight: 105, sets: 3, reps: 5 } });

    log.declare('2027-02-01', 'light').lift('2027-02-01', { squat: made() }).lift('2027-02-05', { squat: made(), press: made() });
    expect(log.liftPlan('2027-02-08', 'squat')).toMatchObject({ kind: 'heavy', weight: 250, sets: 3, reps: 5 });
    log.lift('2027-02-08');
    expect(log.liftPlan('2027-02-12', 'press')).toMatchObject({ kind: 'heavy', weight: 105, sets: 3, reps: 5 });
  });

  it('T58 Triggers', () => {
    const nights = buildLog().lift('2026-11-04', {}, { checkIns: { mostNightsUnder7: true } });
    expect(lightWeekSuggested(nights)).toBe(false);
    nights.lift('2026-11-06', {}, { checkIns: { mostNightsUnder7: true } });
    expect(lightWeekSuggested(nights)).toBe(true);

    const warm = buildLog()
      .lift('2026-11-04', {}, { checkIns: { warmupsHeavy: true } })
      .lift('2026-11-06', {}, { checkIns: { warmupsHeavy: true } });
    expect(lightWeekSuggested(warm)).toBe(true);

    const broken = buildLog()
      .lift('2026-11-04', {}, { checkIns: { warmupsHeavy: true } })
      .lift('2026-11-06', {}, { checkIns: { warmupsHeavy: false } })
      .lift('2026-11-09', {}, { checkIns: { warmupsHeavy: true } });
    expect(lightWeekSuggested(broken)).toBe(false);

    const overload = buildLog().declare('2026-11-04', 'overload');
    expect(lightWeekSuggested(overload)).toBe(true);
    overload.dismiss('2026-11-04', 'lightWeek');
    expect(lightWeekSuggested(overload)).toBe(false);

    const pain = buildLog()
      .lift('2026-11-04', {}, { checkIns: { jointPain: ['squat'] } })
      .lift('2026-11-06', {}, { checkIns: { jointPain: ['press'] } });
    expect(lightWeekSuggested(pain)).toBe(false);
  });

  it('T59 Starting a light week', () => {
    const rest = buildLog().lift('2026-11-04').lift('2026-11-06').lift('2026-11-09').declare('2026-11-11', 'light', 'restOfWeek');
    expect(rest.plan('2026-11-11').weekType).toBe('light');
    rest.lift('2026-11-11');
    expect(rest.plan('2026-11-13').weekType).toBe('light');
    expect(rest.week('2026-11-09').weekType).toBe('light');

    const next = buildLog().lift('2026-11-04').lift('2026-11-06').lift('2026-11-09').declare('2026-11-11', 'light', 'nextWeek');
    expect(next.plan('2026-11-11').weekType).toBe('normal');
    expect(next.week('2026-11-16').weekType).toBe('light');
    expect(next.day('2026-11-16').weekType).toBe('light');
    expect(next.day('2026-11-22').weekType).toBe('light');
    expect(next.day('2026-11-23').weekType).toBe('normal');
  });

  it('T60 Christmas floor week', () => {
    const log = buildLog()
      .lift('2026-12-16', {
        squat: madeAt(200, 'rir1to2'),
        bench: madeAt(150, 'rir1to2'),
        row: madeAt(120, 'crisp'),
      })
      .lift('2026-12-18', {
        squat: madeAt(205, 'rir1to2'),
        press: madeAt(100, 'rir1to2'),
        deadlift: madeAt(250, 'rir1to2'),
      });

    const mon = log.plan('2026-12-21');
    expect(mon).toMatchObject({ weekType: 'floor', workout: 'B', assist: null });
    expect(byLift(mon)).toEqual({ squat: [2, 5, 205], bench: [2, 5, 150], row: [2, 5, 120] });
    log.lift('2026-12-21', { squat: made(), bench: made(), row: made() });

    expect(log.day('2026-12-22').kind).toBe('off');
    const wed = log.plan('2026-12-23');
    expect(wed.workout).toBe('A');
    expect(byLift(wed)).toEqual({ squat: [2, 5, 205], press: [2, 5, 100], deadlift: [1, 5, 250] });
    log.lift('2026-12-23', { squat: made(), press: made(), deadlift: made() });

    expect(log.day('2026-12-24').kind).toBe('off');
    expect(log.day('2026-12-25').kind).toBe('off');
    expect(log.day('2026-12-25').swapTo).toBeNull();

    const banner = (d: string) => log.day(d).banners.some((b) => b.kind === 'maintenanceBreak');
    for (const d of ['2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24', '2026-12-25']) expect(banner(d)).toBe(false);
    for (const d of ['2026-12-28', '2026-12-31', '2027-01-03']) expect(banner(d)).toBe(true);
    expect(banner('2027-01-04')).toBe(false);

    const back = log.plan('2026-12-28');
    expect(back.daysAway).toBe(5);
    expect(back.lifts.find((l) => l.lift === 'squat')).toMatchObject({ kind: 'heavy', weight: 205, sets: 3 });
  });

  it('T61 Holy Week', () => {
    const log = buildLog();
    expect(log.day('2027-03-22').weekType).toBe('floor');
    expect(log.day('2027-03-26').weekType).toBe('floor');
    log.floorWeek('2027-03-01', 'removed', '2027-03-22');
    expect(log.day('2027-03-22').weekType).toBe('normal');
  });

  it('T62 Declaring a floor week midweek', () => {
    const log = buildLog().lift('2026-11-04').lift('2026-11-06').lift('2026-11-09').declare('2026-11-11', 'floor');
    const wed = log.plan('2026-11-11');
    expect(wed.weekType).toBe('floor');
    expect(wed.assist).toBeNull();
    expect(wed.lifts.every((l) => l.kind === 'floor')).toBe(true);
    log.lift('2026-11-11');
    expect(log.day('2026-11-13').kind).not.toBe('lifting');
  });

  it('T85 Illness with a fever', () => {
    const log = buildLog()
      .condWeek('2026-12-28')
      .condWeek('2027-01-04')
      .ack('2027-01-04')
      .lift('2027-01-08', { squat: madeAt(200, 'rir1to2'), press: madeAt(100, 'rir1to2'), deadlift: madeAt(250, 'rir1to2') })
      .lift('2027-01-11', { squat: made('rir1to2') })
      .illness('2027-01-12', true);
    for (const d of ['2027-01-12', '2027-01-13', '2027-01-15']) {
      const day = log.day(d);
      expect(day.kind).toBe('sick');
      expect(day.message).toBe(PROGRAM.illness.sickModeMessage);
      expect(day.swapTo).toBeNull();
    }

    log.better('2027-01-18');
    const back = log.plan('2027-01-18');
    expect(back.daysAway).toBe(7);
    expect(back.weekType).toBe('light');
    const squatLcw = log.state('squat', '2027-01-18')?.lcw ?? 0;
    // 90% of 205 is 184.5, rounded down to 182.5.
    expect(back.lifts.find((l) => l.lift === 'squat')).toMatchObject({ sets: 2, reps: 5, weight: 182.5 });
    expect(squatLcw).toBe(205);
    expect(log.cplan('2027-01-21').intervals).toBe(0);
    expect(log.cplan('2027-01-21').conditioningWeek).toBe(3);

    log.lift('2027-01-18').lift('2027-01-20').lift('2027-01-22');
    expect(log.liftPlan('2027-01-25', 'squat')).toMatchObject({ kind: 'heavy', weight: 205 });
  });

  it('T86 Mild illness', () => {
    const log = buildLog().condWeek('2026-11-02').condWeek('2026-11-09').ack('2026-11-16').illness('2026-11-18', false);
    expect(log.plan('2026-11-18').weekType).toBe('light');
    expect(log.cplan('2026-11-19').intervals).toBe(0);
    expect(log.plan('2026-11-20').weekType).toBe('light');
    expect(log.day('2026-11-18').kind).toBe('lifting');
  });

  it('T93 A floor week inside a maintenance break', () => {
    const day = buildLog().day('2026-12-21');
    expect(day.weekType).toBe('floor');
    expect(day.banners.some((b) => b.kind === 'maintenanceBreak')).toBe(false);
    expect(day.notes).toContain(PROGRAM.deload.floorWeek.insideMaintenanceBreakNote);
  });

  it('light and floor weeks freeze progression', () => {
    const log = buildLog().declare('2026-11-04', 'light').lift('2026-11-04', { squat: missed() });
    expect(log.state('squat')).toMatchObject({ stage: 'NORMAL', hasMissed: false, lcw: 95 });
  });

  it('Q7 A floor week is its whole calendar week', () => {
    const log = buildLog();
    for (const date of ['2026-12-26', '2026-12-27']) {
      const day = log.day(date, '2026-12-20');
      expect(day.weekType).toBe('floor');
      expect(day.banners.map((b) => b.kind)).not.toContain('maintenanceBreak');
      expect(day.notes).toContain(PROGRAM.deload.floorWeek.insideMaintenanceBreakNote);
    }
    expect(log.day('2026-12-28', '2026-12-20').banners.map((b) => b.kind)).toContain('maintenanceBreak');
  });
});
