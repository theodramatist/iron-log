// A lift's card: weight, plates, warm-ups, one-tap work sets, effort chips,
// and its menu with Pain stop and the weight actually lifted (SPEC.md section 5.3).

import { useState } from 'preact/hooks';
import {
  largestLoadableAtOrBelow,
  platesPerSide,
  smallestLoadableAbove,
  type BarbellLiftId,
  type EffortRating,
  type Inventory,
  type LiftPlan,
  type PrescriptionKind,
  type Program,
} from '../../../engine';
import { nowIso } from '../../clock';
import { Choice, PlateBar, Question, Sheet, YesNo, useLongPress } from '../../components';
import { lb, platesText } from '../../format';
import {
  answerLayoffHeavy,
  isRated,
  liftDraft,
  liftMissed,
  lowerReps,
  missedRestSec,
  ratesCrisp,
  restAfterMiss,
  setEffort,
  setWorkWeight,
  startTimer,
  tapSet,
  toggleFormBroke,
  togglePainStop,
  toggleSkipped,
  toggleWarmup,
  wantsRating,
  workWeightOf,
  type LiftingDraft,
} from '../../session/lifting';
import { useApp } from '../../store';
import type { Update } from './shared';

/** What the card's kicker says when the lift isn't running its usual heavy work (L6). */
export function kindLabel(program: Program, kind: PrescriptionKind): string | null {
  switch (kind) {
    case 'lightDay':
      return 'Light day';
    case 'lightWeek':
      return 'Light week';
    case 'floor':
      return 'Floor week';
    case 'painReturn':
      return `Return at ${Math.round(program.safety.painReturnFraction * 100)}%`;
    case 'graduated':
      return 'Graduated';
    default:
      return null;
  }
}

function liftHeader(lp: LiftPlan, weight: number, kind: string | null) {
  return (
    <div class="spread" style={{ alignItems: 'flex-start' }}>
      <div>
        <div class="card-kicker">
          Slot {lp.slot}
          {kind ? ` · ${kind}` : ''}
        </div>
        <div class="card-title">{lp.label}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div class="big">{lb(weight)}</div>
        <div class="small muted num">
          {lp.sets}×{lp.reps}
        </div>
      </div>
    </div>
  );
}

/** PROTOCOL.md, Supersets and trisets: barbell work sets run straight, so a lift's warm-ups wait for the last lift's work sets. */
export function AfterCue(props: { prevLabel?: string }) {
  if (!props.prevLabel) return null;
  return <p class="small muted">Start these after the last {props.prevLabel.toLowerCase()} work set, not during its rests.</p>;
}

export function WarmupRows(props: { lp: LiftPlan; d: LiftingDraft; update: Update; cut: boolean; prevLabel?: string }) {
  const { lp, d, update } = props;
  const l = liftDraft(d, lp);
  if (lp.warmups.length === 0) return null;
  return (
    <div style={{ marginTop: '8px' }}>
      <div class="card-kicker">Warm-ups</div>
      <AfterCue prevLabel={props.prevLabel} />
      {lp.warmups.map((w, i) => (
        <button type="button" class="check-row" key={i} aria-pressed={l.warmups[i] ?? false} onClick={() => update(toggleWarmup(d, lp, i))}>
          <span class="box" aria-hidden="true">
            {l.warmups[i] ? '✓' : ''}
          </span>
          <span class="what num">
            {w.plates.length === 0 ? 'Bar' : lb(w.weight)} × {w.reps}
          </span>
          <span class="plates">{w.plates.length === 0 ? '' : platesText(w.plates)}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * How the work sets run (PROTOCOL.md, Supersets and trisets): straight, with
 * full rest. Squat and deadlift rests are never shortened, and only the
 * long-day cut puts chin sets between press or bench sets.
 */
function straightSetsCue(lp: LiftPlan, cutsApplied: number): string | null {
  if (lp.sets < 2) return null;
  if (cutsApplied >= 3 && (lp.lift === 'press' || lp.lift === 'bench')) {
    return `Today, do a chin set in each rest, keeping at least 3 minutes between ${lp.label.toLowerCase()} sets. Dips come after the last one.`;
  }
  const base = 'Straight sets: full rest between work sets, with nothing in between.';
  return lp.lift === 'squat' || lp.lift === 'deadlift' ? `${base} Never shorten these rests.` : base;
}

export function LiftCard(props: { lp: LiftPlan; d: LiftingDraft; update: Update; inv: Inventory; prevLabel?: string }) {
  const { program } = useApp();
  const { lp, d, update, inv } = props;
  const l = liftDraft(d, lp);
  const W = workWeightOf(lp, l);
  const plates = W === lp.weight ? lp.plates : (platesPerSide(W, inv) ?? []);
  const [menu, setMenu] = useState(false);
  const warmupsDone = l.warmups.length > 0 && l.warmups.every(Boolean);
  const askLayoff = lp.layoffHeavyWeight !== null && (warmupsDone || l.layoffHeavy !== null);
  const missed = liftMissed(lp, l);

  const tap = (i: number) => {
    const wasDone = l.sets[i]?.state === 'done';
    let next = tapSet(d, lp, i);
    if (!wasDone) next = startTimer(next, lp.label, lp.restSec, nowIso(), lp.lift);
    update(next);
  };
  // A short set rests like a miss (RULES.md section 14, Q23).
  const minus = (i: number) => {
    const wasDone = l.sets[i]?.state === 'done';
    const next = lowerReps(d, lp, i);
    update(wasDone ? restAfterMiss(next, lp, program) : startTimer(next, lp.label, missedRestSec(lp, program), nowIso(), lp.lift));
  };
  const formBroke = (i: number) => {
    const next = toggleFormBroke(d, lp, i);
    update(liftDraft(next, lp).sets[i]?.formBroke ? restAfterMiss(next, lp, program) : next);
  };
  const setsCue = straightSetsCue(lp, d.cutsApplied);

  return (
    <section class="card" aria-label={lp.label}>
      <div class="spread" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>{liftHeader(lp, W, kindLabel(program, lp.kind))}</div>
        <button type="button" class="menu-btn" aria-label={`${lp.label} menu`} onClick={() => setMenu(true)}>
          ⋯
        </button>
      </div>
      {lp.stageLabel && <span class="stage">{lp.stageLabel}</span>}
      {l.weight !== null && <p class="cue">Changed from {lb(lp.weight)}.</p>}
      <PlateBar weight={W} plates={plates} />
      {lp.notes.map((n) => (
        <p class="cue" key={n}>
          {n}
        </p>
      ))}
      {lp.cues.map((c) => (
        <p class="cue" key={c}>
          {c}
        </p>
      ))}
      {l.painStop ? (
        <p class="note alarm">Pain stop: this lift ends for today and won't count. The next session with it asks if the pain is gone.</p>
      ) : (
        <>
          <WarmupRows lp={lp} d={d} update={update} cut={d.cutsApplied >= 2} prevLabel={props.prevLabel} />
          {askLayoff && (
            <Question text="Did that warm-up feel heavy?">
              <YesNo label="Did that warm-up feel heavy?" value={l.layoffHeavy} onChange={(v) => update(answerLayoffHeavy(d, lp, v))} />
              {l.layoffHeavy && <p class="small">Work sets drop to {lb(lp.layoffHeavyWeight!)}.</p>}
            </Question>
          )}
          <div class="card-kicker" style={{ marginTop: '12px' }}>
            Work sets
          </div>
          {setsCue && <p class="small muted">{setsCue}</p>}
          <div class="sets">
            {l.sets.map((s, i) => (
              <SetButton key={i} n={i + 1} target={lp.reps} s={s} onTap={() => tap(i)} onMinus={() => minus(i)} onForm={() => formBroke(i)} onSkip={() => update(toggleSkipped(d, lp, i))} />
            ))}
          </div>
          <p class="small muted">Tap a set when it's done. Hold a set to mark it skipped.</p>
          {wantsRating(lp, l) && <EffortChips lift={lp.lift} value={l.effort} onChange={(e) => update(setEffort(d, lp, e))} />}
          {isRated(lp) && missed && <p class="cue">Missed reps. The rating is set to missed.</p>}
        </>
      )}
      {menu && (
        <Sheet title={lp.label} onClose={() => setMenu(false)}>
          <WeightChanger weight={W} prescribed={lp.weight} inv={inv} onChange={(w) => update(setWorkWeight(d, lp, w === lp.weight ? null : w))} />
          <button
            type="button"
            class="btn btn-danger"
            style={{ marginTop: '14px' }}
            onClick={() => {
              update(togglePainStop(d, lp));
              setMenu(false);
            }}
          >
            {l.painStop ? 'Undo pain stop' : 'Pain stop'}
          </button>
          <p class="small muted">{program.safety.painRule}</p>
          <button type="button" class="btn btn-ghost" onClick={() => setMenu(false)}>
            Done
          </button>
        </Sheet>
      )}
    </section>
  );
}

export function SetButton(props: {
  n: number;
  target: number;
  s: { state: 'todo' | 'done' | 'skipped'; reps: number; formBroke: boolean };
  onTap: () => void;
  onMinus: () => void;
  onForm: () => void;
  onSkip: () => void;
}) {
  const { s, target } = props;
  const short = s.state === 'done' && (s.reps < target || s.formBroke);
  const cls = ['set', s.state === 'done' ? (short ? 'short' : 'done') : '', s.state === 'skipped' ? 'skipped' : ''].filter(Boolean).join(' ');
  const press = useLongPress(props.onSkip, props.onTap);
  const status = s.state === 'skipped' ? 'skipped' : s.state === 'done' ? `${s.reps} reps${s.formBroke ? ', form broke' : ''}` : 'not done';
  return (
    <div class={cls}>
      <button type="button" class="set-main" aria-label={`Set ${props.n}: ${status}`} {...press}>
        <span class="n">Set {props.n}</span>
        <span class="reps">{s.state === 'skipped' ? '—' : s.state === 'done' ? s.reps : target}</span>
      </button>
      <div class="set-tools">
        <button type="button" aria-label={`Set ${props.n}: one rep fewer`} onClick={props.onMinus}>
          −1
        </button>
        <button type="button" aria-label={`Set ${props.n}: form broke`} aria-pressed={s.formBroke} onClick={props.onForm}>
          Form
        </button>
      </div>
    </div>
  );
}

export function EffortChips(props: { lift: BarbellLiftId; value: EffortRating | null; onChange: (e: EffortRating) => void }) {
  const { program } = useApp();
  const options = ratesCrisp(props.lift) ? program.effort.cleanRowCategories : program.effort.categories.filter((c) => c.id !== 'missed');
  return (
    <Question text="How did the last work set feel?">
      <p class="small muted">Judge it by {program.effort.judgeBy}.</p>
      <Choice
        label="Effort rating"
        options={options.map((o) => ({ value: o.id as EffortRating, label: o.label }))}
        value={props.value}
        onChange={props.onChange}
      />
    </Question>
  );
}

export function WeightChanger(props: { weight: number; prescribed: number; inv: Inventory; onChange: (w: number) => void }) {
  const { weight, inv } = props;
  const lower = largestLoadableAtOrBelow(weight - 0.01, inv);
  const higher = smallestLoadableAbove(weight, inv);
  return (
    <div class="field">
      <span class="label">Weight lifted</span>
      <div class="row">
        <div class="stepper" role="group" aria-label="Weight lifted">
          <button type="button" aria-label="Lighter" disabled={lower === null} onClick={() => lower !== null && props.onChange(lower)}>
            −
          </button>
          <span class="val" aria-live="polite">
            {lb(weight)}
          </span>
          <button type="button" aria-label="Heavier" disabled={higher === null} onClick={() => higher !== null && props.onChange(higher)}>
            +
          </button>
        </div>
        {weight !== props.prescribed && (
          <button type="button" class="btn-quiet" onClick={() => props.onChange(props.prescribed)}>
            Back to {lb(props.prescribed)}
          </button>
        )}
      </div>
      <p class="small muted">Results use the weight you actually lifted.</p>
    </div>
  );
}
