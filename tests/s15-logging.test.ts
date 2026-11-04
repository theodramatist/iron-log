// RULES.md section 15: what gets logged. Every logged field replays and does its job.
import { describe, expect, it } from 'vitest';
import { buildLog, cd, formBroke, made } from './helpers/log';

describe('§15 What gets logged', () => {
  it('a fully filled-in lifting session replays, and each field does its job', () => {
    const log = buildLog().lift(
      '2026-11-04',
      { squat: formBroke(), deadlift: made('rir3to4'), chin: cd.made(1), dip: cd.calibrate(120, 2) },
      { checkIns: { lastNightUnder6: false, mostNightsUnder7: true, warmupsHeavy: true }, spinMinutes: 0 },
    );
    log.edit(log.sessionOn('2026-11-04'), (e) => {
      e.startedAt = '2026-11-04T17:00:00.000Z';
      e.endedAt = '2026-11-04T17:58:00.000Z';
      e.notes = 'Felt good.';
    });
    const ev = log.sessionOn('2026-11-04');
    expect(ev).toMatchObject({ workout: 'B', weekType: 'normal', checkIns: { mostNightsUnder7: true } });
    expect(ev.lifts.find((l) => l.lift === 'squat')?.sets.at(-1)?.formBroke).toBe(true);

    // A rep marked "form broke" is a missed rep.
    expect(log.state('squat')).toMatchObject({ stage: 'REPEAT', hasMissed: true });
    expect(log.state('deadlift')?.next?.weight).toBe(175);
    expect(log.assist('chin')?.assistance).toBe(150);
    expect(log.assist('dip')?.lastMadeAssistance).toBe(120);
    // Clock fields and notes don't change the plan.
    const plain = buildLog().lift(
      '2026-11-04',
      { squat: formBroke(), deadlift: made('rir3to4'), chin: cd.made(1), dip: cd.calibrate(120, 2) },
      { checkIns: { lastNightUnder6: false, mostNightsUnder7: true, warmupsHeavy: true }, spinMinutes: 0 },
    );
    expect(log.plan('2026-11-06')).toEqual(plain.plan('2026-11-06'));
  });

  it('a conditioning session records target, actual, machines, and intervals', () => {
    const log = buildLog().cond('2026-11-03', { minutes: 22 });
    const ev = log.events.at(-1);
    expect(ev).toMatchObject({
      type: 'conditioningSession',
      conditioningWeek: 1,
      phase: 1,
      targetMinutes: 20,
      actualMinutes: 22,
      machines: { easy: 'air bike' },
      intervalsPlanned: 0,
      intervalsDone: 0,
      shortNight: false,
    });
  });
});
