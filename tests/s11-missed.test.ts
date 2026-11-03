// RULES.md section 11: missed training.
import { describe, expect, it } from 'vitest';
import type { Settings, SessionPlan } from '../src/engine';
import { buildLog, cd, made, madeAt, missed, missedAt, plusDays, type Log } from './helpers/log';

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
    const long = base().plan('2027-03-24');
    expect(long.assist?.chin?.calibration).not.toBeNull();
    expect(long.assist?.dip?.calibration).not.toBeNull();
    const dipped = buildLog()
      .lift('2026-11-04', { dip: cd.calibrate(120, 2) })
      .plan('2027-01-25');
    expect(dipped.assist?.dip?.calibration).not.toBeNull();
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
});
