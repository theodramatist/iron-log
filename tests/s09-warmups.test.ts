// RULES.md section 9: warm-ups and calibration.
import { describe, expect, it } from 'vitest';
import { calibrationNextWeight, calibrationOutcome, dipCalibrationNext, warmupSets } from '../src/engine';
import { PROGRAM, buildLog, calibrate, cd } from './helpers/log';

const wu = (lift: 'squat' | 'press' | 'deadlift', w: number) =>
  warmupSets(lift, w, 45, PROGRAM).map((s) => (s.weight === 45 ? `bar×${s.reps}` : `${s.weight}×${s.reps}`));

describe('§9 Warm-ups and calibration', () => {
  it('T53 Warm-ups', () => {
    expect(wu('squat', 95)).toEqual(['bar×5', 'bar×5', '65×3', '80×2']);
    expect(wu('squat', 115)).toEqual(['bar×5', 'bar×5', '60×5', '80×3', '95×2']);
    expect(wu('press', 67.5)).toEqual(['bar×5', 'bar×5', '55×2']);
    expect(wu('deadlift', 155)).toEqual(['135×5']);
    expect(wu('deadlift', 175)).toEqual(['135×5', '145×2']);
    expect(wu('squat', 250)).toEqual(['bar×5', 'bar×5', '100×5', '135×5', '175×3', '210×2']);
    expect(wu('deadlift', 330)).toEqual(['135×5', '180×5', '230×3', '280×2']);
  });

  it('cues blocks for a light deadlift', () => {
    const plan = buildLog().liftPlan('2026-11-04', 'deadlift');
    expect(plan.weight).toBe(160);
    const light = buildLog().override('2026-11-03', 'deadlift', 'next', 145).liftPlan('2026-11-04', 'deadlift');
    expect(light.cues).toContain('Raise the bar to plate height on blocks for the empty-bar sets.');
    expect(plan.cues).not.toContain('Raise the bar to plate height on blocks for the empty-bar sets.');
  });

  it('T54 Bench calibration', () => {
    expect(calibrationNextWeight(45, 'fast', 'bench', PROGRAM)).toBe(65);
    expect(calibrationNextWeight(105, 'slowing', 'bench', PROGRAM)).toBe(115);
    const ramp = [
      { weight: 45, reps: 5, verdict: 'fast' as const },
      { weight: 65, reps: 5, verdict: 'fast' as const },
      { weight: 85, reps: 5, verdict: 'fast' as const },
      { weight: 105, reps: 5, verdict: 'slowing' as const },
      { weight: 115, reps: 5, verdict: 'slowed' as const },
    ];
    expect(calibrationOutcome(ramp, 'bench', PROGRAM)).toEqual({
      workWeight: 115,
      rampSetIsFirstWorkSet: true,
      workSetsRemaining: 2,
    });
    const missedLast = ramp.map((s, i) => (i === 4 ? { ...s, reps: 4 } : s));
    expect(calibrationOutcome(missedLast, 'bench', PROGRAM)).toEqual({
      workWeight: 105,
      rampSetIsFirstWorkSet: false,
      workSetsRemaining: 3,
    });

    const plan = buildLog().liftPlan('2026-11-04', 'bench');
    expect(plan).toMatchObject({ kind: 'calibration', weight: 45 });
    expect(plan.calibration).toEqual({
      repsPerSet: 5,
      startWeight: 45,
      stepFast: 20,
      stepSlowing: 10,
      buttons: ['Fast', 'Starting to slow', 'Clearly slowed'],
      workSets: 3,
    });

    const steps: [number, 'fast' | 'slowing' | 'slowed'][] = [
      [45, 'fast'],
      [65, 'fast'],
      [85, 'fast'],
      [105, 'slowing'],
      [115, 'slowed'],
    ];
    const done = buildLog().lift('2026-11-04', { bench: calibrate(steps, { effort: 'rir1to2' }) });
    expect(done.state('bench')).toMatchObject({ needsCalibration: false, lcw: 115 });
    const short = buildLog().lift('2026-11-04', { bench: calibrate(steps, { lastMissed: true }) });
    expect(short.state('bench')?.lcw).toBe(105);
  });

  it('T55 Row calibration', () => {
    const log = buildLog();
    for (const d of ['2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13', '2026-11-16']) log.lift(d);
    const row = log.liftPlan('2026-11-18', 'row');
    expect(row.kind).toBe('calibration');
    expect(row.calibration).toMatchObject({ repsPerSet: 5, workSets: 3, buttons: ['Fast', 'Starting to slow', 'Clearly slowed'] });

    const clean = buildLog({ setup: { pullChoice: 'powerClean' } });
    for (const d of ['2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13', '2026-11-16']) clean.lift(d);
    expect(clean.liftPlan('2026-11-18', 'powerClean').calibration).toMatchObject({
      repsPerSet: 3,
      workSets: 5,
      buttons: ['Fast', 'Starting to slow', 'Bar speed dropped'],
    });
  });

  it('T43 Dip calibration', () => {
    const log = buildLog({ setup: { chinSpare: 2 } });
    const dip = log.plan('2026-11-04').assist?.dip;
    expect(dip?.calibration?.start).toBe(155); // the current chin assistance
    expect(dipCalibrationNext(155, false)).toBe(145);
    expect(dipCalibrationNext(125, true)).toBe(120);

    log.lift('2026-11-04', { dip: cd.calibrate(120, 2) });
    const logged = log.sessionOn('2026-11-04').assist?.dip;
    expect(logged?.assistance).toBe(120);
    expect(logged?.reps).toEqual([5, 5, 5]);
    expect(log.assist('dip')).toMatchObject({ needsCalibration: false, lastMadeAssistance: 120 });
  });

  it('Q6 A calibration day is the first heavy session', () => {
    const ramp: [number, 'fast' | 'slowing' | 'slowed'][] = [
      [45, 'fast'],
      [65, 'fast'],
      [85, 'fast'],
      [105, 'slowing'],
      [115, 'slowed'],
    ];
    const log = buildLog().lift('2026-11-04', { bench: calibrate(ramp, { effort: 'rir1to2' }), dip: cd.calibrate(120, 2) });
    expect(log.state('bench')).toMatchObject({ lcw: 115, next: { weight: 120 } });
    expect(log.assist('dip')).toMatchObject({ assistance: 115, lastMadeAssistance: 120 });
  });
});
