// Loads, plates, and rounding (RULES.md section 3). Stub until M1c.
import type { BarbellLiftId, PlatePair, Settings } from './types';

export interface Inventory {
  barLb: number;
  plates: PlatePair[];
}
const todo = (): never => {
  throw new Error('not implemented');
};
export function inventoryFrom(settings: Pick<Settings, 'barLb' | 'plates'>): Inventory {
  return { barLb: settings.barLb, plates: settings.plates };
}
export function isLoadable(_total: number, _inv: Inventory): boolean { return todo(); }
export function platesPerSide(_total: number, _inv: Inventory): number[] | null { return todo(); }
export function loadableBetween(_lo: number, _hi: number, _inv: Inventory): number[] { return todo(); }
export function progressionWeight(_lcw: number, _jump: number, _inv: Inventory): { weight: number; note: string | null } { return todo(); }
export function percentWeight(_base: number, _fraction: number, _lift: BarbellLiftId, _inv: Inventory): number { return todo(); }
