// RULES.md section 7: chins and dips.
import { describe, expect, it } from 'vitest';
import { spreadReps } from '../src/engine';
import { PROGRAM, buildLog, cd } from './helpers/log';

describe('§7 Chins and dips', () => {
  it('T38 Wednesday’s chins', () => {
    const chin = (o: Parameters<typeof buildLog>[0]) => buildLog(o).plan('2026-11-04').assist?.chin?.assistance;
    expect(chin({ setup: { chinSpare: 2 } })).toBe(155);
    expect(chin({ setup: { chinSpare: 0 } })).toBe(157.5);
    expect(chin({ setup: { chinSpare: 0, assistTwoPointFiveLbSteps: false } })).toBe(160);
  });

  it('T39 Small steps, then a reps build', () => {
    const log = buildLog().override('2026-11-03', 'chin', 'assistance', 150);
    const chinPlan = (d: string) => log.plan(d).assist?.chin;

    expect(chinPlan('2026-11-04')?.assistance).toBe(150);
    log.lift('2026-11-04', { chin: cd.made(2) });
    expect(chinPlan('2026-11-06')?.assistance).toBe(145);

    log.lift('2026-11-06', { chin: cd.missed() });
    expect(log.assist('chin')).toMatchObject({ step: 2.5, assistance: 145, mode: 'LOAD' });

    log.lift('2026-11-09', { chin: cd.made(2) });
    expect(chinPlan('2026-11-11')?.assistance).toBe(142.5);

    log.lift('2026-11-11', { chin: cd.missed() }).lift('2026-11-13', { chin: cd.missed() });
    expect(log.assist('chin')).toMatchObject({ mode: 'REPS_BUILD', assistance: 145, targetReps: 6 });
    expect(chinPlan('2026-11-16')?.targetReps).toEqual([6, 6, 6]);

    log.lift('2026-11-16', { chin: cd.made(0) });
    expect(log.assist('chin')?.targetReps).toBe(7);
    log.lift('2026-11-18', { chin: cd.made(0) });
    expect(log.assist('chin')?.targetReps).toBe(8);
    log.lift('2026-11-20', { chin: cd.made(0) });
    expect(log.assist('chin')).toMatchObject({ mode: 'LOAD', assistance: 140, targetReps: 5, step: 2.5 });
  });

  it('T40 No small steps', () => {
    const log = buildLog({ setup: { assistTwoPointFiveLbSteps: false } })
      .override('2026-11-03', 'chin', 'assistance', 150)
      .lift('2026-11-04', { chin: cd.made(2) });
    expect(log.assist('chin')?.assistance).toBe(145);
    log.lift('2026-11-06', { chin: cd.missed() });
    expect(log.assist('chin')).toMatchObject({ mode: 'LOAD', assistance: 145, step: 5 });
    log.lift('2026-11-09', { chin: cd.missed() });
    expect(log.assist('chin')).toMatchObject({ mode: 'REPS_BUILD', assistance: 150, targetReps: 6 });
  });

  it('T41 Negatives', () => {
    const at = (assistance: number, date: string, split = false) => {
      const log = buildLog().lift('2026-11-04');
      if (split) log.setting('2026-11-05', 'splitChinsDips', true);
      log.override('2026-11-05', 'chin', 'assistance', assistance);
      if (date === '2026-11-09') log.lift('2026-11-06');
      return log.plan(date).assist?.chin;
    };
    expect(at(50, '2026-11-06')?.negatives).toBe(2); // A day
    expect(at(52.5, '2026-11-06')?.negatives).toBe(0);
    expect(at(50, '2026-11-09')?.negatives).toBe(0); // B day
    expect(at(45, '2026-11-09', true)?.negatives).toBe(2); // split: chins on B days
    expect(at(0, '2026-11-06')?.negatives).toBe(0);
  });

  it('splits chins and dips across A and B days', () => {
    const log = buildLog().lift('2026-11-04', { dip: cd.calibrate(120, 2) }).setting('2026-11-05', 'splitChinsDips', true);
    const a = log.plan('2026-11-06');
    expect(a.workout).toBe('A');
    expect(a.assist?.chin).toBeNull();
    expect(a.assist?.dip?.targetReps).toEqual([5, 5, 5]);
    log.lift('2026-11-06');
    const b = log.plan('2026-11-09');
    expect(b.assist?.dip).toBeNull();
    expect(b.assist?.chin?.targetReps).toEqual([5, 5, 5]);
  });

  it('T112 The setting he used', () => {
    // Assisted: prescribed 150, done at 155 and made with room. The next is 150, not 145.
    const load = buildLog().override('2026-11-03', 'chin', 'assistance', 150).lift('2026-11-04', { chin: cd.made(2) });
    expect(load.assist('chin')?.assistance).toBe(145);
    load.edit(load.sessionOn('2026-11-04'), (e) => {
      e.assist!.chin!.assistance = 155;
    });
    expect(load.assist('chin')).toMatchObject({ mode: 'LOAD', assistance: 150 });

    // Building reps: the help he used carries on with the next rep target.
    const build = buildLog({ setup: { assistTwoPointFiveLbSteps: false } })
      .override('2026-11-03', 'chin', 'assistance', 150)
      .lift('2026-11-04', { chin: cd.made(2) })
      .lift('2026-11-06', { chin: cd.missed() })
      .lift('2026-11-09', { chin: cd.missed() })
      .lift('2026-11-11', { chin: cd.made(0) });
    expect(build.assist('chin')).toMatchObject({ mode: 'REPS_BUILD', assistance: 150, targetReps: 7 });
    build.edit(build.sessionOn('2026-11-11'), (e) => {
      e.assist!.chin!.assistance = 155;
    });
    expect(build.assist('chin')).toMatchObject({ mode: 'REPS_BUILD', assistance: 155, targetReps: 7 });

    // Weighted: the belt he used, plus 2.5.
    const belt = buildLog()
      .override('2026-11-03', 'chin', 'assistance', 2.5)
      .lift('2026-11-04', { chin: cd.made(2) })
      .lift('2026-11-06', { chin: cd.reps([5, 5, 5]) })
      .lift('2026-11-09', { chin: cd.made(0) });
    expect(belt.assist('chin')).toMatchObject({ mode: 'WEIGHTED', addedLoad: 5 });
    belt.edit(belt.sessionOn('2026-11-09'), (e) => {
      e.assist!.chin!.addedLoad = 10;
    });
    expect(belt.assist('chin')).toMatchObject({ mode: 'WEIGHTED', addedLoad: 12.5 });
    expect(belt.plan('2026-11-11').assist?.chin?.addedLoad).toBe(12.5);
  });

  it('T42 Reaching zero', () => {
    const log = buildLog().override('2026-11-03', 'chin', 'assistance', 2.5).lift('2026-11-04', { chin: cd.made(2) });
    expect(log.assist('chin')).toMatchObject({ mode: 'BODYWEIGHT', assistance: 0 });
    expect(log.plan('2026-11-06').assist?.chin?.targetReps).toEqual([5, 5, 5]);

    log.lift('2026-11-06', { chin: cd.reps([4, 3, 3]) });
    expect(log.plan('2026-11-09').assist?.chin?.targetReps).toEqual([4, 4, 3]);
    expect(spreadReps(11, 3, 5)).toEqual([4, 4, 3]);

    log.lift('2026-11-09', { chin: cd.reps([5, 5, 5]) });
    expect(log.assist('chin')).toMatchObject({ mode: 'WEIGHTED', addedLoad: 2.5 });
    log.lift('2026-11-11', { chin: cd.made(0) });
    expect(log.assist('chin')?.addedLoad).toBe(5);
  });

  it('T44 Effective load', () => {
    const log = buildLog({ setup: { bodyweightLb: 270, chinSpare: 2 } });
    expect(log.plan('2026-11-04').assist?.chin).toMatchObject({ assistance: 155, effectiveLoad: 115 });
    log.bodyweight('2026-11-04', 262);
    expect(log.plan('2026-11-04').assist?.chin?.effectiveLoad).toBe(107);
  });

  it('cues slow lowering and dip depth by program week', () => {
    const log = buildLog();
    const early = log.plan('2026-11-04').assist?.dip?.cues ?? [];
    expect(early.join(' ')).toContain('Lower until your upper arms are parallel to the floor, and no deeper.');
    expect(log.plan('2026-11-04').assist?.chin?.cues.join(' ')).toMatch(/3 seconds/);
  });

  it('Q12 Without 5-lb steps, made with room takes off the stack step', () => {
    // Monday's chins: 160 with 2 to spare.
    expect(buildLog().assist('chin', '2026-11-03').assistance).toBe(155);
    const stack = buildLog({ setup: { assistFiveLbSteps: false } });
    expect(stack.assist('chin', '2026-11-03').assistance).toBe(160 - PROGRAM.equipment.assistMachine.stackStepLb);
    expect(stack.plan('2026-11-04').assist?.chin?.assistance).toBe(150);
  });
});
