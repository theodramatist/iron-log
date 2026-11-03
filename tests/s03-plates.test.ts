// RULES.md section 3: loads, plates, and rounding.
import { describe, expect, it } from 'vitest';
import { inventoryFrom, isLoadable, percentWeight, platesPerSide, progressionWeight } from '../src/engine';
import { PROGRAM, buildLog, made } from './helpers/log';

const inv = inventoryFrom({ barLb: PROGRAM.equipment.barLb, plates: PROGRAM.equipment.plateInventory });

describe('§3 Loads, plates, and rounding', () => {
  it('knows what the default inventory can load', () => {
    expect(isLoadable(45, inv)).toBe(true);
    expect(isLoadable(66, inv)).toBe(true);
    expect(isLoadable(67, inv)).toBe(false);
    expect(isLoadable(67.5, inv)).toBe(true);
    expect(isLoadable(40, inv)).toBe(false);
  });

  it('T14 Logged weights rule', () => {
    const log = buildLog().override('2026-11-03', 'squat', 'next', 252.5);
    expect(log.liftPlan('2026-11-04', 'squat').weight).toBe(252.5);
    log.lift('2026-11-04', { squat: made('rir1to2', 250) });
    expect(log.state('squat')?.lcw).toBe(250);
    expect(log.state('squat')?.next?.weight).toBe(255);
  });

  it('T15 Default inventory', () => {
    expect(progressionWeight(66, 1, inv)).toEqual({
      weight: 67.5,
      note: "Your plates can't make a 1-lb jump. The next step up is 67.5.",
    });
    expect(progressionWeight(67.5, 1, inv)).toEqual({ weight: 68.5, note: null });
    expect(progressionWeight(68.5, 1, inv)).toEqual({
      weight: 70,
      note: "Your plates can't make a 1-lb jump. The next step up is 70.",
    });
  });

  it('T16 Edited inventory', () => {
    const twoHalves = inventoryFrom({
      barLb: 45,
      plates: PROGRAM.equipment.plateInventory.map((p) => (p.lb === 0.5 ? { lb: 0.5, pairs: 2 } : p)),
    });
    expect(progressionWeight(66, 1, twoHalves)).toEqual({ weight: 67, note: null });
  });

  it('T17 Plates per side', () => {
    expect(platesPerSide(252.5, inv)).toEqual([45, 45, 10, 2.5, 1.25]);
    expect(platesPerSide(232.5, inv)).toEqual([45, 45, 2.5, 1.25]);
    expect(platesPerSide(67.5, inv)).toEqual([10, 1.25]);
    expect(platesPerSide(45, inv)).toEqual([]);
    expect(platesPerSide(67, inv)).toBeNull();
  });

  it('T18 Percentage weights', () => {
    expect(percentWeight(260, 0.9, 'squat', inv)).toBe(232.5);
    expect(percentWeight(330, 0.9, 'deadlift', inv)).toBe(295);
    expect(percentWeight(105, 0.9, 'press', inv)).toBe(92.5);
    expect(percentWeight(182.5, 0.9, 'bench', inv)).toBe(162.5);
    // Exact arithmetic: 95% of 250 is 237.5, not 235.
    expect(percentWeight(250, 0.95, 'squat', inv)).toBe(237.5);
  });

  it('shows plates for warm-ups and work sets', () => {
    const squat = buildLog({ setup: { squat: 'light' } }).liftPlan('2026-11-04', 'squat');
    expect(squat.weight).toBe(115);
    expect(squat.plates).toEqual([25, 10]);
    expect(squat.warmups.map((w) => [w.weight, w.reps, w.plates])).toEqual([
      [45, 5, []],
      [45, 5, []],
      [60, 5, [5, 2.5]],
      [80, 3, [10, 5, 2.5]],
      [95, 2, [25]],
    ]);
  });
});
