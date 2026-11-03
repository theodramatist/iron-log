// RULES.md section 5: the stall ladder.
// Unless a scenario gives a date, sessions fall in January and early February
// 2027: program week 10 or later, with no maintenance break within 14 days.
import { describe, expect, it } from 'vitest';
import { PROGRAM, buildLog, made, madeAt, missed, missedAt, type Log } from './helpers/log';

const kinds = (log: Log, kind: string) => log.suggestions().filter((s) => s.kind === kind);

/** T22's run: a squat stall that resets on Friday 2027-02-12. */
function t22(): Log {
  return buildLog()
    .lift('2027-01-29', { squat: madeAt(240, 'rir3to4') })
    .lift('2027-02-01', { squat: missedAt(250) }) // REPEAT
    .lift('2027-02-03', { squat: missedAt(250) }) // stall: BRIDGE_SHORT round 1
    .lift('2027-02-05', { squat: made() }) // 5x3 made: BRIDGE_NORMAL round 1
    .lift('2027-02-08', { squat: missed() }) // 3x5 missed: BRIDGE_SHORT round 2
    .lift('2027-02-10', { squat: made() }) // 5x3 made: BRIDGE_NORMAL round 2
    .lift('2027-02-12', { squat: missed() }); // 3x5 missed: reset
}

/** After T22's reset, climbing on Mondays and Fridays so the light squat day never lands. */
function climbAfterReset(log: Log, dates: string[]): Log {
  for (const d of dates) log.lift(d, { squat: made('rir1to2') });
  return log;
}

describe('§5 Stall ladder', () => {
  it('T19 First miss', () => {
    const log = buildLog()
      .lift('2027-01-04', { squat: madeAt(240, 'rir3to4') })
      .lift('2027-01-06', { squat: missedAt(250, [5, 5, 4]) });
    expect(log.state('squat')).toMatchObject({
      stage: 'REPEAT',
      hasMissed: true,
      next: { weight: 250, sets: 3, reps: 5 },
    });
  });

  it('T20 Stall to bridge', () => {
    const log = buildLog()
      .lift('2027-01-04', { squat: madeAt(240, 'rir3to4') })
      .lift('2027-01-06', { squat: missedAt(250) })
      .lift('2027-01-08', { squat: missedAt(250) });
    expect(log.state('squat')).toMatchObject({
      stage: 'BRIDGE_SHORT',
      round: 1,
      next: { weight: 250, sets: 5, reps: 3 },
    });
    const plan = log.liftPlan('2027-01-11', 'squat');
    expect(plan).toMatchObject({ weight: 250, sets: 5, reps: 3 });
    expect(plan.restSec).toBeGreaterThanOrEqual(300);
  });

  it('T21 Bridge made', () => {
    const log = buildLog()
      .lift('2027-01-04', { squat: madeAt(240, 'rir3to4') })
      .lift('2027-01-06', { squat: missedAt(250) })
      .lift('2027-01-08', { squat: missedAt(250) })
      .lift('2027-01-11', { squat: made() });
    expect(log.state('squat')).toMatchObject({ stage: 'BRIDGE_NORMAL', next: { weight: 250, sets: 3, reps: 5 } });
    log.lift('2027-01-13', { squat: made('rir3to4') });
    expect(log.state('squat')).toMatchObject({ stage: 'NORMAL', lcw: 250, next: { weight: 252.5 } });
  });

  it('T22 The squat’s second round, then reset', () => {
    const log = t22();
    expect(log.state('squat')).toMatchObject({
      stage: 'NORMAL',
      lcw: 225,
      next: { weight: 225, sets: 3, reps: 5 },
      lastResetFrom: 250,
      resetCount: 1,
    });
  });

  it('T23 Missed short sets reset at once', () => {
    const log = buildLog()
      .lift('2027-01-29', { squat: madeAt(240, 'rir3to4') })
      .lift('2027-02-01', { squat: missedAt(250) })
      .lift('2027-02-03', { squat: missedAt(250) })
      .lift('2027-02-05', { squat: missed() });
    expect(log.state('squat')).toMatchObject({ stage: 'NORMAL', lcw: 225, resetCount: 1, lastResetFrom: 250 });
  });

  it('T24 Graduation', () => {
    const log = climbAfterReset(t22(), ['2027-02-15', '2027-02-19', '2027-02-22', '2027-02-26']);
    expect(log.state('squat')?.next?.weight).toBe(245);
    log.lift('2027-03-01', { squat: missed() }).lift('2027-03-05', { squat: missed() });
    expect(log.state('squat')?.stage).toBe('GRADUATED');

    const grad = kinds(log, 'graduation');
    expect(grad).toHaveLength(1);
    expect(grad[0]?.message).toBe(
      "The novice run is over for the squat. Hold it at its last completed weight and sets until you pick its next program, such as Starting Strength's Texas Method or a Barbell Medicine template.",
    );
    expect(log.liftPlan('2027-03-08', 'squat')).toMatchObject({ kind: 'graduated', weight: 240, sets: 3, reps: 5 });

    log.lift('2027-03-08', { press: madeAt(100, 'rir1to2') });
    expect(log.state('press')?.next?.weight).toBe(102.5);
  });

  it('T25 A second reset above the old stall', () => {
    const log = climbAfterReset(t22(), [
      '2027-02-15',
      '2027-02-19',
      '2027-02-22',
      '2027-02-26',
      '2027-03-01',
      '2027-03-05',
      '2027-03-08',
    ]);
    expect(log.state('squat')?.next?.weight).toBe(260);
    log.lift('2027-03-12', { squat: missed() }).lift('2027-03-15', { squat: missed() });
    expect(log.state('squat')).toMatchObject({ stage: 'BRIDGE_SHORT', round: 1 });

    log
      .lift('2027-03-19', { squat: made() }) // round 1 short sets made
      .lift('2027-03-22', { squat: made() }) // Holy Week floor session, not heavy
      .lift('2027-03-24', { squat: made() }) // floor session
      .lift('2027-03-29', { squat: missed() }) // round 1 normal sets missed
      .lift('2027-04-02', { squat: made() }) // round 2 short sets made
      .lift('2027-04-05', { squat: missed() }); // round 2 normal sets missed
    expect(log.state('squat')).toMatchObject({ stage: 'NORMAL', lcw: 232.5, lastResetFrom: 260, resetCount: 2 });
  });

  /** A squat bridge whose last round fails on Wednesday 2027-02-17. */
  function t26(): Log {
    return buildLog()
      .lift('2027-02-03', { squat: madeAt(240, 'rir3to4') })
      .lift('2027-02-05', { squat: missedAt(250) })
      .lift('2027-02-08', { squat: missedAt(250) })
      .lift('2027-02-10', { squat: made() })
      .lift('2027-02-12', { squat: missed() })
      .lift('2027-02-15', { squat: made() })
      .lift('2027-02-17', { squat: missed() });
  }

  it('T26 Hold before a maintenance break', () => {
    const log = t26();
    expect(log.state('squat')).toMatchObject({ stage: 'HOLD', holdUntil: '2027-03-01' });
    expect(log.liftPlan('2027-02-19', 'squat')).toMatchObject({ weight: 250, sets: 5, reps: 3 });
    log.lift('2027-02-19', { squat: made() });
    expect(log.liftPlan('2027-02-22', 'squat')).toMatchObject({ weight: 250, sets: 3, reps: 5 });
    log.lift('2027-02-22', { squat: missed() });
    expect(log.state('squat')?.stage).toBe('HOLD');
    expect(log.liftPlan('2027-02-24', 'squat')).toMatchObject({ weight: 250, sets: 5, reps: 3 });
    log.lift('2027-02-24', { squat: made() });
    expect(log.liftPlan('2027-02-26', 'squat')).toMatchObject({ weight: 250, sets: 3, reps: 5 });
    log.lift('2027-02-26', { squat: missed() });
    expect(log.liftPlan('2027-03-01', 'squat')).toMatchObject({ weight: 250, sets: 3, reps: 5 });

    const madeIt = structuredCloneLog(log).lift('2027-03-01', { squat: made('rir1to2') });
    expect(madeIt.state('squat')).toMatchObject({ stage: 'NORMAL', next: { weight: 252.5 } });

    const missedIt = structuredCloneLog(log).lift('2027-03-01', { squat: missed() });
    expect(missedIt.state('squat')).toMatchObject({ stage: 'NORMAL', lcw: 225, resetCount: 1 });
    expect(kinds(missedIt, 'foodLever')).toHaveLength(0);
  });

  it('T27 No hold when the break is 17 days away', () => {
    const log = t22(); // fails on Friday 2027-02-12
    expect(log.state('squat')).toMatchObject({ stage: 'NORMAL', lcw: 225 });
  });

  it('T28 A hold that spans a floor week', () => {
    const log = buildLog();
    const climb = [
      '2026-11-04',
      '2026-11-06',
      '2026-11-09',
      '2026-11-11',
      '2026-11-13',
      '2026-11-16',
      '2026-11-18',
      '2026-11-20',
      '2026-11-23',
      '2026-11-25',
    ];
    for (const d of climb) log.lift(d, { squat: made('rir3to4') });
    expect(log.state('squat')?.next?.weight).toBe(205);
    log
      .lift('2026-11-27', { squat: missed() })
      .lift('2026-11-30', { squat: missed() }) // stall in week 5
      .lift('2026-12-02', { squat: made() })
      .lift('2026-12-04', { squat: missed() })
      .lift('2026-12-07', { squat: made() })
      .lift('2026-12-09', { squat: missed() }); // last round fails 12 days before the break
    expect(log.state('squat')).toMatchObject({ stage: 'HOLD', holdUntil: '2026-12-21' });
    expect(kinds(log, 'foodLever')).toHaveLength(0);

    log
      .lift('2026-12-11', { squat: made() })
      .lift('2026-12-14', { squat: missed() })
      .lift('2026-12-16', { squat: made() })
      .lift('2026-12-18', { squat: missed() });
    expect(log.plan('2026-12-21').weekType).toBe('floor');
    log.lift('2026-12-21', { squat: made() }).lift('2026-12-23', { squat: made() });
    expect(log.liftPlan('2026-12-28', 'squat')).toMatchObject({ kind: 'heavy', weight: 205, sets: 3, reps: 5 });
  });

  /** A deadlift bridge at 285 that fails on Wednesday 2026-12-02, with a bench heading for its own reset. */
  function t29(): Log {
    return buildLog({ setup: { deadlift: 'light' } })
      .lift('2026-11-04', { deadlift: made('rir3to4'), bench: madeAt(135, 'rir3to4') }) // B
      .lift('2026-11-06', { deadlift: made('rir3to4') }) // A
      .lift('2026-11-09', { deadlift: made('rir3to4'), bench: made('rir3to4') }) // B
      .lift('2026-11-11', { deadlift: made('rir3to4') }) // A
      .lift('2026-11-13', { deadlift: madeAt(270, 'rir3to4'), bench: made('rir3to4') }) // B
      .lift('2026-11-16', { deadlift: missedAt(285) }) // A: REPEAT
      .lift('2026-11-18', { bench: missed() }) // B: bench REPEAT at 150
      .lift('2026-11-20', { deadlift: missedAt(285) }) // A: stall, BRIDGE_SHORT
      .lift('2026-11-23', { bench: missed() }) // B: bench stall
      .lift('2026-11-25', { deadlift: made() }) // A: 2x3 made
      .lift('2026-11-30', { bench: made() }) // B: bench 5x3 made (Friday 11-27 skipped)
      .lift('2026-12-02', { deadlift: missed() }); // A: 1x5 missed, so ask
  }

  it('T29 Food lever', () => {
    const asked = t29();
    expect(asked.state('deadlift')?.pendingFoodLever).toMatchObject({ weight: 285 });
    const q = kinds(asked, 'foodLever');
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ lift: 'deadlift', message: 'Has recovery felt poor?' });

    // No: reset at once.
    const no = t29().foodLever('2026-12-02', 'deadlift', false);
    expect(no.state('deadlift')).toMatchObject({ stage: 'NORMAL', lcw: 255, next: { weight: 255, sets: 1, reps: 5 } });
    expect(no.program().foodLeverOn).toBe(false);

    // Yes: the lever turns on and the deadlift gets one more round.
    const yes = t29().foodLever('2026-12-02', 'deadlift', true);
    expect(yes.program().foodLeverOn).toBe(true);
    expect(yes.state('deadlift')).toMatchObject({ stage: 'BRIDGE_SHORT', next: { weight: 285, sets: 2, reps: 3 } });
    expect(yes.day('2026-12-04').foodLines).toContain(PROGRAM.nutritionPrompts.foodLeverOnLiftingDay);

    // A later lift reaching a reset in weeks 1-8 isn't asked again.
    yes.lift('2026-12-04', { bench: missed() });
    expect(yes.state('bench')).toMatchObject({ stage: 'NORMAL', lcw: 135, resetCount: 1 });
    expect(kinds(yes, 'foodLever')).toHaveLength(0);

    yes.lift('2026-12-07', { deadlift: made() });
    expect(yes.state('deadlift')).toMatchObject({ next: { weight: 285, sets: 1, reps: 5 } });
    yes.lift('2026-12-09').lift('2026-12-11', { deadlift: missed() });

    // Q1: the round fails on 12-11, inside the 14 days before the
    // December 21 break, so the hold comes first.
    expect(yes.state('deadlift')).toMatchObject({ stage: 'HOLD', holdUntil: '2026-12-21' });
    yes
      .lift('2026-12-14')
      .lift('2026-12-16', { deadlift: made() })
      .lift('2026-12-18')
      .lift('2026-12-21', { deadlift: made() }) // floor session
      .lift('2026-12-23') // floor session
      .lift('2026-12-28', { deadlift: missed() }); // the retry
    expect(yes.state('deadlift')).toMatchObject({ stage: 'NORMAL', lcw: 255, resetCount: 1 });
    expect(kinds(yes, 'foodLever')).toHaveLength(0);
  });

  it('T30 Early-stall note', () => {
    const nov = buildLog()
      .lift('2026-11-25', { squat: madeAt(200, 'rir3to4') })
      .lift('2026-11-27', { squat: missedAt(210) })
      .lift('2026-11-30', { squat: missedAt(210) });
    expect(nov.state('squat')?.stage).toBe('BRIDGE_SHORT');
    const note = kinds(nov, 'earlyStall');
    expect(note).toHaveLength(1);
    expect(note[0]?.message).toBe(PROGRAM.nutritionPrompts.earlyStallNote);

    const jan = buildLog()
      .lift('2026-12-30', { squat: madeAt(200, 'rir3to4') })
      .lift('2027-01-01', { squat: missedAt(210) })
      .lift('2027-01-04', { squat: missedAt(210) });
    expect(jan.state('squat')?.stage).toBe('BRIDGE_SHORT');
    expect(kinds(jan, 'earlyStall')).toHaveLength(0);
  });

  it('T31 Deadlift bridge', () => {
    const log = buildLog()
      .lift('2027-01-04')
      .lift('2027-01-08', { deadlift: madeAt(290, 'rir3to4') })
      .lift('2027-01-11')
      .lift('2027-01-15', { deadlift: missedAt(300) });
    expect(log.state('deadlift')).toMatchObject({ stage: 'REPEAT', next: { weight: 300 } });
    log.lift('2027-01-18').lift('2027-01-22', { deadlift: missed() });
    expect(log.state('deadlift')?.next).toMatchObject({ weight: 300, sets: 2, reps: 3 });
    log.lift('2027-01-25').lift('2027-01-29', { deadlift: made() });
    expect(log.state('deadlift')?.next).toMatchObject({ weight: 300, sets: 1, reps: 5 });
    log.lift('2027-02-01').lift('2027-02-05', { deadlift: missed() });
    expect(log.state('deadlift')).toMatchObject({ stage: 'NORMAL', lcw: 270, resetCount: 1 });
  });

  it('T32 Power cleans skip the bridge', () => {
    const log = buildLog({ setup: { pullChoice: 'powerClean' } })
      .lift('2027-01-04', { powerClean: madeAt(130, 'crisp') })
      .lift('2027-01-08')
      .lift('2027-01-11', { powerClean: missedAt(135) })
      .lift('2027-01-15')
      .lift('2027-01-18', { powerClean: missedAt(135) });
    expect(log.state('powerClean')).toMatchObject({
      stage: 'NORMAL',
      lcw: 120,
      resetCount: 1,
      next: { weight: 120, sets: 5, reps: 3 },
    });
    expect(log.state('powerClean')?.history.some((h) => h.sets === 0 || h.reps !== 3)).toBe(false);
  });

  it('T33 Counting lifts on the ladder', () => {
    const one = buildLog()
      .lift('2027-01-04', { squat: madeAt(240, 'rir3to4') })
      .lift('2027-01-08', { squat: missedAt(250), press: madeAt(100, 'rir3to4') })
      .lift('2027-01-11', { squat: missedAt(250) })
      .lift('2027-01-15', { press: missedAt(105) });
    expect(one.state('squat')?.stage).toBe('BRIDGE_SHORT');
    expect(one.state('press')?.stage).toBe('REPEAT');
    expect(kinds(one, 'lightWeek')).toHaveLength(0);

    const two = buildLog()
      .lift('2027-02-01', { squat: madeAt(240, 'rir3to4'), bench: madeAt(170, 'rir3to4') })
      .lift('2027-02-03', { squat: missedAt(250) })
      .lift('2027-02-05', { squat: missedAt(250), bench: missedAt(175) })
      .lift('2027-02-08')
      .lift('2027-02-10', { bench: missedAt(175) })
      .lift('2027-02-12')
      .lift('2027-02-15', { bench: made() })
      .lift('2027-02-17')
      .lift('2027-02-19', { bench: missed() });
    expect(two.state('squat')?.stage).toBe('BRIDGE_SHORT');
    expect(two.state('bench')?.stage).toBe('HOLD');
    expect(kinds(two, 'lightWeek')).toHaveLength(1);

    const resetRun = () =>
      buildLog()
        .lift('2027-01-18', { squat: madeAt(230, 'rir3to4'), bench: madeAt(165, 'rir3to4') })
        .lift('2027-01-20', { squat: madeAt(240, 'rir3to4') })
        .lift('2027-01-22', { squat: missedAt(250), bench: madeAt(170, 'rir3to4') })
        .lift('2027-01-25', { squat: missedAt(250) })
        .lift('2027-01-27', { squat: missed(), bench: missedAt(175) }) // squat resets on 01-27
        .lift('2027-01-29');
    const five = resetRun().lift('2027-02-01', { bench: missedAt(175) });
    expect(five.state('squat')?.lastResetDate).toBe('2027-01-27');
    expect(five.state('bench')?.stage).toBe('BRIDGE_SHORT');
    expect(kinds(five, 'lightWeek')).toHaveLength(1);

    const eight = resetRun().lift('2027-02-04', { bench: missedAt(175) });
    expect(eight.state('bench')?.stage).toBe('BRIDGE_SHORT');
    expect(kinds(eight, 'lightWeek')).toHaveLength(0);
  });

  it('T84 The press gets one round', () => {
    const log = buildLog()
      .lift('2027-01-04')
      .lift('2027-01-08', { press: madeAt(100, 'rir3to4') })
      .lift('2027-01-11')
      .lift('2027-01-15', { press: missedAt(105) })
      .lift('2027-01-18')
      .lift('2027-01-22', { press: missedAt(105) });
    expect(log.state('press')).toMatchObject({ stage: 'BRIDGE_SHORT', next: { weight: 105 } });
    log.lift('2027-01-25').lift('2027-01-29', { press: made() }).lift('2027-02-01').lift('2027-02-05', { press: missed() });
    expect(log.state('press')).toMatchObject({ stage: 'NORMAL', lcw: 92.5, lastResetFrom: 105 });
  });

  it('T91 Power-clean hold', () => {
    const log = buildLog({ setup: { pullChoice: 'powerClean' } })
      .lift('2027-02-03', { powerClean: madeAt(125, 'crisp') })
      .lift('2027-02-05')
      .lift('2027-02-08', { powerClean: made('crisp') })
      .lift('2027-02-10')
      .lift('2027-02-12', { powerClean: missed() })
      .lift('2027-02-15')
      .lift('2027-02-17', { powerClean: missed() });
    expect(log.state('powerClean')).toMatchObject({
      stage: 'HOLD',
      holdUntil: '2027-03-01',
      next: { weight: 135, sets: 5, reps: 3 },
    });
    log.lift('2027-02-19');
    expect(log.liftPlan('2027-02-22', 'powerClean')).toMatchObject({ weight: 135, sets: 5, reps: 3 });
    log.lift('2027-02-22', { powerClean: missed() }).lift('2027-02-26');
    expect(log.liftPlan('2027-03-01', 'powerClean')).toMatchObject({ kind: 'heavy', weight: 135, sets: 5, reps: 3 });
  });

  it('T92 Power-clean food lever', () => {
    const log = buildLog({ setup: { pullChoice: 'powerClean' } });
    for (const d of ['2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13', '2026-11-16']) log.lift(d);
    log
      .lift('2026-11-18', { powerClean: madeAt(125, 'crisp') })
      .lift('2026-11-20')
      .lift('2026-11-23', { powerClean: made('crisp') })
      .lift('2026-11-25')
      .lift('2026-11-27', { powerClean: missed() })
      .lift('2026-11-30')
      .lift('2026-12-02', { powerClean: missed() });
    expect(kinds(log, 'foodLever')).toHaveLength(1);

    log.foodLever('2026-12-02', 'powerClean', true);
    expect(log.state('powerClean')).toMatchObject({ stage: 'REPEAT', next: { weight: 135, sets: 5, reps: 3 } });
    log.lift('2026-12-04').lift('2026-12-07', { powerClean: missed() });
    expect(log.state('powerClean')).toMatchObject({ stage: 'NORMAL', lcw: 120, resetCount: 1 });
    expect(kinds(log, 'foodLever')).toHaveLength(0);
  });

  // Two lifts waiting on "Has recovery felt poor?" at once. B days are left empty.
  function twoPending(): Log {
    return buildLog()
      .lift('2026-11-04')
      .lift('2026-11-06')
      .lift('2026-11-09')
      .lift('2026-11-11', { press: madeAt(100, 'rir3to4'), deadlift: madeAt(250, 'rir3to4') }) // A
      .lift('2026-11-13')
      .lift('2026-11-16', { press: missedAt(105), deadlift: missedAt(265) }) // A: REPEAT
      .lift('2026-11-18')
      .lift('2026-11-20', { press: missed(), deadlift: missed() }) // A: stall, BRIDGE_SHORT
      .lift('2026-11-23')
      .lift('2026-11-25', { press: missed(), deadlift: missed() }); // A: short sets missed, so ask
  }

  it('Q9 One answer covers every lift waiting on it', () => {
    const asked = twoPending();
    expect(kinds(asked, 'foodLever').map((s) => s.lift)).toEqual(['press', 'deadlift']);

    const yes = twoPending().foodLever('2026-11-25', 'press', true);
    expect(yes.program().foodLeverOn).toBe(true);
    expect(yes.state('press')).toMatchObject({ stage: 'BRIDGE_SHORT', pendingFoodLever: null, next: { weight: 105, sets: 5, reps: 3 } });
    expect(yes.state('deadlift')).toMatchObject({ stage: 'BRIDGE_SHORT', pendingFoodLever: null, next: { weight: 265, sets: 2, reps: 3 } });
    expect(kinds(yes, 'foodLever')).toHaveLength(0);
  });

  it('Q10 An open question counts as No once the next lifting session is logged', () => {
    const lapsed = twoPending().lift('2026-11-27'); // B: neither lift runs
    expect(lapsed.program().foodLeverOn).toBe(false);
    expect(lapsed.state('press')).toMatchObject({ stage: 'NORMAL', lcw: 92.5, resetCount: 1 });
    expect(lapsed.state('deadlift')).toMatchObject({ stage: 'NORMAL', lcw: 235, resetCount: 1 });
    expect(kinds(lapsed, 'foodLever')).toHaveLength(0);

    // Answered when that session starts, the answer stands.
    const answered = twoPending().foodLever('2026-11-27', 'press', true).lift('2026-11-27');
    expect(answered.state('press')).toMatchObject({ stage: 'BRIDGE_SHORT', resetCount: 0 });
    expect(answered.state('deadlift')).toMatchObject({ stage: 'BRIDGE_SHORT', resetCount: 0 });
  });

  it('Q19 The early-stall note lasts as long as its stall', () => {
    // Waiting on the question, the stall goes on. The lever or a reset ends it.
    expect(kinds(twoPending(), 'earlyStall').map((s) => s.lift)).toEqual(['press', 'deadlift']);
    expect(kinds(twoPending().foodLever('2026-11-25', 'press', true), 'earlyStall')).toHaveLength(0);
    expect(kinds(twoPending().lift('2026-11-27'), 'earlyStall')).toHaveLength(0);

    // Making the bridge ends it too, but only once the normal sets are made.
    const bridged = buildLog()
      .lift('2026-11-04')
      .lift('2026-11-06')
      .lift('2026-11-09')
      .lift('2026-11-11', { press: madeAt(100, 'rir3to4') })
      .lift('2026-11-13')
      .lift('2026-11-16', { press: missedAt(105) })
      .lift('2026-11-18')
      .lift('2026-11-20', { press: missed() }) // BRIDGE_SHORT: the note shows
      .lift('2026-11-23')
      .lift('2026-11-25', { press: made() }); // 5×3 made: BRIDGE_NORMAL, still on the bridge
    expect(bridged.state('press')?.stage).toBe('BRIDGE_NORMAL');
    expect(kinds(bridged, 'earlyStall').map((s) => s.lift)).toEqual(['press']);
    bridged.lift('2026-11-27').lift('2026-11-30', { press: made('rir1to2') }); // 3×5 made
    expect(bridged.state('press')?.stage).toBe('NORMAL');
    expect(kinds(bridged, 'earlyStall')).toHaveLength(0);
  });
});

function structuredCloneLog(log: Log): Log {
  const copy = Object.assign(Object.create(Object.getPrototypeOf(log) as object) as Log, log);
  copy.events = [...log.events];
  return copy;
}
