// The session screens' drafts (SPEC.md sections 3, 5.3, and 5.4): what the
// screens log after a run of taps must be what the engine's scenarios log, so
// a week clicked through the app matches the engine's prescriptions (CLAUDE.md, M3).
import { describe, expect, it } from 'vitest';
import {
  assistStates,
  liftStates,
  planFor,
  type AnyEvent,
  type BarbellLiftId,
  type EffortRating,
  type LiftPlan,
} from '../src/engine';
import {
  assistCalibrationNeeded,
  assistCalibrationStep,
  assistRows,
  missingRatings,
  missingSpare,
  newLiftingDraft,
  rampVerdict,
  sessionPlan,
  setEffort,
  setSpare,
  tapAssistRow,
  tapSet,
  toLiftingEvent,
  toggleWarmup,
  lowerReps,
  missedRestSec,
  rateRest,
  restAfterMiss,
  startTimer,
  toggleFormBroke,
  toggleSkipped,
  togglePainStop,
  wantsRating,
  type LiftingDraft,
} from '../src/ui/session/lifting';
import {
  conditioningPlanOf,
  elapsedSec,
  finish,
  newConditioningDraft,
  pause,
  positionAt,
  restart,
  resume,
  start,
  timeline,
  toConditioningEvent,
  type ConditioningDraft,
} from '../src/ui/session/conditioning';
import { PROGRAM, buildLog, calibrate, cd, made, type Log } from './helpers/log';

const T0 = '2026-11-04T17:00:00.000Z';
const at = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString();

function push(log: Log, ev: object): void {
  log.events.push({ ...ev, ...log.stamp() } as AnyEvent);
}

/** Every set made with one tap, bench ramps 45-65-85-105-115, dips settle at 120 with 2 to spare. */
function tapThrough(log: Log, date: string, efforts: Partial<Record<BarbellLiftId, EffortRating>>): LiftingDraft {
  let d: LiftingDraft = {
    ...newLiftingDraft(date, false),
    answers: { lastNightUnder6: false, mostNightsUnder7: false, jointPain: false },
    step: 'lifting',
    startedAt: T0,
    bikeDone: true,
  };
  const input = log.input(date);
  const plan = sessionPlan(input, d);
  const lift = (id: BarbellLiftId) => sessionPlan(input, d).lifts.find((l) => l.lift === id) as LiftPlan;
  for (const lp of plan.lifts) {
    lp.warmups.forEach((_, i) => (d = toggleWarmup(d, lp, i)));
    if (lp.kind === 'calibration') {
      for (const v of ['fast', 'fast', 'fast', 'slowing', 'slowed'] as const) d = rampVerdict(d, lp, v);
    }
    const sets = d.lifts[lp.lift]?.sets ?? [];
    sets.forEach((s, i) => {
      if (s.state === 'todo') d = tapSet(d, lift(lp.lift), i);
    });
    if (wantsRating(lp, d.lifts[lp.lift]!)) d = setEffort(d, lp, efforts[lp.lift] ?? 'rir3to4');
  }
  const a = plan.assist;
  if (a) {
    for (const m of [a.chin, a.dip]) {
      if (m && assistCalibrationNeeded(m, d)) {
        for (const step of ['more', 'more', 'more', 'close', 'settle'] as const) d = assistCalibrationStep(d, m, step);
      }
    }
    assistRows(plan, d).forEach((_, i) => (d = tapAssistRow(plan, d, i)));
    expect(missingSpare(plan, d).map((m) => m.lift)).toEqual([a.chin, a.dip].filter(Boolean).map((m) => m!.lift));
    if (a.chin) d = setSpare(d, 'chin', 2);
    if (a.dip) d = setSpare(d, 'dip', 2);
    expect(missingSpare(plan, d)).toEqual([]);
  }
  d = { ...d, warmupsHeavy: false };
  expect(missingRatings(sessionPlan(input, d), d)).toEqual([]);
  push(log, toLiftingEvent(sessionPlan(input, d), d, { endedAt: at(60) }));
  return d;
}

function condThrough(log: Log, date: string): void {
  const input = log.input(date);
  let d: ConditioningDraft = { ...newConditioningDraft(date, false), shortNight: false };
  const plan = conditioningPlanOf(input, d);
  d = start(d, T0);
  d = finish(d, plan, PROGRAM, at(plan.targetMinutes));
  push(log, toConditioningEvent(plan, d));
}

const ramp = calibrate(
  [
    [45, 'fast'],
    [65, 'fast'],
    [85, 'fast'],
    [105, 'slowing'],
    [115, 'slowed'],
  ],
  { effort: 'rir3to4' },
);

describe('Session drafts', () => {
  it('a week clicked through from 2026-11-02 matches the engine', () => {
    const app = buildLog();
    expect(planFor(app.input('2026-11-03'), '2026-11-03').kind).toBe('conditioning');
    condThrough(app, '2026-11-03');
    tapThrough(app, '2026-11-04', {});
    condThrough(app, '2026-11-05');
    tapThrough(app, '2026-11-06', {});

    const engine = buildLog()
      .cond('2026-11-03')
      .lift('2026-11-04', { squat: made('rir3to4'), bench: ramp, deadlift: made('rir3to4'), chin: cd.made(2), dip: cd.calibrate(120, 2) })
      .cond('2026-11-05')
      .lift('2026-11-06', { squat: made('rir3to4'), press: made('rir3to4'), deadlift: made('rir3to4'), chin: cd.made(2), dip: cd.made(2) });

    expect(liftStates(app.input('2026-11-08'))).toEqual(liftStates(engine.input('2026-11-08')));
    expect(assistStates(app.input('2026-11-08'))).toEqual(assistStates(engine.input('2026-11-08')));
    expect(app.plan('2026-11-09')).toEqual(engine.plan('2026-11-09'));
    expect(app.week('2026-11-02', '2026-11-08')).toMatchObject({ liftingDone: 3, conditioningDone: 2, conditioningMinutes: 40 });
    expect(app.liftPlan('2026-11-09', 'squat')).toMatchObject({ weight: 125, sets: 3, reps: 5 });
  });

  it('logs short, form-broke, skipped, and pain-stopped sets the way the rules read them', () => {
    const log = buildLog();
    const input = log.input('2026-11-04');
    let d: LiftingDraft = { ...newLiftingDraft('2026-11-04', false), step: 'lifting', answers: { jointPain: false } };
    const plan = sessionPlan(input, d);
    const squat = plan.lifts.find((l) => l.lift === 'squat')!;
    const deadlift = plan.lifts.find((l) => l.lift === 'deadlift')!;
    d = tapSet(d, squat, 0);
    d = tapSet(d, squat, 1);
    d = lowerReps(d, squat, 2); // 4 reps
    expect(wantsRating(squat, d.lifts.squat!)).toBe(false); // missed: no chips
    d = togglePainStop(d, deadlift);
    const ev = toLiftingEvent(plan, d);
    const sq = ev.lifts.find((l) => l.lift === 'squat')!;
    expect(sq).toMatchObject({ effort: 'missed', sets: [{ reps: 5 }, { reps: 5 }, { reps: 4 }] });
    expect(ev.lifts.find((l) => l.lift === 'deadlift')).toMatchObject({ painStop: true, sets: [] });
    expect(ev.lifts.find((l) => l.lift === 'bench')).toMatchObject({ notReached: true });

    // Skipped and untouched sets aren't misses: the lift repeats (section 4).
    let e: LiftingDraft = { ...newLiftingDraft('2026-11-04', false), step: 'lifting' };
    e = tapSet(e, squat, 0);
    e = toggleSkipped(e, squat, 1);
    const ev2 = toLiftingEvent(plan, e);
    expect(ev2.lifts.find((l) => l.lift === 'squat')?.sets).toEqual([
      { weight: 105, reps: 5 },
      { weight: 105, reps: 0, skipped: true },
      { weight: 105, reps: 0, skipped: true },
    ]);
    push(log, ev2);
    expect(log.state('squat')).toMatchObject({ lcw: 95, next: { weight: 105 } });
  });

  it('a past-date entry has no clock or rest timer', () => {
    const log = buildLog();
    let d = newLiftingDraft('2026-11-04', true);
    const plan = sessionPlan(log.input('2026-11-10'), d);
    d = tapSet(d, plan.lifts[0]!, 0);
    expect(d.timer).toBeNull();
    const ev = toLiftingEvent(plan, { ...d, startedAt: T0 }, { endedAt: at(60) });
    expect(ev).not.toHaveProperty('startedAt');
    expect(ev).not.toHaveProperty('endedAt');
    expect(ev.date).toBe('2026-11-04');
  });

  it('the conditioning timer runs from timestamps through its segments', () => {
    const log = buildLog().condWeek('2026-11-02').condWeek('2026-11-09').ack('2026-11-16');
    let d: ConditioningDraft = { ...newConditioningDraft('2026-11-19', false), shortNight: false };
    const plan = conditioningPlanOf(log.input('2026-11-19'), d);
    const segs = timeline(plan, PROGRAM);
    expect(segs.map((s) => [s.kind, s.sec])).toEqual([
      ['easy', 540],
      ...Array.from({ length: 6 }, () => [
        ['hard', 30],
        ['recover', 90],
      ]).flat(),
      ['easy', 540],
    ]);
    d = start(d, T0);
    expect(positionAt(segs, elapsedSec(d, at(9.25)))).toMatchObject({ index: 1, remainingSec: 15, intervalsDone: 0 });
    d = pause(d, at(10));
    d = resume(d, at(15)); // five minutes paused don't count
    expect(elapsedSec(d, at(20))).toBe(15 * 60);
    expect(positionAt(segs, elapsedSec(d, at(20)))).toMatchObject({ intervalsDone: 3 });
    d = finish(d, plan, PROGRAM, at(45));
    expect(d).toMatchObject({ actualMinutes: 30, intervalsDone: 6 });
    expect(toConditioningEvent(plan, d)).toMatchObject({ intervalsPlanned: 6, intervalsDone: 6, actualMinutes: 30, targetMinutes: 30 });
  });

  it('restarting the conditioning timer goes back to zero on the Start screen', () => {
    let d: ConditioningDraft = { ...newConditioningDraft('2026-11-03', false), shortNight: false, targetMinutes: 25 };
    d = start(d, T0);
    d = pause(d, at(3));
    expect(elapsedSec(d, at(4))).toBe(3 * 60);
    d = restart(d);
    expect(d).toMatchObject({ step: 'setup', startedAt: null, pausedAt: null, pausedSec: 0, targetMinutes: 25 });
    expect(elapsedSec(d, at(10))).toBe(0);
    d = start(d, at(10)); // the real start, seven minutes later
    expect(elapsedSec(d, at(12))).toBe(2 * 60);
  });

  it('Q23 rests from the set just done, and a short set rests like a miss', () => {
    const log = buildLog({ setup: { squat: 'rir3to4' } });
    let d: LiftingDraft = { ...newLiftingDraft('2026-11-04', false), step: 'lifting', startedAt: T0 };
    const squat = () => sessionPlan(log.input('2026-11-04'), d).lifts.find((l) => l.lift === 'squat') as LiftPlan;
    expect(squat()).toMatchObject({ restSec: 150, shortSets: false });

    // Set 1 felt harder than Monday's rating: 1–2 left takes 3:30, counted from when the set was logged.
    d = startTimer(tapSet(d, squat(), 0), 'Squat', squat().restSec, T0, 'squat');
    d = rateRest(d, squat(), 'rir1to2', PROGRAM);
    expect(d.timer).toMatchObject({ durationSec: 210, adjustSec: 0, effort: 'rir1to2', startedAt: T0, lift: 'squat' });
    expect(d.lifts.squat!.effort).toBeNull();

    // The last set: a grind takes 5:00, and the empty rating takes the answer.
    d = tapSet(tapSet(d, squat(), 1), squat(), 2);
    d = rateRest(startTimer(d, 'Squat', squat().restSec, at(8), 'squat'), squat(), 'grind', PROGRAM);
    expect(d.timer?.durationSec).toBe(300);
    expect(d.lifts.squat!.effort).toBe('grind');
    // A rating already set stays as he left it.
    d = rateRest(setEffort(d, squat(), 'rir1to2'), squat(), 'light', PROGRAM);
    expect(d.lifts.squat!.effort).toBe('rir1to2');
    expect(d.timer?.durationSec).toBe(120);

    // Another lift's rest is left alone, and bridge short sets keep their 5:00 floor.
    const other = startTimer(d, 'Bench press', 120, at(12), 'bench');
    expect(rateRest(other, squat(), 'grind', PROGRAM).timer).toEqual(other.timer);
    expect(rateRest(startTimer(d, 'Squat', 300, at(12), 'squat'), { ...squat(), shortSets: true }, 'light', PROGRAM).timer?.durationSec).toBe(300);

    // A short set, or one that broke form, rests 5:00.
    expect(missedRestSec(squat(), PROGRAM)).toBe(300);
    let e: LiftingDraft = { ...newLiftingDraft('2026-11-04', false), step: 'lifting', startedAt: T0 };
    e = startTimer(tapSet(e, squat(), 0), 'Squat', squat().restSec, T0, 'squat');
    expect(restAfterMiss(toggleFormBroke(e, squat(), 0), squat(), PROGRAM).timer?.durationSec).toBe(300);
    expect(restAfterMiss(lowerReps(e, squat(), 0), squat(), PROGRAM).timer).toMatchObject({ durationSec: 300, startedAt: T0 });
  });
});
