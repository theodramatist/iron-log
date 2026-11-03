// RULES.md section 6: the light squat day and the once-a-week deadlift.
import { describe, expect, it } from 'vitest';
import type { SessionPlan } from '../src/engine';
import { buildLog, made, madeAt, missed } from './helpers/log';

const slot3 = (p: SessionPlan) => p.lifts.find((l) => l.slot === 3)?.lift;

describe('§6 Light squat day and once-a-week deadlift', () => {
  it('T34 Switching on', () => {
    // Suggested jumps 10 (Monday, rir3to4), then 5, then 5.
    const on = buildLog({ setup: { squat: 'rir3to4' } })
      .lift('2026-11-04', { squat: made('rir1to2') })
      .lift('2026-11-06', { squat: made('rir1to2') });
    expect(on.state('squat')?.lightDayOn).toBe(true);

    // 5, then 10, then 5.
    const notYet = buildLog({ setup: { squat: 'rir1to2' } })
      .lift('2026-11-04', { squat: made('rir3to4') })
      .lift('2026-11-06', { squat: made('rir1to2') });
    expect(notYet.state('squat')?.lightDayOn).toBe(false);
  });

  /** Light squat day on from week 1: Monday rir1to2, Wednesday rir1to2. */
  const lightDayOn = () =>
    buildLog({ setup: { squat: 'rir1to2' } })
      .lift('2026-11-04', { squat: made('rir1to2') })
      .lift('2026-11-06', { squat: made('rir1to2') });

  it('T35 Which session is light', () => {
    const log = lightDayOn().lift('2026-11-09', { squat: madeAt(200, 'rir1to2') });
    expect(log.liftPlan('2026-11-11', 'squat')).toMatchObject({ kind: 'lightDay', weight: 160, sets: 2, reps: 5 });
    log.lift('2026-11-11', { squat: made() });
    expect(log.liftPlan('2026-11-13', 'squat').kind).toBe('heavy');
    log.lift('2026-11-13', { squat: made('rir1to2') });

    // Monday 11-16 missed: Wednesday and Friday are both heavy.
    expect(log.liftPlan('2026-11-18', 'squat').kind).toBe('heavy');
    log.lift('2026-11-18', { squat: made('rir1to2') });
    expect(log.liftPlan('2026-11-20', 'squat').kind).toBe('heavy');
  });

  it('T36 Light-day weight', () => {
    const log = lightDayOn().lift('2026-11-09', { squat: madeAt(247.5, 'rir1to2') });
    expect(log.liftPlan('2026-11-11', 'squat')).toMatchObject({ kind: 'lightDay', weight: 197.5 });
  });

  it('a light squat day moves nothing', () => {
    const log = lightDayOn().lift('2026-11-09', { squat: madeAt(200, 'rir1to2') });
    const before = log.state('squat');
    log.lift('2026-11-11', { squat: made() });
    const after = log.state('squat');
    expect(after?.lcw).toBe(before?.lcw);
    expect(after?.next).toEqual(before?.next);
    expect(after?.lastHeavyWeight).toBe(200);
  });

  /** Two made heavy deadlifts with 5-lb suggested jumps in week 1. */
  const oncePerWeek = () => buildLog({ setup: { deadlift: 'grind' } }).lift('2026-11-04', { deadlift: made('grind') });

  it('T37 Once-a-week deadlift', () => {
    const log = oncePerWeek();
    for (const d of ['2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13']) log.lift(d);

    // An A, B, A week.
    const mon = log.plan('2026-11-16');
    expect(mon.workout).toBe('A');
    expect(slot3(mon)).toBe('deadlift');
    log.lift('2026-11-16', { deadlift: made('grind') });
    expect(slot3(log.plan('2026-11-18'))).toBe('row');
    log.lift('2026-11-18');
    const fri = log.plan('2026-11-20');
    expect(fri.workout).toBe('A');
    expect(slot3(fri)).toBe('row');
    log.lift('2026-11-20');

    // A B, A, B week.
    expect(log.plan('2026-11-23').workout).toBe('B');
    log.lift('2026-11-23');
    const wed = log.plan('2026-11-25');
    expect(wed.workout).toBe('A');
    expect(slot3(wed)).toBe('deadlift');
    log.lift('2026-11-25', { deadlift: made('grind') }).lift('2026-11-27');

    // The week's first A (Monday 11-30) is missed: the first A completed has the deadlift.
    const late = log.plan('2026-12-02');
    expect(late.workout).toBe('A');
    expect(slot3(late)).toBe('deadlift');
  });

  it('T94 The once-a-week deadlift waits for week 3', () => {
    const log = buildLog({ setup: { deadlift: 'rir3to4' } })
      .lift('2026-11-04')
      .lift('2026-11-06')
      .lift('2026-11-09', { deadlift: made('grind') })
      .lift('2026-11-11', { deadlift: made('grind') });
    expect(log.state('deadlift', '2026-11-13')?.oncePerWeekOn).toBe(false);
    const fri = log.plan('2026-11-13');
    expect(fri.workout).toBe('B');
    expect(slot3(fri)).toBe('deadlift');
    log.lift('2026-11-13', { deadlift: made('grind') });

    expect(log.state('deadlift', '2026-11-16')?.oncePerWeekOn).toBe(true);
    expect(slot3(log.plan('2026-11-16'))).toBe('deadlift');
    log.lift('2026-11-16', { deadlift: made('grind') }).lift('2026-11-18');
    expect(slot3(log.plan('2026-11-20'))).toBe('row');
  });

  it('Q2 Repeats leave the count alone', () => {
    const log = buildLog({ setup: { squat: 'rir1to2' } }); // Monday's 95 earned a 5-lb jump: one
    log.lift('2026-11-04', { squat: missed() }); // missed at 100
    log.lift('2026-11-06', { squat: made('rir1to2') }); // the repeat at 100, made
    expect(log.state('squat')).toMatchObject({ lcw: 100, next: { weight: 102.5 }, lightDayOn: false });
    log.lift('2026-11-09', { squat: made('rir1to2') }); // a progression step to 102.5: two
    expect(log.state('squat')).toMatchObject({ lcw: 102.5, smallJumpReachedOn: '2026-11-09', lightDayOn: true });
  });
});
