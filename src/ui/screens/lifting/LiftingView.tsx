// The session itself: the bike warm-up, a card per lift in slot order, the
// chin-and-dip block, the optional spin, and Finish (SPEC.md section 5.3).

import type { Inventory, SessionPlan, timeGuard } from '../../../engine';
import { missingRatings, type LiftingDraft } from '../../session/lifting';
import { AssistBlock } from './AssistBlock';
import { CalibrationCard } from './CalibrationCard';
import { LiftCard } from './LiftCard';
import type { Update } from './shared';

export type Guard = ReturnType<typeof timeGuard> | null;

export function LiftingView(props: { plan: SessionPlan; d: LiftingDraft; update: Update; inv: Inventory; guard: Guard }) {
  const { plan, d, update, inv, guard } = props;
  const weekTag = plan.weekType === 'light' ? 'Light week' : plan.weekType === 'floor' ? 'Floor week' : null;
  const missingCount = missingRatings(plan, d).length;
  return (
    <>
      <div class="eyebrow">
        Workout <b>{plan.workout}</b>
        {weekTag ? ` · ${weekTag}` : ''}
      </div>
      {guard?.nextCut && guard.nextCutText && (
        <div class="note" role="status">
          <div>
            Projected {Math.round(guard.projectedMin)} minutes. {guard.nextCutText}
          </div>
          <div class="btn-row">
            <button type="button" class="chip" onClick={() => update({ ...d, cutsApplied: guard.nextCut! })}>
              Do this
            </button>
          </div>
        </div>
      )}
      {d.cutsApplied >= 2 && <p class="cue">Drop one warm-up set from each remaining lift.</p>}
      {plan.notes.map((n) => (
        <p class="note info" key={n}>
          {n}
        </p>
      ))}
      <div class="card">
        <button type="button" class="check-row" aria-pressed={d.bikeDone} onClick={() => update({ ...d, bikeDone: !d.bikeDone })}>
          <span class="box" aria-hidden="true">
            {d.bikeDone ? '✓' : ''}
          </span>
          <span class="what">{plan.beforeLifting}</span>
        </button>
      </div>

      {plan.lifts.map((lp) =>
        lp.kind === 'calibration' ? (
          <CalibrationCard key={lp.lift} lp={lp} d={d} update={update} inv={inv} />
        ) : (
          <LiftCard key={lp.lift} lp={lp} d={d} update={update} inv={inv} />
        ),
      )}
      {plan.paused.map((p) => (
        <div class="card" key={p.lift}>
          <div class="card-title">{p.label}: paused</div>
          <p class="cue">{p.message}</p>
        </div>
      ))}
      {plan.waiting.map((w) => (
        <div class="card" key={w.lift}>
          <div class="card-title">{w.label}: not this week</div>
          <p class="cue">{w.message}</p>
        </div>
      ))}

      {plan.assist && <AssistBlock plan={plan} d={d} update={update} />}

      {plan.afterLiftingSpin && d.cutsApplied < 1 && (
        <div class="card">
          <button type="button" class="check-row" aria-pressed={d.spinDone} onClick={() => update({ ...d, spinDone: !d.spinDone })}>
            <span class="box" aria-hidden="true">
              {d.spinDone ? '✓' : ''}
            </span>
            <span class="what">{plan.afterLiftingSpin.minutes} easy minutes on the air bike (optional)</span>
          </button>
        </div>
      )}

      {missingCount > 0 && <p class="cue">Rate the last work set of each lift before you finish.</p>}
      <button type="button" class="btn btn-primary" onClick={() => update({ ...d, step: 'finish', timer: null })}>
        Finish
      </button>
    </>
  );
}
