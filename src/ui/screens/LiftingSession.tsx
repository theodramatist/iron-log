// The lifting session (SPEC.md section 5.3). Every tap goes into the draft,
// which is saved to IndexedDB on each change and logged as one event at Finish.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  effectiveSettings,
  inventoryFrom,
  jumpChoices,
  largestLoadableAtOrBelow,
  liftStates,
  planFor,
  platesPerSide,
  smallestLoadableAbove,
  timeGuard,
  timerRemainingSec,
  triggers,
  type AssistMovementPlan,
  type BarbellLiftId,
  type EffortRating,
  type EngineInput,
  type EquipmentDown,
  type Inventory,
  type LiftPlan,
  type LiftStateView,
  type SessionPlan,
  type SpareReps,
  type Stage,
} from '../../engine';
import { alertNow, useWakeLock } from '../alerts';
import { nowIso } from '../clock';
import { Choice, Confirm, PlateBar, Question, Sheet, Stepper, YesNo, useLongPress } from '../components';
import { clock, lb, platesText, shortDate, spareLabel, wallTime } from '../format';
import { useNow } from '../hooks';
import {
  adjustTimer,
  answerLayoffHeavy,
  assistCalibrationDraft,
  assistCalibrationNeeded,
  assistCalibrationReps,
  assistCalibrationStep,
  assistRowReps,
  assistRows,
  assistSetting,
  calibratedWeight,
  clearTimer,
  isRated,
  liftDraft,
  liftMissed,
  lowerRampReps,
  lowerReps,
  missingRatings,
  missingSpare,
  nextRampWeight,
  progressOf,
  rampVerdict,
  ratesCrisp,
  sessionPlan,
  setEffort,
  setSpare,
  setSubstitutionReps,
  setWorkWeight,
  startTimer,
  substitutionReps,
  tapAssistRow,
  tapSet,
  toLiftingEvent,
  toggleFormBroke,
  toggleNegative,
  togglePainStop,
  toggleSkipped,
  toggleWarmup,
  undoAssistCalibration,
  undoRamp,
  wantsRating,
  workWeightOf,
  type CheckInId,
  type LiftingDraft,
} from '../session/lifting';
import { useApp } from '../store';

type Update = (next: LiftingDraft) => void;

interface Summary {
  lines: { lift: BarbellLiftId; label: string; next: string; change: string | null }[];
  food: string[];
  suggestions: string[];
  stopped: boolean;
}

export function LiftingSession(props: { initial: LiftingDraft; onClose: () => void }) {
  const app = useApp();
  const { repo, program, input } = app;
  const [d, setD] = useState<LiftingDraft>(props.initial);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sheet, setSheet] = useState<null | 'stop' | 'menu' | 'discard'>(null);
  const update: Update = (next) => {
    setD(next);
    void repo.saveDraft('lifting', next);
  };
  const planKey = JSON.stringify([d.date, d.answers, d.jointPainLifts, d.painAnswers, d.equipmentDown]);
  const frozen = useRef<SessionPlan | null>(null);
  const live = useMemo(() => sessionPlan(input, d), [input, planKey]);
  // Once the session is logged, the log includes it: keep showing the plan it ran.
  const plan = summary && frozen.current ? frozen.current : live;
  const inv = useMemo(() => inventoryFrom(effectiveSettings(input, d.date)), [input, d.date]);
  const now = useNow(1000, !d.past && !summary);
  useWakeLock(!summary);

  const remaining = d.timer ? timerRemainingSec(d.timer, new Date(now).toISOString()) : null;
  const alerted = useRef<string | null>(null);
  useEffect(() => {
    if (d.timer && remaining === 0 && alerted.current !== d.timer.startedAt) {
      alerted.current = d.timer.startedAt;
      alertNow();
    }
  }, [remaining, d.timer]);

  const elapsed = d.startedAt ? Math.max(0, (now - Date.parse(d.startedAt)) / 1000) : 0;
  const guard = !d.past && d.step === 'lifting' ? timeGuard(plan, progressOf(plan, d), elapsed, d.cutsApplied, program) : null;

  const save = async (stopped: boolean) => {
    frozen.current = live;
    const before = liftStates({ ...input, today: d.date });
    const beforeSuggestions = triggers({ ...input, today: d.date });
    await repo.add(toLiftingEvent(live, d, { endedAt: nowIso(), stopped }));
    await repo.clearDraft('lifting');
    const after: EngineInput = repo.input(app.today);
    setSummary(buildSummary(program.lifts, live, before, after, beforeSuggestions, d, stopped));
  };

  const discard = async () => {
    await repo.clearDraft('lifting');
    props.onClose();
  };

  return (
    <div class="session" role="dialog" aria-modal="true" aria-label="Lifting session">
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
                {guard && d.startedAt ? `Done about ${wallTime(Date.parse(d.startedAt) + guard.projectedMin * 60_000)} · ${Math.round(guard.projectedMin)} min` : `Workout ${plan.workout}`}
              </div>
            </>
          )}
        </div>
        {!summary && (
          <button type="button" class="menu-btn" aria-label="Session menu" onClick={() => setSheet('menu')}>
            ⋯
          </button>
        )}
        {!summary && (
          <button type="button" class="stop-btn" onClick={() => setSheet('stop')}>
            Stop session
          </button>
        )}
      </div>

      <div class="session-body">
        {summary ? (
          <SummaryView summary={summary} d={d} onDone={props.onClose} />
        ) : d.step === 'checkIn' ? (
          <CheckInView plan={plan} d={d} update={update} />
        ) : d.step === 'lifting' ? (
          <LiftingView plan={plan} d={d} update={update} inv={inv} guard={guard} />
        ) : (
          <FinishView plan={plan} d={d} update={update} onSave={() => void save(false)} />
        )}
      </div>

      {!summary && d.timer && remaining !== null && (
        <RestTimer label={d.timer.label} remaining={remaining} total={d.timer.durationSec + d.timer.adjustSec} d={d} update={update} />
      )}

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
      {sheet === 'menu' && <SessionMenu d={d} update={update} onClose={() => setSheet(null)} onDiscard={() => setSheet('discard')} />}
      {sheet === 'discard' && (
        <Confirm
          title="Discard this session?"
          message="Nothing from it is logged."
          confirm="Discard"
          onCancel={() => setSheet(null)}
          onConfirm={() => void discard()}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------ check-in

function CheckInView(props: { plan: SessionPlan; d: LiftingDraft; update: Update }) {
  const app = useApp();
  const { program, input } = app;
  const { d, update } = props;
  // The questions come from a plan without today's answers, so answering doesn't move them.
  const askPlan = useMemo(
    () => sessionPlan(input, { ...d, answers: { ...d.answers, jointPain: false }, jointPainLifts: [], painAnswers: {} }),
    [input, d.date, d.answers.flatFromIntervals],
  );
  const open = triggers({ ...input, today: d.date }).filter((s) => s.kind === 'foodLever');
  const questions = askPlan.checkIns.start;
  const paused = askPlan.paused;
  const answered = questions.every((q) => d.answers[q.id as CheckInId] !== undefined);
  const jointOk = !d.answers.jointPain || d.jointPainLifts.length > 0;
  const painOk = paused.every((p) => d.painAnswers[p.lift] !== undefined);
  const ready = answered && jointOk && painOk && open.length === 0;

  const answer = (id: CheckInId, v: boolean) =>
    update({ ...d, answers: { ...d.answers, [id]: v }, ...(id === 'jointPain' && !v ? { jointPainLifts: [] } : {}) });

  return (
    <>
      <h1>{d.past ? 'Past session' : 'Check-in'}</h1>
      {props.plan.sameDayWarning && <p class="note">A lifting session is already logged for this day. Two on one day is allowed.</p>}
      {d.past && props.plan.needsConsecutiveConfirm && <p class="note">This makes two lifting days in a row.</p>}
      {open.length > 0 && (
        <div class="card">
          <Question text={program.stallLadder.foodLever.question}>
            <p class="small muted">Your answer covers every lift waiting on it.</p>
            <YesNo
              label={program.stallLadder.foodLever.question}
              value={null}
              onChange={(v) => {
                const lift = open[0]!.lift as BarbellLiftId;
                void app.log({ type: 'foodLeverAnswer', date: d.date, lift, answer: v });
              }}
            />
          </Question>
        </div>
      )}
      <div class="card">
        {questions.map((q) => (
          <Question key={q.id} text={q.text}>
            <YesNo label={q.text} value={d.answers[q.id as CheckInId]} onChange={(v) => answer(q.id as CheckInId, v)} />
            {q.id === 'jointPain' && d.answers.jointPain && (
              <>
                <p class="small muted">Which lift? It stops for today.</p>
                <div class="chips">
                  {askPlan.lifts.map((lp) => {
                    const on = d.jointPainLifts.includes(lp.lift);
                    return (
                      <button
                        type="button"
                        class="chip"
                        key={lp.lift}
                        aria-pressed={on}
                        onClick={() =>
                          update({ ...d, jointPainLifts: on ? d.jointPainLifts.filter((l) => l !== lp.lift) : [...d.jointPainLifts, lp.lift] })
                        }
                      >
                        {lp.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </Question>
        ))}
      </div>
      {paused.length > 0 && (
        <div class="card">
          {paused.map((p) => (
            <Question key={p.lift} text={p.question}>
              <YesNo
                label={p.question}
                value={d.painAnswers[p.lift] === undefined ? null : d.painAnswers[p.lift] === 'gone'}
                yes="Yes, it's gone"
                no="Still there"
                onChange={(v) => update({ ...d, painAnswers: { ...d.painAnswers, [p.lift]: v ? 'gone' : 'stillThere' } })}
              />
              {d.painAnswers[p.lift] === 'stillThere' && <p class="small">{program.safety.pausedLiftStillThere}</p>}
              <button
                type="button"
                class="btn-quiet"
                onClick={() => {
                  void app.log({ type: 'painCleared', date: d.date, lift: p.lift, how: 'clinician' });
                  const rest = { ...d.painAnswers };
                  delete rest[p.lift];
                  update({ ...d, painAnswers: rest });
                }}
              >
                {program.safety.clinicianClearedButton}
              </button>
            </Question>
          ))}
        </div>
      )}
      <button type="button" class="btn btn-primary" disabled={!ready} onClick={() => update({ ...d, step: 'lifting' })}>
        Begin
      </button>
    </>
  );
}

// ------------------------------------------------------------ lifting

type Guard = ReturnType<typeof timeGuard> | null;

function LiftingView(props: { plan: SessionPlan; d: LiftingDraft; update: Update; inv: Inventory; guard: Guard }) {
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

function liftHeader(lp: LiftPlan, weight: number) {
  return (
    <div class="spread" style={{ alignItems: 'flex-start' }}>
      <div>
        <div class="card-kicker">Slot {lp.slot}</div>
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

function WarmupRows(props: { lp: LiftPlan; d: LiftingDraft; update: Update; cut: boolean }) {
  const { lp, d, update } = props;
  const l = liftDraft(d, lp);
  if (lp.warmups.length === 0) return null;
  return (
    <div style={{ marginTop: '8px' }}>
      <div class="card-kicker">Warm-ups</div>
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

function LiftCard(props: { lp: LiftPlan; d: LiftingDraft; update: Update; inv: Inventory }) {
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
    if (!wasDone) next = startTimer(next, lp.label, lp.restSec, nowIso());
    update(next);
  };
  const minus = (i: number) => {
    const wasDone = l.sets[i]?.state === 'done';
    let next = lowerReps(d, lp, i);
    if (!wasDone) next = startTimer(next, lp.label, lp.restSec, nowIso());
    update(next);
  };

  return (
    <section class="card" aria-label={lp.label}>
      <div class="spread" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>{liftHeader(lp, W)}</div>
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
          <WarmupRows lp={lp} d={d} update={update} cut={d.cutsApplied >= 2} />
          {askLayoff && (
            <Question text="Did that warm-up feel heavy?">
              <YesNo label="Did that warm-up feel heavy?" value={l.layoffHeavy} onChange={(v) => update(answerLayoffHeavy(d, lp, v))} />
              {l.layoffHeavy && <p class="small">Work sets drop to {lb(lp.layoffHeavyWeight!)}.</p>}
            </Question>
          )}
          <div class="card-kicker" style={{ marginTop: '12px' }}>
            Work sets
          </div>
          <div class="sets">
            {l.sets.map((s, i) => (
              <SetButton key={i} n={i + 1} target={lp.reps} s={s} onTap={() => tap(i)} onMinus={() => minus(i)} onForm={() => update(toggleFormBroke(d, lp, i))} onSkip={() => update(toggleSkipped(d, lp, i))} />
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

function SetButton(props: {
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

function EffortChips(props: { lift: BarbellLiftId; value: EffortRating | null; onChange: (e: EffortRating) => void }) {
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

function WeightChanger(props: { weight: number; prescribed: number; inv: Inventory; onChange: (w: number) => void }) {
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

// ------------------------------------------------------------ calibration

function CalibrationCard(props: { lp: LiftPlan; d: LiftingDraft; update: Update; inv: Inventory }) {
  const { lp, d, update, inv } = props;
  const cal = lp.calibration!;
  const l = liftDraft(d, lp);
  const found = calibratedWeight(lp, l);
  const current = nextRampWeight(lp, l);
  const reps = l.rampReps ?? cal.repsPerSet;
  const [fast, slowing, slowed] = cal.buttons as [string, string, string];
  const tap = (i: number) => {
    const wasDone = l.sets[i]?.state === 'done';
    let next = tapSet(d, lp, i);
    if (!wasDone) next = startTimer(next, lp.label, lp.restSec, nowIso());
    update(next);
  };
  return (
    <section class="card" aria-label={`${lp.label} calibration`}>
      <div class="card-kicker">Slot {lp.slot} · First time</div>
      <div class="card-title">{lp.label}: find the work weight</div>
      {lp.cues.map((c) => (
        <p class="cue" key={c}>
          {c}
        </p>
      ))}
      {l.ramp.length > 0 && (
        <ul class="lines">
          {l.ramp.map((s, i) => (
            <li key={i}>
              {lb(s.weight)} × {s.reps} · {s.verdict === 'fast' ? fast : s.verdict === 'slowing' ? slowing : slowed}
            </li>
          ))}
        </ul>
      )}
      {found === null ? (
        <>
          <div class="spread" style={{ marginTop: '10px' }}>
            <div class="big">{lb(current)}</div>
            <Stepper label="Reps" value={reps} min={0} max={cal.repsPerSet} onChange={(v) => update(lowerRampReps(d, lp, v - reps))} />
          </div>
          <PlateBar weight={current} plates={platesPerSide(current, inv) ?? []} />
          <p class="small muted">
            Sets of {cal.repsPerSet}. After each set, tap how the bar moved.
          </p>
          <div class="chips">
            <button type="button" class="chip" disabled={reps < cal.repsPerSet} onClick={() => update(rampVerdict(d, lp, 'fast'))}>
              {fast}
            </button>
            <button type="button" class="chip" disabled={reps < cal.repsPerSet} onClick={() => update(rampVerdict(d, lp, 'slowing'))}>
              {slowing}
            </button>
            <button type="button" class="chip" onClick={() => update(startTimer(rampVerdict(d, lp, 'slowed'), lp.label, lp.restSec, nowIso()))}>
              {slowed}
            </button>
          </div>
        </>
      ) : (
        <>
          <p class="stage">Work weight {lb(found)}</p>
          <PlateBar weight={found} plates={platesPerSide(found, inv) ?? []} />
          <div class="sets">
            {l.sets.map((s, i) => (
              <SetButton
                key={i}
                n={i + 1}
                target={cal.repsPerSet}
                s={s}
                onTap={() => tap(i)}
                onMinus={() => update(lowerReps(d, lp, i))}
                onForm={() => update(toggleFormBroke(d, lp, i))}
                onSkip={() => update(toggleSkipped(d, lp, i))}
              />
            ))}
          </div>
          {wantsRating(lp, l) && <EffortChips lift={lp.lift} value={l.effort} onChange={(e) => update(setEffort(d, lp, e))} />}
          {liftMissed(lp, l) && <p class="cue">Missed reps. The rating is set to missed.</p>}
        </>
      )}
      {l.ramp.length > 0 && (
        <button type="button" class="btn-quiet" onClick={() => update(undoRamp(d, lp))}>
          Undo the last calibration set
        </button>
      )}
    </section>
  );
}

// ------------------------------------------------------------ chins and dips

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

function AssistBlock(props: { plan: SessionPlan; d: LiftingDraft; update: Update }) {
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
        {a.rounds} rounds, {Math.round(a.restSec / 15) * 15} seconds between sets.
      </p>
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

// ------------------------------------------------------------ rest timer

function RestTimer(props: { label: string; remaining: number; total: number; d: LiftingDraft; update: Update }) {
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

// ------------------------------------------------------------ menu

const EQUIPMENT: { id: EquipmentDown; label: string }[] = [
  { id: 'assistMachine', label: 'Assist machine down' },
  { id: 'skiErg', label: 'SkiErg unavailable' },
  { id: 'airBike', label: 'Air bike unavailable' },
];

function SessionMenu(props: { d: LiftingDraft; update: Update; onClose: () => void; onDiscard: () => void }) {
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

// ------------------------------------------------------------ finish

function FinishView(props: { plan: SessionPlan; d: LiftingDraft; update: Update; onSave: () => void }) {
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
          props.onSave();
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

function buildSummary(
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

function SummaryView(props: { summary: Summary; d: LiftingDraft; onDone: () => void }) {
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
