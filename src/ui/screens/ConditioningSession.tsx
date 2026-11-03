// The conditioning session (SPEC.md section 5.4): the check-in, the target,
// the screening gate before the first intervals, a segmented timer, and Finish.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { planFor, type ConditioningPlan, type EquipmentDown } from '../../engine';
import { alertNow, useWakeLock } from '../alerts';
import { nowIso } from '../clock';
import { Confirm, Question, Sheet, Stepper, YesNo } from '../components';
import { clock, shortDate } from '../format';
import { useNow } from '../hooks';
import {
  conditioningPlanOf,
  elapsedSec,
  finish,
  pause,
  positionAt,
  resume,
  start,
  timeline,
  toConditioningEvent,
  totalSec,
  type ConditioningDraft,
  type Segment,
} from '../session/conditioning';
import { useApp } from '../store';

type Update = (next: ConditioningDraft) => void;

export function ConditioningSession(props: { initial: ConditioningDraft; onClose: () => void }) {
  const app = useApp();
  const { repo, program, input } = app;
  const [d, setD] = useState<ConditioningDraft>(props.initial);
  const [done, setDone] = useState<null | { food: string[]; stopped: boolean }>(null);
  const [sheet, setSheet] = useState<null | 'stop' | 'menu' | 'discard'>(null);
  const update: Update = (next) => {
    setD(next);
    void repo.saveDraft('conditioning', next);
  };
  const planKey = JSON.stringify([d.date, d.shortNight, d.targetMinutes, d.intervals, d.equipmentDown]);
  const frozen = useRef<ConditioningPlan | null>(null);
  const live = useMemo(() => conditioningPlanOf(input, d), [input, planKey]);
  const plan = done && frozen.current ? frozen.current : live;
  const running = d.step === 'running' && !d.past;
  const now = useNow(250, running);
  useWakeLock(!done);

  const segs = useMemo(() => timeline(plan, program), [plan, program]);
  const elapsed = elapsedSec(d, new Date(now).toISOString());
  const pos = positionAt(segs, elapsed);

  // A tone and a flash at each change of segment, and at the end.
  const lastIndex = useRef<number | null>(null);
  useEffect(() => {
    if (!running) {
      lastIndex.current = null;
      return;
    }
    if (lastIndex.current !== null && pos.index !== lastIndex.current) alertNow(pos.finished ? 3 : 2);
    lastIndex.current = pos.index;
    if (pos.finished) update(finish(d, plan, program, nowIso()));
  }, [pos.index, running]);

  const save = async (stopped: boolean) => {
    frozen.current = live;
    await repo.add(toConditioningEvent(live, d, { stopped }));
    await repo.clearDraft('conditioning');
    setDone({ food: stopped ? [] : planFor(repo.input(app.today), d.date).foodLines, stopped });
  };

  return (
    <div class="session" role="dialog" aria-modal="true" aria-label="Conditioning session">
      <div class="session-top">
        <div class="clock">
          {d.past ? (
            <>
              <div class="num">Past entry</div>
              <div class="sub">{shortDate(d.date)}</div>
            </>
          ) : (
            <>
              <div class="num" role="timer" aria-label="Session time">
                {clock(elapsed)}
              </div>
              <div class="sub">
                {plan.targetMinutes} min{plan.intervals > 0 ? ` · ${plan.intervals} intervals` : ''}
              </div>
            </>
          )}
        </div>
        {!done && (
          <button type="button" class="menu-btn" aria-label="Session menu" onClick={() => setSheet('menu')}>
            ⋯
          </button>
        )}
        {!done && (
          <button type="button" class="stop-btn" onClick={() => setSheet('stop')}>
            Stop session
          </button>
        )}
      </div>

      <div class="session-body">
        {done ? (
          <DoneView done={done} onClose={props.onClose} />
        ) : d.step === 'checkIn' ? (
          <CheckIn d={d} update={update} />
        ) : d.step === 'setup' ? (
          <SetupView plan={plan} d={d} update={update} />
        ) : d.step === 'running' ? (
          <RunningView plan={plan} d={d} update={update} segs={segs} pos={pos} elapsed={elapsed} />
        ) : (
          <FinishView plan={plan} d={d} update={update} onSave={() => void save(false)} />
        )}
      </div>

      {sheet === 'stop' && (
        <Sheet title="Stop session" onClose={() => setSheet(null)}>
          <p class="note alarm">{program.safety.stopSessionMessage}</p>
          <p>Ending here logs the session as stopped. Nothing from it counts.</p>
          <div class="btn-row">
            <button type="button" class="btn btn-ghost" onClick={() => setSheet(null)}>
              Keep going
            </button>
            <button
              type="button"
              class="btn btn-primary"
              onClick={() => {
                setSheet(null);
                void save(true);
              }}
            >
              End session
            </button>
          </div>
        </Sheet>
      )}
      {sheet === 'menu' && <Menu d={d} update={update} onClose={() => setSheet(null)} onDiscard={() => setSheet('discard')} />}
      {sheet === 'discard' && (
        <Confirm
          title="Discard this session?"
          message="Nothing from it is logged."
          confirm="Discard"
          onCancel={() => setSheet(null)}
          onConfirm={() => {
            void repo.clearDraft('conditioning').then(props.onClose);
          }}
        />
      )}
    </div>
  );
}

function CheckIn(props: { d: ConditioningDraft; update: Update }) {
  const { program } = useApp();
  const { d, update } = props;
  const q = program.checkIns.conditioningStart[0]!;
  return (
    <>
      <h1>{d.past ? 'Past session' : 'Check-in'}</h1>
      <div class="card">
        <Question text={q.text}>
          <YesNo label={q.text} value={d.shortNight} onChange={(v) => update({ ...d, shortNight: v, step: 'setup' })} />
        </Question>
      </div>
    </>
  );
}

function SetupView(props: { plan: ConditioningPlan; d: ConditioningDraft; update: Update }) {
  const app = useApp();
  const { program, input } = app;
  const { plan, d, update } = props;
  const defaults = useMemo(() => conditioningPlanOf(input, { ...d, intervals: null }), [input, d.date, d.shortNight, d.targetMinutes, d.equipmentDown]);
  const canChooseIntervals = plan.intervals > 0 && plan.maxIntervals > defaults.intervals;
  const begin = () => {
    if (d.past) update(finish({ ...d, step: 'finish' }, plan, program, nowIso()));
    else update(start(d, nowIso()));
  };
  return (
    <>
      <div class="eyebrow">
        Conditioning week <b>{plan.conditioningWeek}</b> · Phase <b>{plan.phase}</b>
      </div>
      <h1>{plan.intervals > 0 ? 'Intervals' : 'Easy minutes'}</h1>
      {plan.layoffDrop === 'phase' && <p class="note info">More than 21 days since the last session: down one phase.</p>}
      {plan.layoffDrop === 'restart' && <p class="note info">More than 60 days since the last session: back to conditioning week 1.</p>}
      <div class="card">
        <Question text="Minutes">
          <div class="spread">
            <Stepper label="Minutes" value={plan.targetMinutes} step={5} min={plan.minMinutes} max={plan.range[1]} onChange={(v) => update({ ...d, targetMinutes: v })} />
            <span class="small muted">
              Phase range {plan.range[0]}–{plan.range[1]}. Down to {plan.minMinutes} when short on time.
            </span>
          </div>
        </Question>
        {canChooseIntervals && (
          <Question text="Intervals">
            <Stepper label="Intervals" value={plan.intervals} min={defaults.intervals} max={plan.maxIntervals} onChange={(v) => update({ ...d, intervals: v })} />
          </Question>
        )}
        {plan.noIntervalsReason && <p class="cue">{plan.noIntervalsReason}</p>}
        <ul class="lines">
          <li>
            Easy · {plan.machines.easy} · {program.conditioning.easy.intensity}
          </li>
          {plan.intervals > 0 && plan.layout && (
            <li>
              {plan.intervals} × 30 s hard, 90 s easy · {plan.machines.intervals} · {Math.round(plan.layout.easyBeforeSec / 60)} easy minutes before and after
            </li>
          )}
        </ul>
      </div>
      {plan.screeningGate ? (
        <>
          <div class="note">{program.safety.screeningNote}</div>
          <button
            type="button"
            class="btn btn-primary"
            onClick={() => void app.log({ type: 'screeningAcknowledged', date: d.date, context: 'intervals' })}
          >
            I've read this
          </button>
        </>
      ) : (
        <button type="button" class="btn btn-primary" onClick={begin}>
          {d.past ? 'Next' : 'Start'}
        </button>
      )}
    </>
  );
}

function segmentName(s: Segment, total: number): string {
  if (s.kind === 'hard') return `Hard · ${s.machine} · ${s.round} of ${total}`;
  return `Easy · ${s.machine}`;
}

function RunningView(props: {
  plan: ConditioningPlan;
  d: ConditioningDraft;
  update: Update;
  segs: Segment[];
  pos: ReturnType<typeof positionAt>;
  elapsed: number;
}) {
  const { program } = useApp();
  const { plan, d, update, segs, pos, elapsed } = props;
  const seg = pos.segment;
  const paused = d.pausedAt !== null;
  return (
    <>
      {seg && (
        <div class="countdown" aria-live="polite">
          <div class={seg.kind === 'hard' ? 'seg hard' : 'seg'}>{segmentName(seg, plan.intervals)}</div>
          <div class="time" role="timer">
            {clock(pos.remainingSec)}
          </div>
          <div class="next">
            {pos.next ? `Next: ${segmentName(pos.next, plan.intervals)}, ${clock(pos.next.sec)}` : 'Next: finish'}
          </div>
          <p class="cue">{seg.kind === 'hard' ? program.conditioning.interval.intensity : program.conditioning.easy.intensity}</p>
        </div>
      )}
      <div class="card">
        <div class="spread">
          <span class="small muted">Elapsed</span>
          <span class="num">
            {clock(elapsed)} of {clock(totalSec(segs))}
          </span>
        </div>
        {plan.intervals > 0 && (
          <div class="spread">
            <span class="small muted">Intervals done</span>
            <span class="num">
              {pos.intervalsDone} of {plan.intervals}
            </span>
          </div>
        )}
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn-ghost" onClick={() => update(paused ? resume(d, nowIso()) : pause(d, nowIso()))}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" class="btn btn-primary" onClick={() => update(finish(d, plan, program, nowIso()))}>
          Finish
        </button>
      </div>
    </>
  );
}

function FinishView(props: { plan: ConditioningPlan; d: ConditioningDraft; update: Update; onSave: () => void }) {
  const { plan, d, update } = props;
  const [saving, setSaving] = useState(false);
  return (
    <>
      <h1>Finish</h1>
      <div class="card">
        <Question text="Minutes done">
          <Stepper label="Minutes done" value={d.actualMinutes ?? plan.targetMinutes} min={0} max={plan.range[1]} onChange={(v) => update({ ...d, actualMinutes: v })} />
        </Question>
        {plan.intervals > 0 && (
          <Question text="Intervals done">
            <Stepper label="Intervals done" value={d.intervalsDone ?? plan.intervals} min={0} max={plan.intervals} onChange={(v) => update({ ...d, intervalsDone: v })} />
          </Question>
        )}
        <div class="field">
          <label for="cond-notes">Notes</label>
          <textarea id="cond-notes" rows={3} value={d.notes} onInput={(e) => update({ ...d, notes: e.currentTarget.value })} />
        </div>
      </div>
      <button
        type="button"
        class="btn btn-primary"
        disabled={saving}
        onClick={() => {
          setSaving(true);
          props.onSave();
        }}
      >
        Save session
      </button>
      {!d.past && d.startedAt && (
        <button type="button" class="btn-quiet" onClick={() => update(resume({ ...d, step: 'running' }, nowIso()))}>
          Back to the timer
        </button>
      )}
    </>
  );
}

function DoneView(props: { done: { food: string[]; stopped: boolean }; onClose: () => void }) {
  const { program } = useApp();
  const { done } = props;
  return (
    <>
      <h1>{done.stopped ? 'Stopped' : 'Logged'}</h1>
      {done.stopped && <p class="note alarm">{program.safety.stopSessionMessage}</p>}
      {done.food.length > 0 && (
        <div class="note ok">
          {done.food.map((f) => (
            <div key={f}>{f}</div>
          ))}
        </div>
      )}
      <button type="button" class="btn btn-primary" onClick={props.onClose}>
        Done
      </button>
    </>
  );
}

const EQUIPMENT: { id: EquipmentDown; label: string }[] = [
  { id: 'skiErg', label: 'SkiErg unavailable' },
  { id: 'airBike', label: 'Air bike unavailable' },
];

function Menu(props: { d: ConditioningDraft; update: Update; onClose: () => void; onDiscard: () => void }) {
  const { d, update } = props;
  return (
    <Sheet title="Session" onClose={props.onClose}>
      <div class="card-kicker">Equipment down</div>
      <div class="chips">
        {EQUIPMENT.map((e) => {
          const on = d.equipmentDown.includes(e.id);
          return (
            <button
              type="button"
              class="chip"
              key={e.id}
              aria-pressed={on}
              onClick={() => update({ ...d, equipmentDown: on ? d.equipmentDown.filter((x) => x !== e.id) : [...d.equipmentDown, e.id] })}
            >
              {e.label}
            </button>
          );
        })}
      </div>
      <div class="btn-row" style={{ marginTop: '18px' }}>
        <button type="button" class="btn btn-ghost" onClick={props.onDiscard}>
          Discard session
        </button>
        <button type="button" class="btn btn-primary" onClick={props.onClose}>
          Done
        </button>
      </div>
    </Sheet>
  );
}
