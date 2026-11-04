// Finish and the summary (SPEC.md section 5.3): any missing ratings or spare
// reps, the end check-in, then each lift's next prescription.

import { useState } from 'preact/hooks';
import {
  jumpChoices,
  liftStates,
  planFor,
  triggers,
  type BarbellLiftId,
  type EngineInput,
  type LiftStateView,
  type SessionPlan,
  type SpareReps,
  type Stage,
} from '../../../engine';
import { Choice, Question, YesNo } from '../../components';
import { lb, spareLabel } from '../../format';
import { missingRatings, missingSpare, setEffort, setSpare, type LiftingDraft } from '../../session/lifting';
import { useApp } from '../../store';
import { EffortChips } from './LiftCard';
import type { Update } from './shared';

export interface Summary {
  lines: { lift: BarbellLiftId; label: string; next: string; change: string | null }[];
  food: string[];
  suggestions: string[];
  stopped: boolean;
}

export function FinishView(props: { plan: SessionPlan; d: LiftingDraft; update: Update; onSave: () => Promise<boolean> }) {
  const { program } = useApp();
  const { plan, d, update } = props;
  const missing = missingRatings(plan, d);
  const spare = missingSpare(plan, d);
  const end = plan.checkIns.end[0]!;
  const cutShort = plan.lifts.filter((lp) => {
    const l = d.lifts[lp.lift];
    return l && !l.painStop && l.sets.some((s) => s.state === 'todo') && l.sets.some((s) => s.state !== 'todo');
  });
  const notReached = plan.lifts.filter((lp) => !d.lifts[lp.lift]);
  const [saving, setSaving] = useState(false);
  const ready = d.warmupsHeavy !== null && missing.length === 0 && spare.length === 0 && !saving;
  return (
    <>
      <h1>Finish</h1>
      {missing.map((lp) => (
        <div class="card" key={lp.lift}>
          <div class="card-title">{lp.label}</div>
          <EffortChips lift={lp.lift} value={null} onChange={(e) => update(setEffort(d, lp, e))} />
        </div>
      ))}
      {spare.map((m) => (
        <div class="card" key={m.lift}>
          <Question text={`Reps to spare on the last ${m.lift === 'chin' ? 'chin' : 'dip'} set?`}>
            <Choice
              tight
              label={`${m.label}: reps to spare`}
              options={([0, 1, 2] as SpareReps[]).map((v) => ({ value: v, label: spareLabel(v) }))}
              value={null}
              onChange={(v) => update(setSpare(d, m.lift, v))}
            />
          </Question>
        </div>
      ))}
      {cutShort.length > 0 && (
        <p class="note info">
          {cutShort.map((lp) => lp.label).join(', ')}: sets left undone count as cut short, not missed, so the lift repeats.
        </p>
      )}
      {notReached.length > 0 && <p class="note info">{notReached.map((lp) => lp.label).join(', ')}: not reached. It repeats next time.</p>}
      <div class="card">
        <Question text={end.text}>
          <YesNo label={end.text} value={d.warmupsHeavy} onChange={(v) => update({ ...d, warmupsHeavy: v })} />
        </Question>
        <div class="field">
          <label for="notes">Notes</label>
          <textarea id="notes" rows={3} value={d.notes} onInput={(e) => update({ ...d, notes: e.currentTarget.value })} />
        </div>
      </div>
      <button
        type="button"
        class="btn btn-primary"
        disabled={!ready}
        onClick={() => {
          setSaving(true);
          void props.onSave().then((saved) => {
            if (!saved) setSaving(false);
          });
        }}
      >
        Save session
      </button>
      <button type="button" class="btn-quiet" onClick={() => update({ ...d, step: 'lifting' })}>
        Back to the session
      </button>
      <p class="small muted">{program.nutritionPrompts.liftingDay}</p>
    </>
  );
}

// ------------------------------------------------------------ summary

const STAGE_WORDS: Partial<Record<Stage, string>> = {
  REPEAT: 'Repeat',
  BRIDGE_SHORT: 'Bridge',
  BRIDGE_NORMAL: 'Bridge',
  HOLD: 'Hold',
  GRADUATED: 'Graduated',
};

export function buildSummary(
  labels: Record<string, { label: string }>,
  plan: SessionPlan,
  before: Record<BarbellLiftId, LiftStateView>,
  after: EngineInput,
  beforeSuggestions: ReturnType<typeof triggers>,
  d: LiftingDraft,
  stopped: boolean,
): Summary {
  const states = liftStates(after);
  const lines = plan.lifts.map((lp) => {
    const s = states[lp.lift];
    const b = before[lp.lift];
    const next = s.next ? `${s.next.sets}×${s.next.reps} · ${lb(s.next.weight)}` : 'Calibrates next time';
    let change: string | null = null;
    if (s.resetCount > b.resetCount) change = 'Reset';
    else if (s.stage !== b.stage) change = STAGE_WORDS[s.stage] ?? (s.stage === 'NORMAL' && b.stage !== 'NORMAL' ? 'Back to normal' : null);
    if (s.pain === 'paused' && b.pain !== 'paused') change = 'Paused for pain';
    return { lift: lp.lift, label: labels[lp.lift]?.label ?? lp.label, next, change };
  });
  const seen = new Set(beforeSuggestions.map((s) => `${s.kind}:${s.lift ?? ''}`));
  const suggestions = triggers(after)
    .filter((s) => !seen.has(`${s.kind}:${s.lift ?? ''}`))
    .map((s) => s.message);
  const food = planFor(after, d.date).foodLines;
  return { lines, food, suggestions, stopped };
}

export function SummaryView(props: { summary: Summary; d: LiftingDraft; onDone: () => void }) {
  const app = useApp();
  const { summary, d } = props;
  if (summary.stopped) {
    return (
      <>
        <h1>Stopped</h1>
        <p class="note alarm">{app.program.safety.stopSessionMessage}</p>
        <button type="button" class="btn btn-primary" onClick={props.onDone}>
          Close
        </button>
      </>
    );
  }
  return (
    <>
      <h1>Logged</h1>
      <div class="card">
        <div class="card-kicker">Next time</div>
        <ul class="lines">
          {summary.lines.map((l) => (
            <li key={l.lift}>
              <div class="spread">
                <span>{l.label}</span>
                <span>{l.next}</span>
              </div>
              {l.change && <span class="stage">{l.change}</span>}
              {!d.past && <SmallerJump lift={l.lift} date={d.date} />}
            </li>
          ))}
        </ul>
      </div>
      {summary.suggestions.map((s) => (
        <p class="note" key={s}>
          {s}
        </p>
      ))}
      {summary.food.length > 0 && (
        <div class="note ok">
          {summary.food.map((f) => (
            <div key={f}>{f}</div>
          ))}
        </div>
      )}
      <button type="button" class="btn btn-primary" onClick={props.onDone}>
        Done
      </button>
    </>
  );
}

/** "Use a smaller jump next time" (SPEC.md section 5.3): down to a repeat, never a larger jump. */
function SmallerJump(props: { lift: BarbellLiftId; date: string }) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const choices = jumpChoices(app.input, props.lift);
  const state = liftStates(app.input)[props.lift];
  const current = state.overrideNext?.weight ?? state.next?.weight;
  if (choices.length < 2) return null;
  if (!open) {
    return (
      <button type="button" class="btn-quiet" onClick={() => setOpen(true)}>
        Use a smaller jump next time
      </button>
    );
  }
  return (
    <Choice
      tight
      label="Next weight"
      options={choices.map((w) => ({ value: w, label: lb(w) }))}
      value={current ?? null}
      onChange={(w) => {
        void app.log({ type: 'override', date: props.date, lift: props.lift, field: 'next', value: w, reason: 'A smaller jump' });
        setOpen(false);
      }}
    />
  );
}
