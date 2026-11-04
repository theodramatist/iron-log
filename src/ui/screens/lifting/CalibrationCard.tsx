// The first time bench, rows, or cleans appear: sets from the empty bar until
// the bar slows, then the work sets at that weight (RULES.md section 9).

import { useState } from 'preact/hooks';
import { platesPerSide, type Inventory, type LiftPlan } from '../../../engine';
import { nowIso } from '../../clock';
import { PlateBar, Sheet, Stepper } from '../../components';
import { lb } from '../../format';
import {
  calibratedWeight,
  liftDraft,
  liftMissed,
  lowerRampReps,
  lowerReps,
  nextRampWeight,
  rampVerdict,
  setEffort,
  startTimer,
  tapSet,
  toggleFormBroke,
  togglePainStop,
  toggleSkipped,
  undoRamp,
  wantsRating,
  type LiftingDraft,
} from '../../session/lifting';
import { useApp } from '../../store';
import { EffortChips, SetButton } from './LiftCard';
import type { Update } from './shared';

export function CalibrationCard(props: { lp: LiftPlan; d: LiftingDraft; update: Update; inv: Inventory }) {
  const { program } = useApp();
  const { lp, d, update, inv } = props;
  const [menu, setMenu] = useState(false);
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
      <div class="spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <div class="card-kicker">Slot {lp.slot} · First time</div>
          <div class="card-title">{lp.label}: find the work weight</div>
        </div>
        <button type="button" class="menu-btn" aria-label={`${lp.label} menu`} onClick={() => setMenu(true)}>
          ⋯
        </button>
      </div>
      {lp.cues.map((c) => (
        <p class="cue" key={c}>
          {c}
        </p>
      ))}
      {menu && (
        <Sheet title={lp.label} onClose={() => setMenu(false)}>
          <button
            type="button"
            class="btn btn-danger"
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
      {l.painStop ? (
        <p class="note alarm">Pain stop: this lift ends for today, and it calibrates once the pain is gone.</p>
      ) : (
        <>
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
        </>
      )}
    </section>
  );
}
