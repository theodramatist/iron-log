// RULES.md section 17: edge cases.
import { describe, expect, it } from 'vitest';
import { buildSetupEvents, nextLiftingDate, prescribe, programState, type LiftingSessionEvent } from '../src/engine';
import { PROGRAM, buildLog, made, madeAt, missed, missedAt } from './helpers/log';

describe('§17 Edge cases', () => {
  it('T01 Seeded first session', () => {
    let n = 0;
    const events = buildSetupEvents(
      PROGRAM,
      { ageBracket: null, mondayEffort: { squat: 'rir3to4', press: 'rir1to2', deadlift: 'light' }, chinSpare: 2 },
      { setupDate: '2026-11-03', nowIso: '2026-11-03T12:00:00.000Z', makeId: () => `id${++n}` },
    );
    const [setup, session] = events;
    expect(setup).toMatchObject({ type: 'setup', screeningAcknowledged: true });
    expect(session).toMatchObject({ type: 'liftingSession', date: '2026-11-02', workout: 'A', weekType: 'normal' });
    const s = session as LiftingSessionEvent;
    const lifts = Object.fromEntries(
      s.lifts.map((l) => [l.lift, [l.sets.length, l.sets[0]?.reps, l.sets[0]?.weight, l.effort]]),
    );
    expect(lifts).toEqual({
      squat: [3, 5, 95, 'rir3to4'],
      press: [3, 5, 65, 'rir1to2'],
      deadlift: [1, 5, 145, 'light'],
    });
    expect(s.assist?.chin).toMatchObject({ assistance: 160, reps: [5, 5, 5], spare: 2 });
    expect(s.assist?.dip).toBeUndefined();

    const input = { program: PROGRAM, settings: {}, events, today: '2026-11-03' };
    expect(programState(input).screeningAtSetup).toBe(true);
    expect(nextLiftingDate(input, '2026-11-03')).toBe('2026-11-04');
    expect(prescribe(input, '2026-11-04').workout).toBe('B');
  });

  it('T83 Changing pullChoice', () => {
    const log = buildLog();
    for (const d of ['2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13', '2026-11-16']) log.lift(d);
    log.lift('2026-11-18', { row: madeAt(135, 'crisp') }).lift('2026-11-20');
    expect(log.state('row')?.next?.weight).toBe(140);

    log.setting('2026-11-21', 'pullChoice', 'powerClean');
    expect(log.liftPlan('2026-11-23', 'powerClean')).toMatchObject({ kind: 'calibration' });
    log.lift('2026-11-23').lift('2026-11-25').setting('2026-11-26', 'pullChoice', 'row');
    expect(log.liftPlan('2026-11-27', 'row')).toMatchObject({ kind: 'heavy', weight: 140 });
  });

  it('two sessions on the same day are allowed, with a warning', () => {
    const log = buildLog().lift('2026-11-04');
    expect(log.plan('2026-11-04').sameDayWarning).toBe(true);
    expect(log.plan('2026-11-06').sameDayWarning).toBe(false);
  });

  it('shows the date of a stale bodyweight', () => {
    const log = buildLog({ setup: { bodyweightLb: 270 } });
    expect(log.plan('2026-11-06').assist?.chin).toMatchObject({ bodyweightLb: 270, bodyweightStale: false });
    expect(log.plan('2026-11-20').assist?.chin).toMatchObject({ bodyweightDate: '2026-11-03', bodyweightStale: true });
  });

  it('graduated lifts stay graduated unless restarted', () => {
    const log = buildLog()
      .lift('2027-01-04')
      .lift('2027-01-08', { press: madeAt(100, 'rir3to4') })
      .lift('2027-01-11')
      .lift('2027-01-15', { press: missedAt(105) })
      .lift('2027-01-18')
      .lift('2027-01-22', { press: missedAt(105) })
      .lift('2027-01-25')
      .lift('2027-01-29', { press: missed() }) // reset to 92.5
      .lift('2027-02-01')
      .lift('2027-02-05', { press: made('rir1to2') }) // 92.5, next 95
      .lift('2027-02-08')
      .lift('2027-02-12', { press: missed() })
      .lift('2027-02-15')
      .lift('2027-02-19', { press: missed() }); // graduated at 95
    expect(log.state('press')?.stage).toBe('GRADUATED');
    log.lift('2027-02-22').lift('2027-02-26', { press: made() });
    expect(log.state('press')).toMatchObject({ stage: 'GRADUATED', lastCompleted: { weight: 92.5, sets: 3, reps: 5 } });

    const graduationNotes = () => log.suggestions().filter((s) => s.kind === 'graduation' && s.lift === 'press');
    expect(graduationNotes()).toHaveLength(1);

    log.override('2027-02-27', 'press', 'restart', 92.5, { reason: 'Restarting the press' });
    expect(log.state('press')).toMatchObject({ stage: 'NORMAL', lcw: 92.5 });
    expect(graduationNotes()).toHaveLength(0);
    log.lift('2027-03-01');
    expect(log.liftPlan('2027-03-05', 'press')).toMatchObject({ kind: 'heavy', weight: 92.5 });
  });
});
