// The rest timer bar (RULES.md section 14). The time comes from stored
// timestamps, so it's right after the app has been in the background.
// After a barbell work set, "Reps left on that set" resets the rest from the
// section 14 table (Q23), because PROTOCOL.md ties rest to how the sets end.

import { READINGS, type EffortRating, type SessionPlan } from '../../../engine';
import { clock } from '../../format';
import { adjustTimer, clearTimer, rateRest, ratesCrisp, type LiftingDraft } from '../../session/lifting';
import { useApp } from '../../store';
import type { Update } from './shared';

// The table's own rows, short enough for one line of chips under "Reps left."
const REPS_LEFT: { id: EffortRating; label: string }[] = [
  { id: 'light', label: '5+' },
  { id: 'rir3to4', label: '3–4' },
  { id: 'rir1to2', label: '1–2' },
  { id: 'grind', label: '0' },
];

export function RestTimer(props: { plan: SessionPlan; label: string; remaining: number; total: number; d: LiftingDraft; update: Update }) {
  const { program } = useApp();
  const { plan, remaining, total, d, update } = props;
  const done = remaining === 0;
  const step = program.timeBudget.restAdjustSec;
  const lift = d.timer?.lift;
  const lp = lift ? plan.lifts.find((l) => l.lift === lift) : undefined;
  const choices = !READINGS.REST_FROM_SET_JUST_DONE || !lp || done ? [] : ratesCrisp(lp.lift) ? program.effort.cleanRowCategories : REPS_LEFT;
  return (
    <div class={done ? 'timer done' : 'timer'} role="region" aria-label="Rest timer">
      <div class="timer-top">
        <div class="timer-time" role="timer">
          {clock(remaining)}
        </div>
        <div class="timer-mid">
          <div class="timer-label" aria-live="polite">
            {done ? 'Rest over' : `Rest · ${props.label}`}
          </div>
          <div class="timer-prog">
            <i style={{ width: `${total > 0 ? Math.max(0, Math.min(100, (100 * remaining) / total)) : 0}%` }} />
          </div>
          {!done && lp && <div class="timer-hint">Go when you can make a clean set.</div>}
        </div>
      </div>
      {lp && choices.length > 0 && (
        <div class="timer-rate" role="group" aria-label={ratesCrisp(lp.lift) ? 'That set' : 'Reps left on that set'}>
          <span class="timer-rate-label">{ratesCrisp(lp.lift) ? 'That set' : 'Reps left'}</span>
          {choices.map((c) => (
            <button
              type="button"
              key={c.id}
              aria-pressed={d.timer?.effort === c.id}
              aria-label={ratesCrisp(lp.lift) ? `That set: ${c.label.toLowerCase()}` : `${c.label} reps left on that set`}
              onClick={() => update(rateRest(d, lp, c.id as EffortRating, program))}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div class="timer-actions">
        <button type="button" aria-label={`${step} seconds less`} onClick={() => update(adjustTimer(d, -step))}>
          −{step}s
        </button>
        <button type="button" aria-label={`${step} seconds more`} onClick={() => update(adjustTimer(d, step))}>
          +{step}s
        </button>
        <button type="button" class="skip" onClick={() => update(clearTimer(d))}>
          {done ? 'Close' : 'Skip'}
        </button>
      </div>
    </div>
  );
}
