// The rest timer bar (RULES.md section 14). The time comes from stored
// timestamps, so it's right after the app has been in the background.

import { clock } from '../../format';
import { adjustTimer, clearTimer, type LiftingDraft } from '../../session/lifting';
import { useApp } from '../../store';
import type { Update } from './shared';

export function RestTimer(props: { label: string; remaining: number; total: number; d: LiftingDraft; update: Update }) {
  const { program } = useApp();
  const { remaining, total, d, update } = props;
  const done = remaining === 0;
  const step = program.timeBudget.restAdjustSec;
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
        </div>
      </div>
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
