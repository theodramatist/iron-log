// Lifts (SPEC.md section 5.7): every lift's stage and next prescription, its
// detail and history, and the overrides RULES.md section 17 allows.

import { useMemo, useState } from 'preact/hooks';
import {
  READINGS,
  assistStates,
  effectiveSettings,
  inventoryFrom,
  largestLoadableAtOrBelow,
  liftStates,
  percentWeight,
  smallestLoadableAbove,
  type AssistLiftId,
  type AssistState,
  type BarbellLiftId,
  type Inventory,
  type LiftHistoryEntry,
  type LiftStateView,
  type OverrideEvent,
  type Stage,
} from '../../engine';
import { Sheet, Stepper } from '../components';
import { effortLabel, lb, shortDate } from '../format';
import { useApp } from '../store';

const STAGE: Record<Stage, string> = {
  NORMAL: 'Normal',
  REPEAT: 'Repeat',
  BRIDGE_SHORT: 'Bridge',
  BRIDGE_NORMAL: 'Bridge',
  HOLD: 'Hold',
  GRADUATED: 'Graduated',
};

const MODE: Record<AssistState['mode'], string> = {
  LOAD: 'Assisted',
  REPS_BUILD: 'Building reps',
  BODYWEIGHT: 'Bodyweight',
  WEIGHTED: 'Weighted',
};

function status(s: LiftStateView): string {
  if (s.pain === 'paused') return 'Paused for pain';
  if (s.pain === 'returning') return 'Returning at 90%';
  if (s.needsCalibration) return 'Calibrates first';
  return STAGE[s.stage];
}

function nextText(s: LiftStateView): string {
  const n = s.overrideNext ?? s.next;
  if (s.needsCalibration || !n) return 'Finds its weight the first time';
  const sets = s.overrideNext?.sets ?? s.next?.sets ?? 0;
  const reps = s.overrideNext?.reps ?? s.next?.reps ?? 0;
  return `${sets}×${reps} · ${lb(n.weight)}${s.overrideNext ? ' (changed)' : ''}`;
}

function assistText(a: AssistState): string {
  if (a.needsCalibration) return 'Calibrates first';
  if (a.mode === 'WEIGHTED') return `+${lb(a.addedLoad)} lb on the belt`;
  if (a.mode === 'BODYWEIGHT') return 'Bodyweight';
  return `${lb(a.assistance)} lb help${a.mode === 'REPS_BUILD' ? ` · ${a.targetReps} reps` : ''}`;
}

export function Lifts() {
  const { input, program } = useApp();
  const states = useMemo(() => liftStates(input), [input]);
  const assist = useMemo(() => assistStates(input), [input]);
  const settings = useMemo(() => effectiveSettings(input), [input]);
  const inv = useMemo(() => inventoryFrom(settings), [settings]);
  const lifts: BarbellLiftId[] = ['squat', 'press', 'bench', 'deadlift', settings.pullChoice];
  const [open, setOpen] = useState<BarbellLiftId | AssistLiftId | null>(null);

  return (
    <main class="screen">
      <h1>Lifts</h1>
      <div class="card">
        {lifts.map((lift) => {
          const s = states[lift];
          return (
            <button type="button" class="check-row" key={lift} onClick={() => setOpen(lift)}>
              <span class="what">
                <span class="question-text">{s.label}</span>
                <br />
                <span class="small muted">{status(s)}</span>
              </span>
              <span class="num small">{nextText(s)}</span>
            </button>
          );
        })}
        {(['chin', 'dip'] as const).map((lift) => (
          <button type="button" class="check-row" key={lift} onClick={() => setOpen(lift)}>
            <span class="what">
              <span class="question-text">{program.lifts[lift].label}</span>
              <br />
              <span class="small muted">{MODE[assist[lift].mode]}</span>
            </span>
            <span class="num small">{assistText(assist[lift])}</span>
          </button>
        ))}
      </div>
      {open && (open === 'chin' || open === 'dip') && <AssistDetail lift={open} a={assist[open]} onClose={() => setOpen(null)} />}
      {open && open !== 'chin' && open !== 'dip' && <LiftDetail s={states[open]} inv={inv} onClose={() => setOpen(null)} />}
    </main>
  );
}

function historyLine(h: LiftHistoryEntry, program: ReturnType<typeof useApp>['program']): string {
  const kind = h.kind === 'heavy' ? '' : ` · ${KIND[h.kind] ?? h.kind}`;
  const result = h.result === 'made' ? 'made' : h.result === 'missed' ? 'missed' : h.result === 'painStop' ? 'pain stop' : 'cut short';
  const effort = h.effort && h.result === 'made' ? ` · ${effortLabel(program, h.effort)}` : '';
  return `${shortDate(h.date)} · ${h.sets}×${h.reps} · ${lb(h.weight)}${kind} · ${result}${effort}${h.reset ? ' · reset' : ''}`;
}

const KIND: Partial<Record<LiftHistoryEntry['kind'], string>> = {
  calibration: 'calibration',
  lightDay: 'light day',
  lightWeek: 'light week',
  floor: 'floor week',
  painReturn: 'return',
  graduated: 'graduated',
};

function LiftDetail(props: { s: LiftStateView; inv: Inventory; onClose: () => void }) {
  const app = useApp();
  const { program, repo, today } = app;
  const { s, inv } = props;
  const [editing, setEditing] = useState(false);
  const graduated = s.stage === 'GRADUATED';
  const start = graduated
    ? percentWeight(s.lastCompleted?.weight ?? s.lcw ?? inv.barLb, READINGS.RESTART_SUGGESTED_FRACTION, s.lift, inv)
    : (s.overrideNext?.weight ?? s.next?.weight ?? s.lcw ?? inv.barLb);
  const [weight, setWeight] = useState(start);
  const [reason, setReason] = useState('');
  const pendingOverride = s.overrideNext
    ? (repo.events().filter((e): e is OverrideEvent => e.type === 'override' && e.lift === s.lift && e.field === 'next').at(-1) ?? null)
    : null;

  const facts: [string, string][] = [
    ['Next', nextText(s)],
    ['Base weight', s.lcw === null ? 'Not set yet' : `${lb(s.lcw)} lb`],
    ['Missed reps yet', s.hasMissed ? 'Yes: jumps are capped' : 'No'],
    ['Resets', s.resetCount === 0 ? 'None' : `${s.resetCount}, last from ${lb(s.lastResetFrom ?? 0)}${s.lastResetDate ? ` on ${shortDate(s.lastResetDate)}` : ''}`],
  ];
  if (s.lift === 'squat') facts.push(['Light squat day', s.lightDayOn ? 'On' : 'Off']);
  if (s.lift === 'deadlift') facts.push(['Once-a-week deadlift', s.oncePerWeekOn ? 'On' : 'Off']);
  if (s.lift === 'row' || s.lift === 'powerClean') facts.push(['Jumps', s.hasMissed || s.hasBeenNotCrisp ? '2.5 lb' : '5 lb']);
  if (s.pain !== 'none') facts.push(['Pain', s.pain === 'paused' ? 'Paused' : 'Returning at 90%']);
  if (s.holdUntil) facts.push(['Hold until', shortDate(s.holdUntil)]);

  const lower = largestLoadableAtOrBelow(weight - 0.01, inv);
  const higher = smallestLoadableAbove(weight, inv);

  return (
    <Sheet title={s.label} onClose={props.onClose}>
      <p class="stage">{status(s)}</p>
      {graduated && <p class="cue">{program.stallLadder.graduationMessage.replace('{lift}', s.label.toLowerCase())}</p>}
      <dl class="facts">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd class="num">{v}</dd>
          </div>
        ))}
      </dl>

      {pendingOverride && (
        <p class="note info">
          Next session changed to {lb(pendingOverride.value)}: {pendingOverride.reason}.{' '}
          <button type="button" class="btn-quiet" onClick={() => void repo.remove(pendingOverride.id)}>
            Undo
          </button>
        </p>
      )}

      {!s.needsCalibration && !editing && (
        <button type="button" class="btn btn-ghost" onClick={() => setEditing(true)}>
          {graduated ? 'Restart this lift' : 'Change the next session'}
        </button>
      )}
      {editing && (
        <div class="question">
          <div class="question-text">{graduated ? 'Restart at' : 'Next session at'}</div>
          {graduated && <p class="small muted">The suggestion is 90% of the last weight you completed. Restarting clears this lift's ladder history.</p>}
          <div class="stepper" role="group" aria-label="Weight">
            <button type="button" aria-label="Lighter" disabled={lower === null} onClick={() => lower !== null && setWeight(lower)}>
              −
            </button>
            <span class="val">{lb(weight)}</span>
            <button type="button" aria-label="Heavier" disabled={higher === null} onClick={() => higher !== null && setWeight(higher)}>
              +
            </button>
          </div>
          <div class="field">
            <label for="override-reason">Why (optional)</label>
            <input id="override-reason" value={reason} onInput={(e) => setReason(e.currentTarget.value)} />
          </div>
          <div class="btn-row">
            <button type="button" class="btn btn-ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              type="button"
              class="btn btn-primary"
              onClick={() => {
                void app.log({
                  type: 'override',
                  date: today,
                  lift: s.lift,
                  field: graduated ? 'restart' : 'next',
                  value: weight,
                  reason: reason.trim() || (graduated ? 'Restart' : 'Changed by hand'),
                });
                setEditing(false);
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      <div class="card-kicker" style={{ marginTop: '16px' }}>
        History
      </div>
      {s.history.length === 0 ? (
        <p class="small muted">Nothing logged yet.</p>
      ) : (
        <ul class="lines">
          {[...s.history].reverse().map((h, i) => (
            <li key={i} class="small">
              {historyLine(h, program)}
            </li>
          ))}
        </ul>
      )}
      <button type="button" class="btn btn-ghost" style={{ marginTop: '12px' }} onClick={props.onClose}>
        Done
      </button>
    </Sheet>
  );
}

function AssistDetail(props: { lift: AssistLiftId; a: AssistState; onClose: () => void }) {
  const app = useApp();
  const { program, today } = app;
  const { a } = props;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(a.mode === 'LOAD' || a.mode === 'REPS_BUILD' ? a.assistance : 0);
  const [reason, setReason] = useState('');
  const facts: [string, string][] = [
    ['Now', assistText(a)],
    ['Mode', MODE[a.mode]],
    ['Target reps', `${a.targetReps} a set`],
    ['Step', `${lb(a.step)} lb`],
  ];
  if (a.lastMadeAssistance !== null) facts.push(['Last made at', `${lb(a.lastMadeAssistance)} lb help`]);
  return (
    <Sheet title={program.lifts[props.lift].label} onClose={props.onClose}>
      <dl class="facts">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd class="num">{v}</dd>
          </div>
        ))}
      </dl>
      {!editing ? (
        <button type="button" class="btn btn-ghost" onClick={() => setEditing(true)}>
          Set the assistance
        </button>
      ) : (
        <div class="question">
          <div class="question-text">Assistance (lb of help)</div>
          <p class="small muted">0 means bodyweight.</p>
          <Stepper label="Assistance" value={value} step={5} min={0} max={300} onChange={setValue} />
          <div class="field">
            <label for="assist-reason">Why (optional)</label>
            <input id="assist-reason" value={reason} onInput={(e) => setReason(e.currentTarget.value)} />
          </div>
          <div class="btn-row">
            <button type="button" class="btn btn-ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              type="button"
              class="btn btn-primary"
              onClick={() => {
                void app.log({ type: 'override', date: today, lift: props.lift, field: 'assistance', value, reason: reason.trim() || 'Set by hand' });
                setEditing(false);
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}
      <button type="button" class="btn btn-ghost" style={{ marginTop: '12px' }} onClick={props.onClose}>
        Done
      </button>
    </Sheet>
  );
}
