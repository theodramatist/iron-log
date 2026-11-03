// Calibration (RULES.md section 9). Stub until M1c.
import type { CalibrationSetLog, Program } from './types';
export type CalibratedLift = 'bench' | 'row' | 'powerClean';
export function calibrationNextWeight(_prev: number, _verdict: 'fast' | 'slowing', _lift: CalibratedLift, _program: Program): number {
  throw new Error('not implemented');
}
export function calibrationOutcome(
  _sets: CalibrationSetLog[],
  _lift: CalibratedLift,
  _program: Program,
): { workWeight: number; rampSetIsFirstWorkSet: boolean; workSetsRemaining: number } | null {
  throw new Error('not implemented');
}
export function dipCalibrationNext(_prevAssistance: number, _close: boolean): number {
  throw new Error('not implemented');
}
