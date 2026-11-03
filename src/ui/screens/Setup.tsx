// First launch (SPEC.md section 5.1, RULES.md section 17): six short steps,
// then the 2026-11-02 session and the setup answers go into the log.

import { useState } from 'preact/hooks';
import { requestPersistentStorage } from '../../data';
import {
  buildSetupEvents,
  formatLb,
  type AgeBracket,
  type PlatePair,
  type PullChoice,
  type SpareReps,
  type TableRating,
} from '../../engine';
import { nowIso } from '../clock';
import { Choice, Question, YesNo } from '../components';
import { longDate } from '../format';
import { useApp } from '../store';

type Monday = { squat: TableRating | null; press: TableRating | null; deadlift: TableRating | null };

export function Setup() {
  const { repo, program, today } = useApp();
  const start = program.startingState;
  const eq = program.equipment;
  const [step, setStep] = useState(1);
  const [monday, setMonday] = useState<Monday>({ squat: null, press: null, deadlift: null });
  const [chinSpare, setChinSpare] = useState<SpareReps | null>(null);
  const [age, setAge] = useState<AgeBracket | null | undefined>(undefined);
  const [barLb, setBarLb] = useState(String(eq.barLb));
  const [plates, setPlates] = useState<PlatePair[]>(eq.plateInventory.map((p) => ({ lb: p.lb, pairs: p.pairs })));
  const [five, setFive] = useState<boolean>(eq.assistMachine.fiveLbStepsPossible);
  const [twoPointFive, setTwoPointFive] = useState<boolean>(eq.assistMachine.twoPointFiveLbStepsPossible);
  const [pull, setPull] = useState<PullChoice>(program.workouts.pullChoice.default as PullChoice);
  const [bodyweight, setBodyweight] = useState(String(program.athlete.bodyweightLb));
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);

  const ratings = program.effort.categories.filter((c) => c.id !== 'missed') as { id: TableRating; label: string }[];
  const bar = Number(barLb);
  const bw = Number(bodyweight);
  const canNext: Record<number, boolean> = {
    1: true,
    2: monday.squat !== null && monday.press !== null && monday.deadlift !== null && chinSpare !== null,
    3: age !== undefined,
    4: Number.isFinite(bar) && bar > 0 && bar <= 100,
    5: true,
    6: acknowledged && Number.isFinite(bw) && bw > 0,
  };

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    const now = nowIso();
    const events = buildSetupEvents(
      program,
      {
        ageBracket: age ?? null,
        mondayEffort: { squat: monday.squat!, press: monday.press!, deadlift: monday.deadlift! },
        chinSpare: chinSpare!,
        barLb: bar,
        plates,
        assistFiveLbSteps: five,
        assistTwoPointFiveLbSteps: twoPointFive,
        pullChoice: pull,
        bodyweightLb: bw,
      },
      { setupDate: today, nowIso: now, makeId: () => crypto.randomUUID() },
    );
    await repo.addEvents(events);
    // SPEC.md section 7: ask once setup finishes. Settings shows the result.
    void requestPersistentStorage();
  };

  const lifts = [
    { id: 'squat' as const, label: program.lifts.squat.label, line: `3×5 · ${formatLb(start.squat.lcw)}` },
    { id: 'press' as const, label: program.lifts.press.label, line: `3×5 · ${formatLb(start.press.lcw)}` },
    { id: 'deadlift' as const, label: program.lifts.deadlift.label, line: `1×5 · ${formatLb(start.deadlift.lcw)}` },
  ];

  return (
    <main class="screen" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
      <div class="eyebrow">
        Setup · <b>{step}</b> of 6
      </div>

      {step === 1 && (
        <>
          <h1>Iron Log</h1>
          <p>
            Iron Log runs the {program.meta.programName}: it tells you what to lift each day, records what you did, and works out the next
            session. Everything stays on this phone.
          </p>
        </>
      )}

      {step === 2 && (
        <>
          <h1>{longDate(start.asOf)}</h1>
          <p class="muted">Your first session, Workout A. Tell the app how it went.</p>
          {lifts.map((l) => (
            <div class="card" key={l.id}>
              <div class="spread">
                <div class="card-title">{l.label}</div>
                <div class="num">{l.line}</div>
              </div>
              <Question text="How did the last work set feel?">
                <Choice
                  label={`${l.label}: how did the last work set feel?`}
                  options={ratings.map((r) => ({ value: r.id, label: r.label }))}
                  value={monday[l.id]}
                  onChange={(v) => setMonday({ ...monday, [l.id]: v })}
                />
              </Question>
            </div>
          ))}
          <div class="card">
            <div class="spread">
              <div class="card-title">{program.lifts.chin.label}</div>
              <div class="num">3×5 · {formatLb(start.chin.assistanceLb)} help</div>
            </div>
            <Question text="Reps to spare on the last set?">
              <Choice
                tight
                label="Chins: reps to spare on the last set"
                options={[
                  { value: 0 as SpareReps, label: '0' },
                  { value: 1 as SpareReps, label: '1' },
                  { value: 2 as SpareReps, label: '2+' },
                ]}
                value={chinSpare}
                onChange={setChinSpare}
              />
            </Question>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <h1>Age</h1>
          <p class="muted">It only changes how much weight comes off after one to three weeks away.</p>
          <Choice
            label="Age bracket"
            options={[
              { value: 'under40', label: 'Under 40' },
              { value: '40plus', label: '40 and over' },
            ]}
            value={age ?? null}
            onChange={(v) => setAge(v as AgeBracket)}
          />
          <button type="button" class="btn-quiet" onClick={() => setAge(null)} aria-pressed={age === null}>
            Skip for now (the app uses 40 and over)
          </button>
        </>
      )}

      {step === 4 && (
        <>
          <h1>Equipment</h1>
          <div class="field">
            <label for="bar">Bar weight (lb)</label>
            <input id="bar" class="num" inputMode="decimal" value={barLb} onInput={(e) => setBarLb(e.currentTarget.value)} />
          </div>
          <div class="field">
            <span class="label">Plate pairs</span>
            <div class="plate-grid">
              {plates.map((p, i) => (
                <PlateRow
                  key={p.lb}
                  plate={p}
                  onChange={(pairs) => setPlates(plates.map((q, j) => (j === i ? { ...q, pairs } : q)))}
                />
              ))}
            </div>
          </div>
          <Question text="Can the assist machine move in 5-lb steps?">
            <p class="small muted">A 5-lb stack, or a half-step magnet on a 10-lb stack.</p>
            <YesNo label="5-lb steps" value={five} onChange={setFive} />
          </Question>
          <Question text="Can it move in 2.5-lb steps?">
            <p class="small muted">An add-on weight.</p>
            <YesNo label="2.5-lb steps" value={twoPointFive} onChange={setTwoPointFive} />
          </Question>
        </>
      )}

      {step === 5 && (
        <>
          <h1>Third pull</h1>
          <p class="muted">From week 3, Workout B's third lift.</p>
          <Choice
            label="Third pull"
            options={[
              { value: 'row', label: program.lifts.row.label },
              { value: 'powerClean', label: program.lifts.powerClean.label },
            ]}
            value={pull}
            onChange={(v) => setPull(v as PullChoice)}
          />
          <p class="note info">If you don't already clean well, row instead of learning cleans from video.</p>
        </>
      )}

      {step === 6 && (
        <>
          <h1>Before you train</h1>
          <div class="field">
            <label for="bw">Bodyweight (lb)</label>
            <input id="bw" class="num" inputMode="decimal" value={bodyweight} onInput={(e) => setBodyweight(e.currentTarget.value)} />
          </div>
          <div class="note">{program.safety.screeningNote}</div>
          <button type="button" class={acknowledged ? 'btn btn-ghost' : 'btn btn-primary'} aria-pressed={acknowledged} onClick={() => setAcknowledged(true)}>
            {acknowledged ? 'Read' : "I've read this"}
          </button>
        </>
      )}

      <div class="btn-row" style={{ marginTop: '24px' }}>
        {step > 1 && (
          <button type="button" class="btn btn-ghost" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        {step < 6 ? (
          <button type="button" class="btn btn-primary" disabled={!canNext[step]} onClick={() => setStep(step + 1)}>
            Next
          </button>
        ) : (
          <button type="button" class="btn btn-primary" disabled={!canNext[6] || saving} onClick={finish}>
            Finish
          </button>
        )}
      </div>
    </main>
  );
}

function PlateRow(props: { plate: PlatePair; onChange: (pairs: number | null) => void }) {
  const { plate } = props;
  const unlimited = plate.pairs === null;
  return (
    <>
      <span class="num">{formatLb(plate.lb)} lb</span>
      <div class="row">
        <button
          type="button"
          class="chip"
          aria-pressed={unlimited}
          onClick={() => props.onChange(unlimited ? 1 : null)}
          aria-label={`${formatLb(plate.lb)}-lb plates: ${unlimited ? 'as many as needed' : 'a set number of pairs'}`}
        >
          {unlimited ? 'Unlimited' : 'Pairs'}
        </button>
        {!unlimited && (
          <div class="stepper" role="group" aria-label={`${formatLb(plate.lb)}-lb pairs`}>
            <button type="button" aria-label="One pair fewer" disabled={(plate.pairs ?? 0) <= 0} onClick={() => props.onChange(Math.max(0, (plate.pairs ?? 0) - 1))}>
              −
            </button>
            <span class="val">{plate.pairs}</span>
            <button type="button" aria-label="One pair more" onClick={() => props.onChange((plate.pairs ?? 0) + 1)}>
              +
            </button>
          </div>
        )}
      </div>
    </>
  );
}
