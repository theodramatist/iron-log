// RULES.md section 14: time budget and rest timer.
import { describe, expect, it } from 'vitest';
import { restDefaultSec, timeGuard, timerRemainingSec, type SessionProgress } from '../src/engine';
import { createRepository, memoryAdapter } from '../src/data';
import { clock } from '../src/ui/format';
import { newLiftingDraft, sessionPlan, startTimer, tapSet, type LiftingDraft } from '../src/ui/session/lifting';
import { PROGRAM, buildLog, plusDays } from './helpers/log';

const empty: SessionProgress = { bikeDone: false, warmupsDone: {}, workSetsDone: {}, assistSetsDone: 0, spinDone: false };

describe('§14 Time budget and rest timer', () => {
  it('T76 Rest defaults', () => {
    expect(restDefaultSec('rir1to2', {}, PROGRAM)).toBe(210);
    expect(restDefaultSec(null, {}, PROGRAM)).toBe(120);
    expect(restDefaultSec('light', { shortSets: true }, PROGRAM)).toBe(300);
    expect(restDefaultSec(null, { assistBlock: true }, PROGRAM)).toBe(75);
    expect(restDefaultSec('light', {}, PROGRAM)).toBe(120);
    expect(restDefaultSec('rir3to4', {}, PROGRAM)).toBe(150);
    expect(restDefaultSec('grind', {}, PROGRAM)).toBe(300);
    expect(restDefaultSec('missed', {}, PROGRAM)).toBe(300);
    expect(restDefaultSec('crisp', {}, PROGRAM)).toBe(150); // Q3
    expect(restDefaultSec('notCrisp', {}, PROGRAM)).toBe(210);

    const plan = buildLog({ setup: { squat: 'rir1to2' } }).plan('2026-11-04');
    expect(plan.lifts.find((l) => l.lift === 'squat')?.restSec).toBe(210);
    expect(plan.lifts.find((l) => l.lift === 'bench')?.restSec).toBe(120);
    expect(plan.assist?.restSec).toBe(75);
  });

  it('T77 Timer accuracy', async () => {
    // A 3:30 rest: the squat's last rating was 1-2 left.
    const log = buildLog({ setup: { squat: 'rir1to2' } });
    const input = log.input('2026-11-04');
    let draft: LiftingDraft = { ...newLiftingDraft('2026-11-04', false), step: 'lifting', startedAt: '2026-11-04T17:00:00.000Z' };
    const squat = sessionPlan(input, draft).lifts.find((l) => l.lift === 'squat')!;
    draft = tapSet(draft, squat, 0);
    draft = startTimer(draft, 'Squat', squat.restSec, '2026-11-04T17:10:00.000Z');
    expect(clock(timerRemainingSec(draft.timer!, '2026-11-04T17:10:00.000Z'))).toBe('3:30');

    // The app goes to the background for 2 minutes, and iOS may drop the page:
    // only the saved draft comes back.
    const repo = createRepository(memoryAdapter(), PROGRAM);
    await repo.saveDraft('lifting', draft);
    const back = (await repo.getDraft<LiftingDraft>('lifting'))!.data;
    expect(clock(timerRemainingSec(back.timer!, '2026-11-04T17:12:00.000Z'))).toBe('1:30');
  });

  it('computes remaining rest from timestamps, not ticks', () => {
    const timer = { startedAt: '2026-11-04T18:00:00.000Z', durationSec: 210, adjustSec: 0 };
    expect(timerRemainingSec(timer, '2026-11-04T18:02:00.000Z')).toBe(90);
    expect(timerRemainingSec({ ...timer, adjustSec: 30 }, '2026-11-04T18:02:00.000Z')).toBe(120);
    expect(timerRemainingSec(timer, '2026-11-04T18:10:00.000Z')).toBe(0);
  });

  it('T78 Time projection', () => {
    const log = buildLog();
    for (let i = 0; i < 4; i++) log.condWeek(plusDays('2026-11-02', i * 7));
    const plan = log.plan('2026-11-30');
    expect(plan.afterLiftingSpin).not.toBeNull();

    const base = timeGuard(plan, empty, 0, 0, PROGRAM).projectedMin;
    const at84 = timeGuard(plan, empty, (84 - base) * 60, 0, PROGRAM);
    expect(at84.projectedMin).toBeCloseTo(84, 5);
    expect(at84.nextCut).toBe(1);
    expect(at84.nextCutText).toBe(PROGRAM.timeBudget.cutOrder[0]);
    expect(timeGuard(plan, empty, (84 - base) * 60, 1, PROGRAM).nextCut).toBeNull();

    const elapsed = (100 - base) * 60;
    const steps: (number | null)[] = [];
    for (let cuts = 0; cuts <= 3; cuts++) steps.push(timeGuard(plan, empty, elapsed, cuts, PROGRAM).nextCut);
    expect(steps).toEqual([1, 2, 3, null]);
    expect(timeGuard(plan, empty, elapsed, 1, PROGRAM).nextCutText).toBe(PROGRAM.timeBudget.cutOrder[1]);
    expect(timeGuard(plan, empty, elapsed, 2, PROGRAM).nextCutText).toBe(PROGRAM.timeBudget.cutOrder[2]);

    // No step shortens a squat or deadlift rest.
    for (const text of PROGRAM.timeBudget.cutOrder) expect(text).not.toMatch(/squat|deadlift/i);
    const restsBefore = plan.lifts.map((l) => l.restSec);
    timeGuard(plan, empty, elapsed, 3, PROGRAM);
    expect(plan.lifts.map((l) => l.restSec)).toEqual(restsBefore);
  });

  it('offers the after-lifting spin only if the session still ends inside 80 minutes', () => {
    const log = buildLog();
    for (let i = 0; i < 4; i++) log.condWeek(plusDays('2026-11-02', i * 7));
    const plan = log.plan('2026-11-30');
    const g = timeGuard(plan, empty, 0, 0, PROGRAM);
    expect(g.projectedMin).toBeLessThanOrEqual(80);
  });
});
