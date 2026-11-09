// A logged session, to view, edit, or delete (SPEC.md section 5.5). Editing
// changes the event in place, so the log replays and every later
// prescription is worked out again.

import { useMemo, useState } from 'preact/hooks';
import {
  effectiveSettings,
  inventoryFrom,
  largestLoadableAtOrBelow,
  smallestLoadableAbove,
  type AssistMovementLog,
  type ConditioningSessionEvent,
  type EffortRating,
  type Inventory,
  type LiftLog,
  type LiftingSessionEvent,
  type Program,
  type SpareReps,
} from '../../../engine';
import { Choice, Confirm, Question, Sheet, Stepper } from '../../components';
import { effortLabel, lb, shortDate, spareLabel } from '../../format';
import { useApp } from '../../store';
import { kindLabel } from '../lifting/LiftCard';

export type LoggedSession = LiftingSessionEvent | ConditioningSessionEvent;

const RECALC = 'Every prescription after this session is worked out again.';

export function SessionDetail(props: { event: LoggedSession; onClose: () => void }) {
  const { repo } = useApp();
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view');
  const ev = props.event;
  if (mode === 'edit') {
    return ev.type === 'liftingSession' ? (
      <LiftingEditor event={ev} onDone={() => setMode('view')} />
    ) : (
      <ConditioningEditor event={ev} onDone={() => setMode('view')} />
    );
  }
  return (
    <Sheet
      title={`${ev.type === 'liftingSession' ? `Workout ${ev.workout}` : ev.extra ? 'Extra minutes' : 'Conditioning'} · ${shortDate(ev.date)}`}
      onClose={props.onClose}
    >
      {ev.stopped && <p class="note alarm">Ended with Stop session. Nothing from it counts.</p>}
      {ev.type === 'liftingSession' ? <LiftingSummary ev={ev} /> : <ConditioningSummary ev={ev} />}
      {ev.notes && <p class="cue">{ev.notes}</p>}
      <div class="btn-row">
        {!ev.stopped && (
          <button type="button" class="btn btn-ghost" onClick={() => setMode('edit')}>
            Edit
          </button>
        )}
        <button type="button" class="btn btn-danger" onClick={() => setMode('delete')}>
          Delete
        </button>
      </div>
      <button type="button" class="btn btn-ghost" style={{ marginTop: '10px' }} onClick={props.onClose}>
        Done
      </button>
      {mode === 'delete' && (
        <Confirm
          title="Delete this session?"
          message={RECALC}
          confirm="Delete"
          onCancel={() => setMode('view')}
          onConfirm={() => {
            void repo.remove(ev.id).then(props.onClose);
          }}
        />
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------ viewing

function setsText(log: LiftLog): string {
  return log.sets
    .map((s) => (s.skipped ? 'skipped' : `${lb(s.weight)} × ${s.reps}${s.formBroke ? ' (form broke)' : ''}`))
    .join(' · ');
}

function LiftLine(props: { log: LiftLog; program: Program }) {
  const { log, program } = props;
  const label = program.lifts[log.lift].label;
  const kind = kindLabel(program, log.prescription.kind) ?? (log.prescription.kind === 'calibration' ? 'Calibration' : null);
  let body: string;
  if (log.notReached) body = 'Not reached';
  else if (log.painStop) body = `Pain stop${log.sets.length ? ` after ${setsText(log)}` : ''}`;
  else if (log.sets.length === 0) body = log.painAnswer === 'stillThere' ? 'Paused: the pain was still there' : 'Nothing logged';
  else body = setsText(log);
  return (
    <li>
      <div class="spread">
        <span>
          {label}
          {kind ? ` · ${kind}` : ''}
        </span>
        {log.effort && <span class="small muted">{effortLabel(program, log.effort)}</span>}
      </div>
      <div class="small">{body}</div>
      {log.calibration && log.calibration.sets.length > 0 && (
        <div class="small muted">Ramp: {log.calibration.sets.map((s) => `${lb(s.weight)} × ${s.reps}`).join(', ')}</div>
      )}
    </li>
  );
}

function assistLine(name: string, a: AssistMovementLog): string {
  const load = a.addedLoad > 0 ? `+${lb(a.addedLoad)} lb belt` : a.assistance > 0 ? `${lb(a.assistance)} lb help` : 'bodyweight';
  const spare = a.spare !== undefined ? ` · ${spareLabel(a.spare)} to spare` : '';
  return `${name}: ${load} · ${a.reps.join(', ')}${spare}`;
}

function LiftingSummary(props: { ev: LiftingSessionEvent }) {
  const { program } = useApp();
  const { ev } = props;
  const answers = [
    ev.checkIns.lastNightUnder6 ? 'Last night under 6 hours' : null,
    ev.checkIns.mostNightsUnder7 ? 'Most nights under 7 hours' : null,
    ev.checkIns.jointPain?.length ? 'Joint pain' : null,
    ev.checkIns.warmupsHeavy ? 'Warm-ups felt heavy' : null,
  ].filter(Boolean);
  return (
    <>
      {ev.weekType !== 'normal' && <p class="stage">{ev.weekType === 'light' ? 'Light week' : 'Floor week'}</p>}
      <ul class="lines plain">
        {ev.lifts.map((log) => (
          <LiftLine key={log.lift} log={log} program={program} />
        ))}
        {ev.assist?.chin && <li class="small">{assistLine('Chins', ev.assist.chin)}</li>}
        {ev.assist?.dip && <li class="small">{assistLine('Dips', ev.assist.dip)}</li>}
        {ev.substitutions?.map((s) => (
          <li class="small" key={s.exercise}>
            {s.exercise}: {s.reps.join(', ')}
          </li>
        ))}
        {ev.spinMinutes ? <li class="small">{ev.spinMinutes} easy minutes on the air bike</li> : null}
      </ul>
      {answers.length > 0 && <p class="small muted">{answers.join(' · ')}</p>}
    </>
  );
}

function ConditioningSummary(props: { ev: ConditioningSessionEvent }) {
  const { ev } = props;
  return (
    <ul class="lines plain">
      <li>
        {ev.actualMinutes} of {ev.targetMinutes} minutes · {ev.machines.easy}
      </li>
      {ev.intervalsPlanned > 0 && (
        <li>
          {ev.intervalsDone} of {ev.intervalsPlanned} intervals{ev.machines.intervals ? ` · ${ev.machines.intervals}` : ''}
        </li>
      )}
      <li class="small muted">
        {ev.extra ? 'Extra easy minutes: they count toward the weekly bar only.' : `Conditioning week ${ev.conditioningWeek}, phase ${ev.phase}`}
        {!ev.extra && ev.shortNight ? ' · last night under 6 hours' : ''}
      </li>
    </ul>
  );
}

// ------------------------------------------------------------ editing

const RATED = new Set(['heavy', 'calibration']);
const CLEAN_ROW = new Set(['row', 'powerClean']);

function missed(log: LiftLog): boolean {
  return log.sets.some((s) => !s.skipped && (s.reps < log.prescription.reps || s.formBroke));
}

function LiftingEditor(props: { event: LiftingSessionEvent; onDone: () => void }) {
  const app = useApp();
  const { repo, program, input } = app;
  const [ev, setEv] = useState<LiftingSessionEvent>(() => structuredClone(props.event));
  const [problem, setProblem] = useState<string | null>(null);
  const inv = useMemo(() => inventoryFrom(effectiveSettings(input, ev.date)), [input, ev.date]);
  const editLift = (i: number, next: LiftLog) => setEv({ ...ev, lifts: ev.lifts.map((l, j) => (j === i ? next : l)) });
  const editAssist = (lift: 'chin' | 'dip', next: AssistMovementLog) => setEv({ ...ev, assist: { ...ev.assist, [lift]: next } });

  const save = () => {
    // A short or form-broke set makes the lift a miss, whatever the rating said (RULES.md section 0).
    const lifts = ev.lifts.map((l) => {
      if (!RATED.has(l.prescription.kind) || l.sets.length === 0 || l.painStop) return l;
      if (missed(l)) return { ...l, effort: 'missed' as const };
      return l.effort === 'missed' ? { ...l, effort: undefined } : l;
    });
    repo
      .update<LiftingSessionEvent>(ev.id, (draft) => {
        draft.lifts = lifts;
        if (ev.assist) draft.assist = ev.assist;
        if (ev.notes?.trim()) draft.notes = ev.notes.trim();
        else delete draft.notes;
      })
      .then(props.onDone, (e: unknown) => setProblem(`This phone didn't save the change${e instanceof Error ? ` (${e.message})` : ''}.`));
  };

  return (
    <div class="session" role="dialog" aria-modal="true" aria-label="Edit a session">
      <div class="session-top">
        <div class="clock">
          <div class="num">Edit</div>
          <div class="sub">
            Workout {ev.workout} · {shortDate(ev.date)}
          </div>
        </div>
      </div>
      <div class="session-body">
        <p class="note info">{RECALC}</p>
        {problem && (
          <p class="note alarm" role="alert">
            {problem}
          </p>
        )}
        {ev.lifts.map((log, i) =>
          log.sets.length === 0 ? null : <LiftEditor key={log.lift} log={log} inv={inv} program={program} onChange={(next) => editLift(i, next)} />,
        )}
        {(['chin', 'dip'] as const).map((lift) => {
          const a = ev.assist?.[lift];
          return a ? <AssistEditor key={lift} name={program.lifts[lift].label} a={a} onChange={(next) => editAssist(lift, next)} /> : null;
        })}
        <div class="card">
          <div class="field">
            <label for="edit-notes">Notes</label>
            <textarea id="edit-notes" rows={3} value={ev.notes ?? ''} onInput={(e) => setEv({ ...ev, notes: e.currentTarget.value })} />
          </div>
        </div>
        <div class="btn-row">
          <button type="button" class="btn btn-ghost" onClick={props.onDone}>
            Cancel
          </button>
          <button type="button" class="btn btn-primary" onClick={save}>
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

function LiftEditor(props: { log: LiftLog; inv: Inventory; program: Program; onChange: (next: LiftLog) => void }) {
  const { log, inv, program } = props;
  const setSet = (i: number, edit: Partial<LiftLog['sets'][number]>) =>
    props.onChange({ ...log, sets: log.sets.map((s, j) => (j === i ? { ...s, ...edit } : s)) });
  const setAllWeights = (w: number) => props.onChange({ ...log, sets: log.sets.map((s) => ({ ...s, weight: w })) });
  const weight = log.sets[0]?.weight ?? log.prescription.weight;
  const lower = largestLoadableAtOrBelow(weight - 0.01, inv);
  const higher = smallestLoadableAbove(weight, inv);
  const rated = RATED.has(log.prescription.kind) && !log.painStop;
  const options = (CLEAN_ROW.has(log.lift) ? program.effort.cleanRowCategories : program.effort.categories.filter((c) => c.id !== 'missed')).map(
    (c) => ({ value: c.id as EffortRating, label: c.label }),
  );
  return (
    <section class="card" aria-label={`Edit ${program.lifts[log.lift].label}`}>
      <div class="card-title">{program.lifts[log.lift].label}</div>
      <Question text="Weight lifted">
        <div class="stepper" role="group" aria-label={`${program.lifts[log.lift].label} weight`}>
          <button type="button" aria-label="Lighter" disabled={lower === null} onClick={() => lower !== null && setAllWeights(lower)}>
            −
          </button>
          <span class="val">{lb(weight)}</span>
          <button type="button" aria-label="Heavier" disabled={higher === null} onClick={() => higher !== null && setAllWeights(higher)}>
            +
          </button>
        </div>
      </Question>
      {log.sets.map((s, i) => (
        <div class="assist-row" key={i}>
          <div class="what">Set {i + 1}</div>
          <div class="controls">
            <Stepper
              label={`Set ${i + 1} reps`}
              value={s.reps}
              min={0}
              max={20}
              onChange={(reps) => setSet(i, { reps, skipped: false })}
            />
            <button
              type="button"
              class="done-btn"
              aria-pressed={s.formBroke ?? false}
              onClick={() => setSet(i, { formBroke: !s.formBroke, skipped: false })}
            >
              Form
            </button>
            <button
              type="button"
              class="done-btn"
              aria-pressed={s.skipped ?? false}
              onClick={() => setSet(i, s.skipped ? { skipped: false, reps: log.prescription.reps } : { skipped: true, reps: 0, formBroke: false })}
            >
              Skip
            </button>
          </div>
        </div>
      ))}
      {rated &&
        (missed(log) ? (
          <p class="cue">A short or form-broke set: this counts as missed.</p>
        ) : (
          <Question text="How did the last work set feel?">
            <Choice label="Effort rating" options={options} value={log.effort ?? null} onChange={(effort) => props.onChange({ ...log, effort })} />
          </Question>
        ))}
    </section>
  );
}

function AssistEditor(props: { name: string; a: AssistMovementLog; onChange: (next: AssistMovementLog) => void }) {
  const { name, a } = props;
  return (
    <section class="card" aria-label={`Edit ${name}`}>
      <div class="card-title">{name}</div>
      {a.reps.map((r, i) => (
        <div class="assist-row" key={i}>
          <div class="what">Set {i + 1}</div>
          <Stepper label={`${name} set ${i + 1} reps`} value={r} min={0} max={20} onChange={(v) => props.onChange({ ...a, reps: a.reps.map((x, j) => (j === i ? v : x)) })} />
        </div>
      ))}
      <Question text="Reps to spare on the last set?">
        <Choice
          tight
          label={`${name}: reps to spare`}
          options={([0, 1, 2] as SpareReps[]).map((v) => ({ value: v, label: spareLabel(v) }))}
          value={a.spare ?? null}
          onChange={(spare) => props.onChange({ ...a, spare })}
        />
      </Question>
    </section>
  );
}

function ConditioningEditor(props: { event: ConditioningSessionEvent; onDone: () => void }) {
  const { repo } = useApp();
  const [ev, setEv] = useState<ConditioningSessionEvent>(() => structuredClone(props.event));
  const [problem, setProblem] = useState<string | null>(null);
  const save = () =>
    repo
      .update<ConditioningSessionEvent>(ev.id, (draft) => {
        draft.actualMinutes = ev.actualMinutes;
        draft.intervalsDone = ev.intervalsDone;
        if (ev.notes?.trim()) draft.notes = ev.notes.trim();
        else delete draft.notes;
      })
      .then(props.onDone, (e: unknown) => setProblem(`This phone didn't save the change${e instanceof Error ? ` (${e.message})` : ''}.`));
  return (
    <Sheet title={`Edit conditioning · ${shortDate(ev.date)}`} onClose={props.onDone}>
      <p class="note info">{RECALC}</p>
      {problem && (
        <p class="note alarm" role="alert">
          {problem}
        </p>
      )}
      <Question text="Minutes done">
        <Stepper label="Minutes done" value={ev.actualMinutes} min={0} max={120} onChange={(v) => setEv({ ...ev, actualMinutes: v })} />
      </Question>
      {ev.intervalsPlanned > 0 && (
        <Question text="Intervals done">
          <Stepper
            label="Intervals done"
            value={ev.intervalsDone}
            min={0}
            max={ev.intervalsPlanned}
            onChange={(v) => setEv({ ...ev, intervalsDone: v })}
          />
        </Question>
      )}
      <div class="field">
        <label for="edit-cond-notes">Notes</label>
        <textarea id="edit-cond-notes" rows={3} value={ev.notes ?? ''} onInput={(e) => setEv({ ...ev, notes: e.currentTarget.value })} />
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn-ghost" onClick={props.onDone}>
          Cancel
        </button>
        <button type="button" class="btn btn-primary" onClick={() => void save()}>
          Save changes
        </button>
      </div>
    </Sheet>
  );
}
