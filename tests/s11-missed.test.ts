// RULES.md section 11: missed training.
import { describe, expect, it } from 'vitest';
import type { Settings, SessionPlan } from '../src/engine';
import { PROGRAM, buildLog, cd, made, madeAt, missed, missedAt, plusDays, type Log } from './helpers/log';

const w = (p: SessionPlan) => Object.fromEntries(p.lifts.map((l) => [l.lift, l.weight]));

/** Squat 250, press 100, and deadlift 330 made on `date`. */
function seeded(date: string, settings: Partial<Settings> = {}): Log {
  const log = buildLog({ settings });
  return log.lift(
    date,
    { squat: madeAt(250, 'rir1to2'), press: madeAt(100, 'rir1to2'), deadlift: madeAt(330, 'rir1to2') },
    { workout: 'B' },
  );
}

describe('§11 Missed training', () => {
  it('T63 The table', () => {
    // Monday to Friday, 4 days: normal progression.
    const four = seeded('2027-01-04').plan('2027-01-08');
    expect([four.daysAway, four.missedBand]).toEqual([4, 'normal']);
    expect(w(four)).toEqual({ squat: 255, press: 102.5, deadlift: 340 });

    // Friday to Wednesday, 5 days: normal progression.
    const five = seeded('2027-01-08').plan('2027-01-13');
    expect([five.daysAway, five.missedBand]).toEqual([5, 'normal']);
    expect(w(five).squat).toBe(255);

    // Friday to Friday, 7 days: NORMAL lifts at lcw, ladder lifts at their pending prescription.
    const seven = seeded('2027-01-08')
      .lift('2027-01-11', { deadlift: missedAt(340) }, { workout: 'B' })
      .plan('2027-01-18');
    expect([seven.daysAway, seven.missedBand]).toEqual([7, 'repeat']);
    expect(w(seven)).toEqual({ squat: 250, press: 100, deadlift: 340 });

    // Friday 2027-01-08 to Monday 2027-01-18, 10 days.
    const under40 = seeded('2027-01-08', { ageBracket: 'under40' }).plan('2027-01-18');
    expect([under40.daysAway, under40.missedBand]).toEqual([10, 'drop']);
    expect(w(under40)).toEqual({ squat: 237.5, press: 95, deadlift: 310 });
    const over40 = seeded('2027-01-08', { ageBracket: '40plus' }).plan('2027-01-18');
    expect(w(over40)).toEqual({ squat: 225, press: 90, deadlift: 295 });

    // 30 days.
    const thirty = seeded('2027-01-08').plan('2027-02-07');
    expect([thirty.daysAway, thirty.missedBand]).toEqual([30, 'dropAskWarmup']);
    const squat30 = thirty.lifts.find((l) => l.lift === 'squat');
    expect(squat30?.weight).toBe(225);
    expect(squat30?.warmups.at(-1)).toMatchObject({ weight: 190, reps: 2 });
    expect(squat30?.layoffHeavyWeight).toBe(200);
    const heavy = seeded('2027-01-08').lift('2027-02-07', { squat: made('rir1to2') }, { layoffWarmupHeavy: ['squat'] });
    expect(heavy.sessionOn('2027-02-07').lifts.find((l) => l.lift === 'squat')?.sets[0]?.weight).toBe(200);
    expect(heavy.state('squat')?.lcw).toBe(200);

    // 75 days.
    const seventyFive = seeded('2027-01-08').plan('2027-03-24');
    expect([seventyFive.daysAway, seventyFive.missedBand]).toEqual([75, 'restartLight']);
  });

  it('T63 The table: 75 days starts a fresh novice run', () => {
    // Weights, from 2027-01-08 to 2027-03-24 (a Holy Week Wednesday, so use the
    // engine's state rather than the floor-week plan).
    const log = seeded('2027-01-08');
    const s = (lift: 'squat' | 'press' | 'deadlift') => {
      const plan = log.plan('2027-03-29');
      return plan.lifts.find((l) => l.lift === lift)?.weight;
    };
    expect(log.plan('2027-03-29').daysAway).toBe(80);
    expect(s('squat')).toBe(150);
    expect(s('press')).toBe(60);
    expect(s('deadlift')).toBe(195);

    // Flags clear: a graduated press, a reset squat, and the light squat day.
    const run = buildLog()
      .lift('2027-01-04', { squat: madeAt(240, 'rir3to4') }) // B
      .lift('2027-01-08', { squat: missedAt(250), press: madeAt(100, 'rir3to4') }) // A
      .lift('2027-01-11', { squat: missedAt(250) }) // B: squat stalls
      .lift('2027-01-15', { squat: missed(), press: missedAt(105) }) // A: squat resets to 225
      .lift('2027-01-18', { squat: made('rir1to2') }) // B: 225, a repeat
      .lift('2027-01-22', { squat: made('rir1to2'), press: missedAt(105) }) // A: 230; press stalls
      .lift('2027-01-25', { squat: made('rir1to2') }) // B: 235, light squat day switches on
      .lift('2027-01-29', { press: missed() }) // A: press resets to 92.5
      .lift('2027-02-01')
      .lift('2027-02-05', { press: made('rir1to2') }) // A: 92.5, next 95
      .lift('2027-02-08')
      .lift('2027-02-12', { press: missed() })
      .lift('2027-02-15')
      .lift('2027-02-19', { press: missed() }); // A: stall at 95, at or below 105: graduated
    expect(run.state('press')?.stage).toBe('GRADUATED');
    expect(run.state('squat')).toMatchObject({ resetCount: 1, hasMissed: true, lightDayOn: true });

    const back = plusDays('2027-02-19', 75);
    run.lift(back, {});
    const press = run.state('press');
    const squat = run.state('squat');
    expect(press).toMatchObject({ stage: 'NORMAL', resetCount: 0, lastResetFrom: null, hasMissed: false });
    expect(squat).toMatchObject({ resetCount: 0, lastResetFrom: null, hasMissed: false, lightDayOn: false });
  });

  it('T64 Lifts not in the return session', () => {
    const log = buildLog({ settings: { ageBracket: 'under40' } })
      .lift('2027-01-08', { bench: madeAt(180, 'rir1to2') }, { workout: 'B' })
      .lift('2027-01-18');
    expect(log.sessionOn('2027-01-18').workout).toBe('A');
    expect(log.state('bench')?.lcw).toBe(170);
    expect(log.liftPlan('2027-01-20', 'bench').weight).toBe(170);
  });

  it('T65 Age bracket unset', () => {
    const plan = seeded('2027-01-08').plan('2027-01-18');
    expect(w(plan).squat).toBe(225);
  });

  it('T66 Chins after a layoff', () => {
    // The override follows the 2027-01-08 session, which is itself a long-layoff return.
    const base = () => buildLog().lift('2027-01-08', {}, { workout: 'B' }).override('2027-01-08', 'chin', 'assistance', 120);
    expect(base().plan('2027-01-18').assist?.chin?.assistance).toBe(130);
    expect(base().plan('2027-02-07').assist?.chin?.assistance).toBe(140);
    // 75 days after 01-08 falls in Holy Week, a floor week with no chins or dips,
    // so the long layoff counts from a session on 01-13.
    const long = base().lift('2027-01-13').plan('2027-03-29');
    expect(long.assist?.chin?.calibration).toBeTruthy();
    expect(long.assist?.dip?.calibration).toBeTruthy();
    const dipped = buildLog()
      .lift('2026-11-04', { dip: cd.calibrate(120, 2) })
      .plan('2027-01-25');
    expect(dipped.assist?.dip?.calibration).toBeTruthy();
  });

  it('T70 Paused for two weeks', () => {
    const log = buildLog()
      .lift('2026-12-30', { squat: madeAt(200, 'rir1to2') })
      .lift('2027-01-01', { squat: made('rir1to2'), press: madeAt(100, 'rir1to2') })
      .lift('2027-01-04', { squat: made('rir1to2') }, { checkIns: { jointPain: ['press'] } })
      .lift('2027-01-06', { squat: made('rir1to2') }, { painAnswers: { press: 'stillThere' } })
      .lift('2027-01-08', { squat: made('rir1to2') })
      .lift('2027-01-11', { squat: made('rir1to2') }, { painAnswers: { press: 'stillThere' } })
      .lift('2027-01-15', { squat: made('rir1to2') });
    expect(log.state('press')?.pain).toBe('paused');
    const squatNext = log.state('squat')?.next?.weight;

    const plan = log.plan('2027-01-18', { painAnswers: { press: 'gone' } });
    expect(plan.workout).toBe('A');
    expect(plan.daysAway).toBe(3);
    // Age bracket unset: 10% for 8 to 21 days, then the 90% return session.
    expect(plan.lifts.find((l) => l.lift === 'press')).toMatchObject({ kind: 'painReturn', weight: 80, sets: 3, reps: 5 });
    expect(plan.lifts.find((l) => l.lift === 'squat')?.weight).toBe(squatNext);
  });

  it('T96 Chins recalibrate from 30 lb more', () => {
    // 2027-01-13 to 03-29 is 75 days.
    const at120 = buildLog()
      .lift('2027-01-08', {}, { workout: 'B' })
      .override('2027-01-08', 'chin', 'assistance', 120)
      .lift('2027-01-13');
    const plan = at120.plan('2027-03-29');
    expect(plan.assist?.chin?.calibration?.start).toBe(150);
    expect(plan.assist?.dip?.calibration?.start).toBe(150);

    const belted = buildLog()
      .lift('2027-01-08', {}, { workout: 'B' })
      .override('2027-01-08', 'chin', 'assistance', 0)
      .lift('2027-01-11', { chin: cd.reps([5, 5, 5]) })
      .lift('2027-01-13', { chin: cd.made(0) });
    expect(belted.assist('chin')).toMatchObject({ mode: 'WEIGHTED', addedLoad: 5 });
    expect(belted.plan('2027-03-29').assist?.chin?.calibration?.start).toBe(25);
  });

  // The press graduates at 95 on 2027-02-19, its last completed weight 92.5.
  function graduatedPress(): Log {
    return buildLog()
      .lift('2027-01-04')
      .lift('2027-01-08', { press: madeAt(100, 'rir3to4') })
      .lift('2027-01-11')
      .lift('2027-01-15', { press: missedAt(105) })
      .lift('2027-01-18')
      .lift('2027-01-22', { press: missedAt(105) })
      .lift('2027-01-25')
      .lift('2027-01-29', { press: missed() }) // reset to 92.5
      .lift('2027-02-01')
      .lift('2027-02-05', { press: made('rir1to2') })
      .lift('2027-02-08')
      .lift('2027-02-12', { press: missed() })
      .lift('2027-02-15')
      .lift('2027-02-19', { press: missed() });
  }

  it('Q14 A graduated lift stays graduated through a short layoff', () => {
    const log = graduatedPress();
    expect(log.state('press')).toMatchObject({ stage: 'GRADUATED', lastCompleted: { weight: 92.5 } });
    log.lift('2027-03-01'); // 10 days away
    expect(log.state('press')?.stage).toBe('GRADUATED');
    expect(log.liftPlan('2027-03-03', 'press')).toMatchObject({ kind: 'graduated', weight: 82.5, sets: 3, reps: 5 });
    expect(log.day('2027-03-03').summary).toContain('Press 3×5 · 82.5 · graduated');
    // Only the prefill drops: the restart suggestion still works from 92.5 (Q17).
    expect(log.state('press')?.lastCompleted).toEqual({ weight: 92.5, sets: 3, reps: 5 });

    // More than 60 days starts a fresh run, and the graduation note goes with it.
    const fresh = graduatedPress().lift('2027-04-26');
    expect(fresh.state('press')?.stage).toBe('NORMAL');
    expect(fresh.suggestions().some((s) => s.kind === 'graduation')).toBe(false);
  });

  it('Q16 A fresh run clears "not crisp"', () => {
    const log = buildLog();
    for (const d of ['2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13', '2026-11-16']) log.lift(d);
    log.lift('2026-11-18', { row: madeAt(135, 'notCrisp') });
    expect(log.state('row')).toMatchObject({ hasBeenNotCrisp: true, next: { weight: 137.5 } });
    log.lift('2027-02-01'); // 75 days away
    expect(log.state('row')).toMatchObject({ hasBeenNotCrisp: false, lcw: 80 });
    log.lift('2027-02-03', { row: made('crisp') });
    expect(log.state('row')).toMatchObject({ lcw: 80, next: { weight: 85 } });
  });

  it('asks "Did that warm-up feel heavy?" once per lift after a layoff', () => {
    // 35 days after Monday, November 2: the 22-to-60-day band.
    expect(buildLog().liftPlan('2026-12-07', 'squat')).toMatchObject({ weight: 85, layoffHeavyWeight: 75 });
    const log = buildLog().lift('2026-12-07', { squat: made('rir3to4') }); // asked, and the answer was no
    expect(log.liftPlan('2026-12-09', 'squat').layoffHeavyWeight).toBeNull();
    // The press wasn't in that session, so its own first session back asks.
    expect(log.liftPlan('2026-12-09', 'press').layoffHeavyWeight).toBe(50);
    log.lift('2026-12-09', { squat: made('rir3to4'), press: made('rir3to4') }).lift('2026-12-11');
    expect(log.liftPlan('2026-12-14', 'press').layoffHeavyWeight).toBeNull();
  });

  it('words a recalibration for each movement', () => {
    const plan = buildLog().plan('2027-01-11'); // more than 60 days away; chins were at 155
    expect(plan.assist?.chin?.calibration?.instructions).toBe(
      'Start at 185 lb of help. Sets of up to 5, taking off 10 lb a set (5 lb once it feels close), until 5 solid reps leave 2 or 3 to spare.',
    );
    expect(plan.assist?.dip?.calibration?.instructions).toMatch(/^Start at 185 lb of help\. Sets of up to 5.*stopping at upper arms parallel\.$/);
    // Day one keeps program.json's dip wording.
    expect(buildLog().plan('2026-11-04').assist?.dip?.calibration?.instructions).toBe(PROGRAM.assistance.calibration.dip);
  });
});
