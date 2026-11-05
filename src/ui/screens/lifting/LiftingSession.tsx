// The lifting session (SPEC.md section 5.3). Every tap goes into the draft,
// which is saved to IndexedDB on each change and logged as one event at Finish.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  effectiveSettings,
  inventoryFrom,
  liftStates,
  timeGuard,
  timerRemainingSec,
  triggers,
  type EngineInput,
  type SessionPlan,
} from '../../../engine';
import { alertNow } from '../../alerts';
import { nowIso } from '../../clock';
import { wallTime } from '../../format';
import { useNow } from '../../hooks';
import { progressOf, sessionPlan, toLiftingEvent, type LiftingDraft } from '../../session/lifting';
import { useApp } from '../../store';
import {
  DRAFT_NOT_SAVED,
  DiscardConfirm,
  EarlierDayNote,
  Problem,
  SessionMenu,
  SessionTop,
  StopSheet,
  saveFailed,
  useSessionScreen,
} from '../session/SessionFrame';
import { CheckInView } from './CheckIn';
import { FinishView, SummaryView, buildSummary, type Summary } from './Finish';
import { LiftingView } from './LiftingView';
import { RestTimer } from './RestTimer';
import type { Update } from './shared';

export function LiftingSession(props: { initial: LiftingDraft; onClose: () => void }) {
  const app = useApp();
  const { repo, program, input } = app;
  const [d, setD] = useState<LiftingDraft>(props.initial);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sheet, setSheet] = useState<null | 'stop' | 'menu' | 'discard'>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const update: Update = (next) => {
    setD(next);
    repo.saveDraft('lifting', next).catch(() => setProblem(DRAFT_NOT_SAVED));
  };
  const planKey = JSON.stringify([d.date, d.answers, d.jointPainLifts, d.painAnswers, d.equipmentDown]);
  const frozen = useRef<SessionPlan | null>(null);
  const live = useMemo(() => sessionPlan(input, d), [input, planKey]);
  // Once the session is logged, the log includes it: keep showing the plan it ran.
  const plan = summary && frozen.current ? frozen.current : live;
  const inv = useMemo(() => inventoryFrom(effectiveSettings(input, d.date)), [input, d.date]);
  const now = useNow(1000, !d.past && !summary);
  useSessionScreen(!summary);

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

  /** Log the session. Resolves false, with a message on screen, if the phone didn't save it. */
  const save = async (stopped: boolean): Promise<boolean> => {
    // Read as of the session's date, so a past entry's summary leaves out later sessions.
    const asOf: EngineInput = { ...input, today: d.date };
    const before = liftStates(asOf);
    const beforeSuggestions = triggers(asOf);
    try {
      await repo.add(toLiftingEvent(live, d, { endedAt: nowIso(), stopped }));
    } catch (e) {
      setProblem(saveFailed(e));
      return false;
    }
    frozen.current = live;
    await repo.clearDraft('lifting').catch(() => undefined);
    const after: EngineInput = { ...repo.input(app.today), today: d.date };
    setProblem(null);
    setSummary(buildSummary(program.lifts, live, before, after, beforeSuggestions, d, stopped));
    return true;
  };

  const discard = () =>
    repo.clearDraft('lifting').then(props.onClose, (e: unknown) => {
      setSheet(null);
      setProblem(saveFailed(e));
    });

  const sub =
    guard && d.startedAt
      ? `Done about ${wallTime(Date.parse(d.startedAt) + guard.projectedMin * 60_000)} · ${Math.round(guard.projectedMin)} min`
      : `Workout ${plan.workout}`;

  return (
    <div class="session" role="dialog" aria-modal="true" aria-label="Lifting session">
      <SessionTop
        past={d.past}
        date={d.date}
        elapsedSec={elapsed}
        sub={sub}
        actions={!summary}
        onMenu={() => setSheet('menu')}
        onStop={() => setSheet('stop')}
      />

      <div class="session-body">
        <Problem message={problem} />
        {!summary && d.fromEarlierDay && <EarlierDayNote date={d.date} />}
        {summary ? (
          <SummaryView summary={summary} d={d} onDone={props.onClose} />
        ) : d.step === 'checkIn' ? (
          <CheckInView plan={plan} d={d} update={update} />
        ) : d.step === 'lifting' ? (
          <LiftingView plan={plan} d={d} update={update} inv={inv} guard={guard} />
        ) : (
          <FinishView plan={plan} d={d} update={update} onSave={() => save(false)} />
        )}
      </div>

      {!summary && d.timer && remaining !== null && (
        <RestTimer plan={plan} label={d.timer.label} remaining={remaining} total={d.timer.durationSec + d.timer.adjustSec} d={d} update={update} />
      )}

      {sheet === 'stop' && (
        <StopSheet
          onKeepGoing={() => setSheet(null)}
          onEnd={() => {
            setSheet(null);
            void save(true);
          }}
        />
      )}
      {sheet === 'menu' && (
        <SessionMenu
          options={['assistMachine', 'skiErg', 'airBike']}
          down={d.equipmentDown}
          onChange={(equipmentDown) => update({ ...d, equipmentDown })}
          onClose={() => setSheet(null)}
          onDiscard={() => setSheet('discard')}
        />
      )}
      {sheet === 'discard' && <DiscardConfirm onCancel={() => setSheet(null)} onConfirm={() => void discard()} />}
    </div>
  );
}
