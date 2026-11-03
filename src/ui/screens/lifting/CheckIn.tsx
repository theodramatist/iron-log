// The start check-ins (RULES.md sections 10 and 12): sleep, joint pain, the
// question for each paused lift, and an open food-lever question (Q10).

import { useMemo } from 'preact/hooks';
import { triggers, type BarbellLiftId, type SessionPlan } from '../../../engine';
import { Question, YesNo } from '../../components';
import { sessionPlan, type CheckInId, type LiftingDraft } from '../../session/lifting';
import { useApp } from '../../store';
import type { Update } from './shared';

export function CheckInView(props: { plan: SessionPlan; d: LiftingDraft; update: Update }) {
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
