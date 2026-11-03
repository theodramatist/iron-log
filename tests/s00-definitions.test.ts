// RULES.md section 0: definitions, dates, and replay.
import { describe, expect, it } from 'vitest';
import { daysBetween, programWeek, weekdayIndex, weekStart } from '../src/engine';
import { START, buildLog, made } from './helpers/log';

describe('§0 Definitions', () => {
  it('program week counts from 2026-11-02', () => {
    expect(programWeek('2026-11-02', START)).toBe(1);
    expect(programWeek('2026-11-08', START)).toBe(1);
    expect(programWeek('2026-11-09', START)).toBe(2);
    expect(programWeek('2026-11-16', START)).toBe(3);
    expect(weekdayIndex('2026-11-02')).toBe(0); // a Monday
    expect(weekStart('2026-11-05')).toBe('2026-11-02');
  });

  it('T79 Editing history replays', () => {
    const log = buildLog({ setup: { squat: 'rir3to4' } }).lift('2026-11-04', { squat: made('rir3to4') });
    expect(log.lastPlan?.lifts.find((l) => l.lift === 'squat')?.weight).toBe(105);
    expect(log.liftPlan('2026-11-06', 'squat').weight).toBe(115);

    log.edit(log.sessionOn('2026-11-04'), (e) => {
      const squat = e.lifts.find((l) => l.lift === 'squat');
      if (squat) squat.effort = 'rir1to2';
    });
    expect(log.liftPlan('2026-11-06', 'squat').weight).toBe(110);
  });

  it('T80 Deleting a session replays', () => {
    const log = buildLog({ setup: { squat: 'rir3to4' } }).lift('2026-11-04', { squat: made('rir3to4') });
    expect(log.plan('2026-11-06').workout).toBe('A');

    log.remove(log.sessionOn('2026-11-04'));
    const plan = log.plan('2026-11-06');
    expect(plan.workout).toBe('B');
    expect(plan.lifts.find((l) => l.lift === 'squat')?.weight).toBe(105);
  });

  it('replays in date order whatever order events were added (past-date entries)', () => {
    const log = buildLog({ setup: { squat: 'rir3to4' } })
      .lift('2026-11-06', { squat: made('rir3to4', 115) })
      .lift('2026-11-04', { squat: made('rir3to4', 105) });
    expect(log.state('squat')?.lcw).toBe(115);
    expect(log.state('squat')?.next?.weight).toBe(125);
  });

  it('T82 Daylight saving', () => {
    expect(programWeek('2027-03-15', START)).toBe(20);
    expect(daysBetween('2027-03-12', '2027-03-15')).toBe(3);
    const log = buildLog().lift('2027-03-12', { squat: made('rir1to2', 200) });
    expect(log.plan('2027-03-15').daysAway).toBe(3);
    expect(log.plan('2027-03-15').programWeek).toBe(20);
  });
});
