// Time budget and rest timer (RULES.md section 14). Stub until M1c.
import type { SessionPlan } from './planTypes';
import type { BarbellLiftId, EffortRating, IsoTimestamp, Program } from './types';
export interface TimerState { startedAt: IsoTimestamp; durationSec: number; adjustSec: number }
export interface SessionProgress {
  bikeDone: boolean;
  warmupsDone: Partial<Record<BarbellLiftId, number>>;
  workSetsDone: Partial<Record<BarbellLiftId, number>>;
  assistSetsDone: number;
  spinDone: boolean;
}
const todo = (): never => { throw new Error('not implemented'); };
export function timerRemainingSec(_timer: TimerState, _nowIso: IsoTimestamp): number { return todo(); }
export function restDefaultSec(_lastEffort: EffortRating | null, _opts: { shortSets?: boolean; assistBlock?: boolean }, _program: Program): number { return todo(); }
export function timeGuard(
  _plan: SessionPlan,
  _progress: SessionProgress,
  _elapsedSec: number,
  _cutsApplied: number,
  _program: Program,
): { projectedMin: number; nextCut: 1 | 2 | 3 | null; nextCutText: string | null; projectedAfterNextCutMin: number | null } { return todo(); }
