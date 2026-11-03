// RULES.md section 4: barbell progression.
import { describe, expect, it } from 'vitest';
import { inventoryFrom, isLoadable, type TableRating } from '../src/engine';
import { PROGRAM, buildLog, made, madeAt, missedAt, notReached, skipped } from './helpers/log';

const inv = inventoryFrom({ barLb: 45, plates: PROGRAM.equipment.plateInventory });

describe('§4 Barbell progression', () => {
  it.each<[TableRating, number, number]>([
    ['light', 115, 175],
    ['rir3to4', 105, 160],
    ['rir1to2', 100, 155],
    ['grind', 97.5, 150],
  ])('T07 Wednesday, November 4: Monday rated %s', (rating, squat, deadlift) => {
    const plan = buildLog({ setup: { squat: rating, deadlift: rating } }).plan('2026-11-04');
    expect(plan.lifts.find((l) => l.lift === 'squat')?.weight).toBe(squat);
    expect(plan.lifts.find((l) => l.lift === 'deadlift')?.weight).toBe(deadlift);
  });

  it.each<[TableRating, number]>([
    ['light', 75],
    ['rir3to4', 70],
    ['rir1to2', 67.5],
    ['grind', 66],
  ])('T08 Friday’s press: Monday rated %s', (rating, press) => {
    const log = buildLog({ setup: { press: rating } }).lift('2026-11-04');
    expect(log.liftPlan('2026-11-06', 'press').weight).toBe(press);
  });

  it('T09 Cap after a miss', () => {
    const base = () =>
      buildLog()
        .lift('2026-11-04', { squat: missedAt(200) })
        .lift('2026-11-06', { squat: madeAt(200, 'rir3to4') });
    expect(base().state('squat')?.hasMissed).toBe(true);
    expect(base().state('squat')?.lcw).toBe(200);
    expect(base().lift('2026-11-09', { squat: madeAt(200, 'rir3to4') }).state('squat')?.next?.weight).toBe(205);
    expect(base().lift('2026-11-09', { squat: madeAt(200, 'light') }).state('squat')?.next?.weight).toBe(205);
    expect(base().lift('2026-11-09', { squat: madeAt(200, 'grind') }).state('squat')?.next?.weight).toBe(202.5);
  });

  it('T10 First jump after a recovery', () => {
    const log = buildLog()
      .lift('2026-11-04', { squat: madeAt(200) })
      .lift('2026-11-06', { squat: missedAt(210) });
    expect(log.state('squat')?.stage).toBe('REPEAT');
    log.lift('2026-11-09', { squat: madeAt(210, 'rir3to4') });
    expect(log.state('squat')?.next?.weight).toBe(212.5);
    expect(log.state('squat')?.stage).toBe('NORMAL');
  });

  it('T11 Rows', () => {
    const log = buildLog();
    for (const d of ['2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13', '2026-11-16']) log.lift(d);
    log.lift('2026-11-18', { row: madeAt(135, 'crisp') });
    expect(log.state('row')?.lcw).toBe(135);
    expect(log.state('row')?.next?.weight).toBe(140);

    log.lift('2026-11-20').lift('2026-11-23', { row: made('notCrisp') });
    expect(log.lastPlan?.lifts.find((l) => l.lift === 'row')?.weight).toBe(140);
    expect(log.state('row')?.next?.weight).toBe(142.5);

    log.lift('2026-11-25').lift('2026-11-27', { row: made('crisp') });
    expect(log.state('row')?.next?.weight).toBe(145);
  });

  it('T12 Choosing a smaller jump', () => {
    const log = buildLog({ setup: { squat: 'light' } });
    expect(log.state('squat')?.next?.weight).toBe(115);
    const choices = log.choices('squat');
    expect(choices[0]).toBe(95);
    expect(choices[choices.length - 1]).toBe(115);
    expect(choices).toContain(97.5);
    expect(choices.every((w) => isLoadable(w, inv) && w >= 95 && w <= 115)).toBe(true);
  });

  it('T13 Incomplete lift', () => {
    const log = buildLog().lift('2026-11-04', { squat: madeAt(145, 'rir1to2') });
    expect(log.state('squat')?.next?.weight).toBe(150);

    log.lift('2026-11-06', { squat: skipped(2) });
    expect(log.state('squat')).toMatchObject({ stage: 'NORMAL', lcw: 145, next: { weight: 150, sets: 3, reps: 5 } });
    expect(log.state('squat')?.hasMissed).toBe(false);

    log.lift('2026-11-09', { squat: notReached() });
    expect(log.state('squat')).toMatchObject({ stage: 'NORMAL', lcw: 145, next: { weight: 150, sets: 3, reps: 5 } });
  });

  it('T87 Short night: lifting', () => {
    const log = buildLog({ setup: { squat: 'light', deadlift: 'light' } });
    const normal = log.plan('2026-11-04');
    const short = log.plan('2026-11-04', { checkIns: { lastNightUnder6: true } });
    const w = (p: typeof normal, lift: string) => p.lifts.find((l) => l.lift === lift)?.weight;
    expect([w(normal, 'squat'), w(normal, 'deadlift')]).toEqual([115, 175]);
    expect([w(short, 'squat'), w(short, 'deadlift')]).toEqual([105, 160]);
  });

  it('short night leaves ladder lifts and the smallest-jump step alone', () => {
    const log = buildLog()
      .lift('2026-11-04', { squat: madeAt(200) })
      .lift('2026-11-06', { squat: missedAt(210) });
    expect(log.liftPlan('2026-11-09', 'squat', { checkIns: { lastNightUnder6: true } }).weight).toBe(210);
  });
});
