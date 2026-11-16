// The weigh-in and waist check (SPEC.md sections 5.3 and 5.6, Q28 and Q29):
// every two weeks at the end of a lifting session, since the tape lives in the
// gym bag, and any time from Progress.

import { useState } from 'preact/hooks';
import { addDays, bodyweightHistory, READINGS, type LocalDate } from '../engine';
import { nextWaistCheck, nextWeighIn, parseInches, parsePounds, waistCheckDue, waistHistory, weighInDue, WAIST_HOW } from './bodyCheck';
import { Sheet } from './components';
import { lb, shortDate } from './format';
import { useApp } from './store';

interface Saved {
  pounds: number | null;
  inches: number | null;
  /** The next check, or null when one of the two is still due. */
  next: LocalDate | null;
  stillDue: 'weigh-in' | 'waist check' | null;
}

function savedText(s: Saved): string {
  const what = [s.pounds !== null ? `${lb(s.pounds)} lb` : null, s.inches !== null ? `${lb(s.inches)} in` : null].filter(Boolean).join(' and ');
  if (s.stillDue) return `Saved: ${what}. The ${s.stillDue} asks again next session.`;
  return `Saved: ${what}. Next check ${shortDate(s.next!)}.`;
}

/**
 * On a live session's last screen when a weigh-in or a waist check is due.
 * It asks for both together. Either can be left blank: it asks again next session.
 */
export function BodyCheck() {
  const app = useApp();
  const { today, input } = app;
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [saved, setSaved] = useState<Saved | null>(null);
  if (saved) {
    return (
      <div class="note ok" role="status">
        {savedText(saved)}
      </div>
    );
  }
  const events = app.repo.events();
  const weighDue = weighInDue(input);
  const waistDue = waistCheckDue(events, today);
  if (!weighDue && !waistDue) return null;

  const lastWeight = bodyweightHistory(input)
    .filter((b) => b.date < today)
    .at(-1);
  const lastWaist = waistHistory(events)
    .filter((p) => p.date < today)
    .at(-1);
  const pounds = parsePounds(weight);
  const inches = parseInches(waist);
  const unreadable = (weight.trim() !== '' && pounds === null) || (waist.trim() !== '' && inches === null);
  const canSave = !unreadable && (pounds !== null || inches !== null);

  const save = () => {
    if (!canSave) return;
    if (pounds !== null) void app.log({ type: 'bodyweight', date: today, pounds });
    if (inches !== null) void app.log({ type: 'waist', date: today, inches });
    const nextWeigh = pounds !== null ? addDays(today, READINGS.WEIGH_IN_EVERY_DAYS) : nextWeighIn(input);
    const nextWaist = inches !== null ? addDays(today, READINGS.WAIST_CHECK_EVERY_DAYS) : nextWaistCheck(events, today);
    const stillDue = nextWeigh <= today ? 'weigh-in' : nextWaist <= today ? 'waist check' : null;
    setSaved({ pounds, inches, next: stillDue ? null : nextWeigh < nextWaist ? nextWeigh : nextWaist, stillDue });
  };

  return (
    <section class="card" aria-label="Weigh-in and waist">
      <div class="card-title">Weigh-in and waist</div>
      <p class="small muted">Every two weeks, after lifting.</p>
      <div class="field">
        <label for="weigh-now">Bodyweight (lb)</label>
        <input id="weigh-now" class="num" inputMode="decimal" value={weight} onInput={(e) => setWeight(e.currentTarget.value)} />
        {lastWeight && (
          <p class="small muted">
            Last: {lb(lastWeight.lb)} lb on {shortDate(lastWeight.date)}.
          </p>
        )}
      </div>
      <div class="field">
        <label for="waist-now">Waist (in)</label>
        <input id="waist-now" class="num" inputMode="decimal" value={waist} onInput={(e) => setWaist(e.currentTarget.value)} />
        <p class="small muted">
          {WAIST_HOW}
          {lastWaist ? ` Last: ${lb(lastWaist.inches)} in on ${shortDate(lastWaist.date)}.` : ''}
        </p>
      </div>
      {unreadable && <p class="cue">Check the numbers: pounds for weight, inches for the waist.</p>}
      <button type="button" class="btn btn-ghost" disabled={!canSave} onClick={save}>
        Save
      </button>
    </section>
  );
}

/** Add a waist measurement from Progress. */
export function WaistSheet(props: { onClose: () => void }) {
  const app = useApp();
  const [value, setValue] = useState('');
  const inches = parseInches(value);
  return (
    <Sheet title="Add a waist measurement" onClose={props.onClose}>
      <p class="small muted">{WAIST_HOW}</p>
      <div class="field">
        <label for="waist">Waist (in) today</label>
        <input id="waist" class="num" inputMode="decimal" value={value} onInput={(e) => setValue(e.currentTarget.value)} />
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn-ghost" onClick={props.onClose}>
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-primary"
          disabled={inches === null}
          onClick={() => {
            if (inches === null) return;
            void app.log({ type: 'waist', date: app.today, inches });
            props.onClose();
          }}
        >
          Save
        </button>
      </div>
    </Sheet>
  );
}
