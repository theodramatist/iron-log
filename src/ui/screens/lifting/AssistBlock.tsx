// The chin-and-dip block: calibration when it's due, six rows alternating
// chin and dip, spare reps, negatives, and the assist-machine substitutes
// (RULES.md sections 2 and 7).

import { nowIso } from '../../clock';
import { Choice, Question, Stepper } from '../../components';
import { lb, shortDate, spareLabel } from '../../format';
import type { AssistMovementPlan, SessionPlan, SpareReps } from '../../../engine';
import {
  assistCalibrationDraft,
  assistCalibrationNeeded,
  assistCalibrationReps,
  assistCalibrationStep,
  assistRowReps,
  assistRows,
  assistSetting,
  setSpare,
  setSubstitutionReps,
  startTimer,
  substitutionReps,
  tapAssistRow,
  toggleNegative,
  undoAssistCalibration,
  type LiftingDraft,
} from '../../session/lifting';
import type { Update } from './shared';

function movementLoad(m: AssistMovementPlan, setting: number): string {
  if (m.mode === 'WEIGHTED') return `+${lb(m.addedLoad)} lb on the belt`;
  if (m.mode === 'BODYWEIGHT' || setting === 0) return 'Bodyweight';
  return `${lb(setting)} lb help`;
}

function effective(m: AssistMovementPlan, setting: number): string | null {
  if (m.bodyweightLb === null) return null;
  const load = m.mode === 'WEIGHTED' ? m.bodyweightLb + m.addedLoad : m.bodyweightLb - setting;
  return `Effective load ${lb(load)}${m.bodyweightStale && m.bodyweightDate ? ` (weigh-in ${shortDate(m.bodyweightDate)})` : ''}`;
}

export function AssistBlock(props: { plan: SessionPlan; d: LiftingDraft; update: Update }) {
  const { plan, d, update } = props;
  const a = plan.assist!;
  const rest = (next: LiftingDraft, label: string) => startTimer(next, label, a.restSec, nowIso());

  if (a.substitutions) {
    return (
      <section class="card" aria-label="Assist machine down">
        <div class="card-title">Assist machine down</div>
        {a.substitutions.map((s) => {
          const reps = substitutionReps(d, s.exercise, s.sets);
          return (
            <div key={s.exercise}>
              <p class="cue">
                {s.exercise}: {s.sets} sets{s.reps ? ` of ${s.reps}` : ''}, {s.repsToSpare} reps to spare.
              </p>
              {reps.map((r, i) => (
                <div class="assist-row" key={i}>
                  <div class="what">
                    {s.exercise} · set {i + 1}
                  </div>
                  <div class="controls">
                    <Stepper
                      label="Reps"
                      value={r ?? s.reps ?? 10}
                      min={0}
                      max={30}
                      onChange={(v) => update(setSubstitutionReps(d, s.exercise, s.sets, i, v))}
                    />
                    <button
                      type="button"
                      class="done-btn"
                      aria-pressed={r !== null}
                      onClick={() => update(rest(setSubstitutionReps(d, s.exercise, s.sets, i, r === null ? (s.reps ?? 10) : null), s.exercise))}
                    >
                      {r !== null ? '✓' : 'Done'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </section>
    );
  }

  const movements = [a.chin, a.dip].filter((m): m is AssistMovementPlan => m !== null);
  const calibrating = movements.find((m) => assistCalibrationNeeded(m, d));
  const rows = assistRows(plan, d);
  const byLift = (lift: string) => movements.find((m) => m.lift === lift)!;

  return (
    <section class="card" aria-label="Chins and dips">
      <div class="card-title">{movements.length === 2 ? 'Chins and dips' : movements[0]?.label}</div>
      <p class="cue">
        {movements.length === 2
          ? `Superset: a chin set, then a dip set, ${Math.round(a.restSec / 15) * 15} seconds between sets, ${a.rounds} rounds.`
          : `${a.rounds} sets, ${Math.round(a.restSec / 15) * 15} seconds between sets.`}
      </p>
      {d.cutsApplied >= 3 && a.chin && (
        <p class="cue">Today the chin sets go in the rests between {(plan.lifts.find((l) => l.lift === 'press' || l.lift === 'bench')?.label ?? 'press').toLowerCase()} sets, and the dips come after the last one.</p>
      )}
      {movements[0]?.cues.map((c) => (
        <p class="cue" key={c}>
          {c}
        </p>
      ))}
      {movements.flatMap((m) => (m.calibration || d.assistCalibration[m.lift] ? [<AssistCalibration key={m.lift} m={m} d={d} update={update} />] : []))}
      {!calibrating &&
        rows.map((r, i) => {
          const m = byLift(r.lift);
          const setting = assistSetting(m, d);
          const last = !rows.slice(i + 1).some((x) => x.lift === r.lift);
          return (
            <div key={i}>
              <div class="assist-row">
                <div>
                  <div class="what">
                    {m.lift === 'chin' ? 'Chin-up' : 'Dip'} · round {Math.floor(i / movements.length) + 1}
                  </div>
                  <div class="load">
                    {movementLoad(m, setting)}
                    {effective(m, setting) ? ` · ${effective(m, setting)}` : ''}
                  </div>
                </div>
                <div class="controls">
                  <Stepper label={`${m.label} reps`} value={r.reps} min={0} max={20} onChange={(v) => update(assistRowReps(plan, d, i, v - r.reps))} />
                  <button
                    type="button"
                    class="done-btn"
                    aria-pressed={r.done}
                    aria-label={`${m.label}, round ${Math.floor(i / movements.length) + 1}: ${r.done ? 'done' : 'not done'}`}
                    onClick={() => {
                      const next = tapAssistRow(plan, d, i);
                      update(r.done ? next : rest(next, 'Chins and dips'));
                    }}
                  >
                    {r.done ? '✓' : 'Done'}
                  </button>
                </div>
              </div>
              {last && r.done && (
                <Question text={`Reps to spare on the last ${m.lift === 'chin' ? 'chin' : 'dip'} set?`}>
                  <Choice
                    tight
                    label={`${m.label}: reps to spare`}
                    options={([0, 1, 2] as SpareReps[]).map((v) => ({ value: v, label: spareLabel(v) }))}
                    value={d.spare[m.lift] ?? null}
                    onChange={(v) => update(setSpare(d, m.lift, v))}
                  />
                </Question>
              )}
              {last && r.done && m.negatives > 0 && (
                <div style={{ marginTop: '6px' }}>
                  <div class="card-kicker">Negatives: lower slowly, 3 to 5 seconds, no help</div>
                  {([0, 1] as const).map((n) => (
                    <button type="button" class="check-row" key={n} aria-pressed={d.negatives[n]} onClick={() => update(toggleNegative(d, n))}>
                      <span class="box" aria-hidden="true">
                        {d.negatives[n] ? '✓' : ''}
                      </span>
                      <span class="what">Negative {n + 1}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
    </section>
  );
}

function AssistCalibration(props: { m: AssistMovementPlan; d: LiftingDraft; update: Update }) {
  const { m, d, update } = props;
  const c = assistCalibrationDraft(m, d);
  const name = m.lift === 'chin' ? 'Chin-up' : 'Dip';
  if (c.setting !== null) {
    return (
      <div class="question">
        <div class="spread">
          <span>
            {name} setting: <b class="num">{lb(c.setting)} lb help</b>
          </span>
          <button type="button" class="btn-quiet" onClick={() => update(undoAssistCalibration(d, m))}>
            Redo
          </button>
        </div>
      </div>
    );
  }
  return (
    <div class="question">
      <div class="question-text">{name} calibration</div>
      <p class="small muted">{m.calibration?.instructions}</p>
      {c.sets.length > 0 && <p class="small num">{c.sets.map((s) => `${lb(s.assistance)} × ${s.reps}`).join(' · ')}</p>}
      <div class="spread" style={{ marginTop: '8px' }}>
        <div class="big">{lb(c.current)} lb help</div>
        <Stepper label="Reps" value={c.reps} min={0} max={5} onChange={(v) => update(assistCalibrationReps(d, m, v - c.reps))} />
      </div>
      <div class="chips">
        <button type="button" class="chip" onClick={() => update(assistCalibrationStep(d, m, 'more'))}>
          Next set: 10 lb less help
        </button>
        <button type="button" class="chip" onClick={() => update(assistCalibrationStep(d, m, 'close'))}>
          Close: 5 lb less
        </button>
        <button type="button" class="chip" disabled={c.reps < 5} onClick={() => update(assistCalibrationStep(d, m, 'settle'))}>
          5 solid with 2 or 3 to spare
        </button>
      </div>
    </div>
  );
}
