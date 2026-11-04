// Loads, plates, and rounding (RULES.md section 3).
//
// All arithmetic is in integer cents so 0.95 x 250 is exactly 237.5. A
// weight is loadable when (weight - bar) / 2 can be made from the plates,
// using each size no more times per side than the pairs owned.

import programJson from '../program/program.json';
import type { BarbellLiftId, PlatePair, Settings } from './types';

export interface Inventory {
  barLb: number;
  plates: PlatePair[];
}

export function inventoryFrom(settings: Pick<Settings, 'barLb' | 'plates'>): Inventory {
  return { barLb: settings.barLb, plates: settings.plates };
}

const MAX_PER_SIDE_LB = 800;
const cents = (lb: number): number => Math.round(lb * 100);
const lbFrom = (c: number): number => c / 100;

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
}

interface Solver {
  barCents: number;
  /** Cents per unit, per side. */
  unit: number;
  maxUnits: number;
  sizes: { lb: number; units: number; pairs: number | null }[];
  /** suffix[i][u] is 1 when u units per side can be made from sizes[i..]. */
  suffix: Uint8Array[];
}

const solvers = new Map<string, Solver>();

function solver(inv: Inventory): Solver {
  const key = `${inv.barLb}|${inv.plates.map((p) => `${p.lb}:${p.pairs ?? 'u'}`).join(',')}`;
  const cached = solvers.get(key);
  if (cached) return cached;

  const usable = inv.plates.filter((p) => p.lb > 0 && (p.pairs === null || p.pairs > 0));
  let unit = 0;
  for (const p of usable) unit = gcd(unit, cents(p.lb));
  if (unit === 0) unit = 25;
  const sizes = usable
    .map((p) => ({ lb: p.lb, units: cents(p.lb) / unit, pairs: p.pairs }))
    .sort((a, b) => b.units - a.units);
  const maxUnits = Math.floor(cents(MAX_PER_SIDE_LB) / unit);

  const suffix: Uint8Array[] = [];
  const base = new Uint8Array(maxUnits + 1);
  base[0] = 1;
  suffix[sizes.length] = base;
  for (let i = sizes.length - 1; i >= 0; i--) {
    const size = sizes[i]!;
    const cur = suffix[i + 1]!.slice();
    if (size.pairs === null) {
      for (let u = size.units; u <= maxUnits; u++) if (cur[u - size.units]) cur[u] = 1;
    } else {
      for (let k = 0; k < size.pairs; k++) {
        for (let u = maxUnits; u >= size.units; u--) if (cur[u - size.units]) cur[u] = 1;
      }
    }
    suffix[i] = cur;
  }

  const s: Solver = { barCents: cents(inv.barLb), unit, maxUnits, sizes, suffix };
  solvers.set(key, s);
  return s;
}

/** Per-side units for a total, or null when it can't be split into whole units. */
function perSideUnits(total: number, s: Solver): number | null {
  const diff = cents(total) - s.barCents;
  if (diff < 0 || diff % 2 !== 0) return null;
  const side = diff / 2;
  if (side % s.unit !== 0) return null;
  const u = side / s.unit;
  return u <= s.maxUnits ? u : null;
}

export function isLoadable(total: number, inv: Inventory): boolean {
  const s = solver(inv);
  const u = perSideUnits(total, s);
  return u !== null && s.suffix[0]![u] === 1;
}

/** Plates for one side, largest first, or null when the weight isn't loadable. */
export function platesPerSide(total: number, inv: Inventory): number[] | null {
  const s = solver(inv);
  let rem = perSideUnits(total, s);
  if (rem === null || s.suffix[0]![rem] !== 1) return null;
  const out: number[] = [];
  s.sizes.forEach((size, i) => {
    let k = Math.min(size.pairs ?? Number.POSITIVE_INFINITY, Math.floor(rem! / size.units));
    while (k > 0 && s.suffix[i + 1]![rem! - k * size.units] !== 1) k--;
    for (let j = 0; j < k; j++) out.push(size.lb);
    rem = rem! - k * size.units;
  });
  return out;
}

function totalFromUnits(u: number, s: Solver): number {
  return lbFrom(s.barCents + u * 2 * s.unit);
}

export function largestLoadableAtOrBelow(x: number, inv: Inventory): number | null {
  const s = solver(inv);
  const diff = cents(x) - s.barCents;
  if (diff < 0) return null;
  for (let u = Math.min(Math.floor(diff / (2 * s.unit)), s.maxUnits); u >= 0; u--) {
    if (s.suffix[0]![u] === 1) return totalFromUnits(u, s);
  }
  return null;
}

export function smallestLoadableAbove(x: number, inv: Inventory): number | null {
  const s = solver(inv);
  const diff = cents(x) - s.barCents;
  const start = diff < 0 ? 0 : Math.floor(diff / (2 * s.unit)) + 1;
  for (let u = start; u <= s.maxUnits; u++) {
    if (s.suffix[0]![u] === 1) return totalFromUnits(u, s);
  }
  return null;
}

/** Every loadable weight from lo to hi, inclusive. */
export function loadableBetween(lo: number, hi: number, inv: Inventory): number[] {
  const s = solver(inv);
  const out: number[] = [];
  const from = Math.max(0, Math.ceil((cents(lo) - s.barCents) / (2 * s.unit)));
  const to = Math.min(s.maxUnits, Math.floor((cents(hi) - s.barCents) / (2 * s.unit)));
  for (let u = from; u <= to; u++) if (s.suffix[0]![u] === 1) out.push(totalFromUnits(u, s));
  return out;
}

export function formatLb(x: number): string {
  return String(Math.round(x * 100) / 100);
}

/**
 * Section 3, progression weights: the largest loadable weight at or below
 * lcw + jump; if that isn't above lcw, the smallest loadable weight above
 * lcw, with a note.
 */
export function progressionWeight(lcw: number, jump: number, inv: Inventory): { weight: number; note: string | null } {
  const w = largestLoadableAtOrBelow(lcw + jump, inv);
  if (w !== null && cents(w) > cents(lcw)) return { weight: w, note: null };
  const up = smallestLoadableAbove(lcw, inv) ?? lcw + jump;
  return {
    weight: up,
    note: `Your plates can't make a ${formatLb(jump)}-lb jump. The next step up is ${formatLb(up)}.`,
  };
}

/** floor(base x fraction / step) x step, exactly. */
export function floorPercent(base: number, fraction: number, stepLb: number): number {
  const product = cents(base) * Math.round(fraction * 10_000);
  const stepCents = cents(stepLb);
  return lbFrom(Math.floor(product / (stepCents * 10_000)) * stepCents);
}

/**
 * Section 3, percentage weights: multiply, round down to 2.5 lb (5 lb for the
 * deadlift), then take the largest loadable weight at or below that.
 */
export function percentWeight(
  base: number,
  fraction: number,
  lift: BarbellLiftId,
  inv: Inventory,
  rounding: { default: number; deadlift: number } = programJson.rounding.percentWeightsToLb,
): number {
  const step = lift === 'deadlift' ? rounding.deadlift : rounding.default;
  const floored = floorPercent(base, fraction, step);
  return largestLoadableAtOrBelow(floored, inv) ?? inv.barLb;
}
