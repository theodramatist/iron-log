// RULES.md section 12: pain and safety.
import { describe, expect, it } from 'vitest';
import { PROGRAM, buildLog, made, madeAt, painStop } from './helpers/log';

describe('§12 Pain and safety', () => {
  /** Press lcw 100 on Friday 11-06, then a pain stop after set 1 on Wednesday 11-11. */
  const paused = () =>
    buildLog()
      .lift('2026-11-04')
      .lift('2026-11-06', { press: madeAt(100, 'rir1to2') })
      .lift('2026-11-09')
      .lift('2026-11-11', { squat: made('rir3to4'), press: painStop(1) });

  it('T67 Pain stop and return', () => {
    const log = paused();
    expect(log.state('press')).toMatchObject({ pain: 'paused', lcw: 100, stage: 'NORMAL', next: { weight: 102.5 } });
    expect(log.state('squat')?.history.at(-1)?.date).toBe('2026-11-11');
    log.lift('2026-11-13');

    // The next A: "Is the press pain gone?"
    const asked = log.plan('2026-11-16');
    expect(asked.workout).toBe('A');
    expect(asked.lifts.some((l) => l.lift === 'press')).toBe(false);
    expect(asked.paused).toEqual([
      expect.objectContaining({ lift: 'press', question: 'Is the press pain gone?' }),
    ]);

    // Yes: one return session at 90%, which moves nothing.
    const yes = paused().lift('2026-11-13');
    expect(yes.liftPlan('2026-11-16', 'press', { painAnswers: { press: 'gone' } })).toMatchObject({
      kind: 'painReturn',
      weight: 90,
      sets: 3,
      reps: 5,
    });
    yes.lift('2026-11-16', { press: made() }, { painAnswers: { press: 'gone' } });
    expect(yes.state('press')).toMatchObject({ pain: 'none', lcw: 100, next: { weight: 102.5 } });
    yes.lift('2026-11-18');
    expect(yes.liftPlan('2026-11-20', 'press')).toMatchObject({ kind: 'heavy', weight: 102.5 });

    // No: still paused, see a clinician, and a clearance starts the return.
    const no = paused().lift('2026-11-13');
    const stillThere = no.plan('2026-11-16', { painAnswers: { press: 'stillThere' } });
    expect(stillThere.paused[0]?.message).toBe(PROGRAM.safety.pausedLiftStillThere);
    no.lift('2026-11-16', {}, { painAnswers: { press: 'stillThere' } });
    expect(no.state('press')?.pain).toBe('paused');
    no.painCleared('2026-11-17', 'press', 'clinician').lift('2026-11-18');
    expect(no.state('press')?.pain).toBe('returning');
    // Back on 11-20, nine days after its last heavy session (11-11), so the
    // section 11 drop comes first (age unset: 100 to 90), then the 90% return: 80.
    expect(no.liftPlan('2026-11-20', 'press')).toMatchObject({ kind: 'painReturn', weight: 80 });

    for (const l of [log, yes, no]) expect(l.suggestions().some((s) => s.kind === 'lightWeek')).toBe(false);
  });

  it('T68 Joint pain at check-in', () => {
    const log = buildLog();
    const plan = log.plan('2026-11-04', { checkIns: { jointPain: ['squat'] } });
    expect(plan.lifts.some((l) => l.lift === 'squat')).toBe(false);
    expect(plan.paused.map((p) => p.lift)).toEqual(['squat']);
    log.lift('2026-11-04', {}, { checkIns: { jointPain: ['squat'] } });
    expect(log.state('squat')?.pain).toBe('paused');
  });

  it('T69 Stop session', () => {
    expect(PROGRAM.safety.stopSessionMessage).toBe(
      "Stop now. Chest pain that doesn't ease within a few minutes of stopping is a 911 call. Get checked before training again.",
    );
    const log = buildLog();
    const before = log.state('squat');
    log.lift('2026-11-04', { squat: made('light') }, { stopped: true });
    expect(log.state('squat')).toEqual(before);
    const next = log.plan('2026-11-06');
    expect(next.workout).toBe('B');
    expect(next.daysAway).toBe(4);
  });

  it('T71 Soreness note', () => {
    const note = PROGRAM.safety.sorenessNote;
    const log = buildLog();
    expect(log.plan('2026-11-04').notes).toContain(note);
    expect(log.plan('2026-11-13').notes).toContain(note);
    expect(log.plan('2026-11-16').notes).not.toContain(note);
    expect(log.day('2026-11-03').notes).toContain(note);
    expect(log.day('2026-11-16').notes).not.toContain(note);
  });

  it('Q21 A pain return in a light or floor week takes the week\'s sets', () => {
    const gone = { painAnswers: { squat: 'gone' as const } };
    const light = buildLog().lift('2026-11-04', { squat: painStop(1) }).declare('2026-11-06', 'light');
    expect(light.liftPlan('2026-11-06', 'squat', gone)).toMatchObject({ kind: 'painReturn', weight: 85, sets: 2, reps: 5 });
    light.lift('2026-11-06', { squat: made() }, gone);
    expect(light.state('squat')?.pain).toBe('none');

    const floor = buildLog().lift('2026-11-04', { squat: painStop(1) }).declare('2026-11-06', 'floor');
    expect(floor.liftPlan('2026-11-06', 'squat', gone)).toMatchObject({ kind: 'painReturn', weight: 85, sets: 2, reps: 5 });

    // In a normal week it's the normal sets, and the day says it's the return.
    const normal = buildLog().lift('2026-11-04', { squat: painStop(1) }).painCleared('2026-11-05', 'squat', 'clinician');
    expect(normal.liftPlan('2026-11-06', 'squat')).toMatchObject({ kind: 'painReturn', weight: 85, sets: 3, reps: 5 });
    expect(normal.day('2026-11-06').summary).toContain('Squat 3×5 · 85 · return at 90%');
  });
});
