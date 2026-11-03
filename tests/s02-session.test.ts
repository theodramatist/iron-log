// RULES.md section 2: what goes in a lifting session.
import { describe, expect, it } from 'vitest';
import type { SessionPlan } from '../src/engine';
import { buildLog, cd } from './helpers/log';

const slot = (plan: SessionPlan, n: number) => plan.lifts.find((l) => l.slot === n);

describe('§2 What goes in a lifting session', () => {
  it('runs the slots in order with the chin-and-dip block and the bike warm-up', () => {
    const plan = buildLog().plan('2026-11-04');
    expect(plan.workout).toBe('B');
    expect(plan.lifts.map((l) => l.lift)).toEqual(['squat', 'bench', 'deadlift']);
    expect(plan.assist?.rounds).toBe(3);
    expect(plan.assist?.restSec).toBe(75);
    expect(plan.beforeLifting).toBe("5 easy minutes on the air bike as a warm-up. It doesn't count as conditioning.");
  });

  it('T06 Workout B’s third slot', () => {
    const log = buildLog();
    const p1 = log.plan('2026-11-04');
    expect(p1.workout).toBe('B');
    expect(slot(p1, 3)?.lift).toBe('deadlift');

    log.lift('2026-11-04').lift('2026-11-06').lift('2026-11-09').lift('2026-11-11');
    const p2 = log.plan('2026-11-13');
    expect(p2.workout).toBe('B');
    expect(slot(p2, 3)?.lift).toBe('deadlift');

    log.lift('2026-11-13').lift('2026-11-16');
    const p3 = log.plan('2026-11-18');
    expect(p3.workout).toBe('B');
    expect(slot(p3, 3)).toMatchObject({ lift: 'row', kind: 'calibration' });

    const clean = buildLog({ setup: { pullChoice: 'powerClean' } });
    for (const d of ['2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13', '2026-11-16']) clean.lift(d);
    expect(slot(clean.plan('2026-11-18'), 3)).toMatchObject({ lift: 'powerClean', kind: 'calibration' });
  });

  it('T89 Equipment down: assist machine', () => {
    const log = buildLog().lift('2026-11-04', { dip: cd.calibrate(120, 2) });
    const before = log.assist('chin');
    const plan = log.plan('2026-11-06', { equipmentDown: ['assistMachine'] });
    expect(plan.assist?.chin).toBeNull();
    expect(plan.assist?.dip).toBeNull();
    expect(plan.assist?.substitutions).toEqual([
      { exercise: 'Lat pulldown', sets: 3, reps: 8, repsToSpare: 2, replaces: 'chin' },
      { exercise: 'Incline push-up', sets: 3, reps: null, repsToSpare: 2, replaces: 'dip' },
    ]);

    log.lift('2026-11-06', {}, { equipmentDown: ['assistMachine'] });
    const after = log.assist('chin');
    expect(after?.assistance).toBe(before?.assistance);
    expect(after?.mode).toBe(before?.mode);
    expect(after?.step).toBe(before?.step);
    expect(log.plan('2026-11-09').assist?.chin?.assistance).toBe(before?.assistance);
  });
});
