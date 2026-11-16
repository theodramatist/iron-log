// The waist check (SPEC.md sections 5.3 and 5.6, Q28): every two weeks at the
// end of a lifting session, since the tape lives in the gym bag, and any time
// from Progress.

import { useState } from 'preact/hooks';
import { addDays, READINGS } from '../engine';
import { Sheet } from './components';
import { lb, shortDate } from './format';
import { useApp } from './store';
import { parseInches, waistCheckDue, waistHistory, WAIST_HOW } from './waist';

/** On a live session's last screen, when a check is due. Leaving it blank is fine: it asks again next session. */
export function WaistCheck() {
  const app = useApp();
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState<number | null>(null);
  if (saved !== null) {
    return (
      <div class="note ok" role="status">
        Waist saved: {lb(saved)} in. Next check {shortDate(addDays(app.today, READINGS.WAIST_CHECK_EVERY_DAYS))}.
      </div>
    );
  }
  const events = app.repo.events();
  if (!waistCheckDue(events, app.today)) return null;
  const last = waistHistory(events)
    .filter((p) => p.date < app.today)
    .at(-1);
  const inches = parseInches(value);
  const save = () => {
    if (inches === null) return;
    void app.log({ type: 'waist', date: app.today, inches });
    setSaved(inches);
  };
  return (
    <section class="card" aria-label="Waist check">
      <div class="card-title">Waist check</div>
      <p class="small muted">Every two weeks, after lifting. {WAIST_HOW}</p>
      <div class="field">
        <label for="waist-now">Waist (in)</label>
        <input id="waist-now" class="num" inputMode="decimal" value={value} onInput={(e) => setValue(e.currentTarget.value)} />
      </div>
      {last && (
        <p class="small muted">
          Last time: {lb(last.inches)} in on {shortDate(last.date)}.
        </p>
      )}
      <button type="button" class="btn btn-ghost" disabled={inches === null} onClick={save}>
        Save waist
      </button>
    </section>
  );
}

/** Add a measurement from Progress. */
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
