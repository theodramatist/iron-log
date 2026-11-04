// Settings (SPEC.md section 5.8). Every change is logged as an event dated
// today, so it applies from today on and replays like everything else.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { localDate, persistentStorageStatus, requestPersistentStorage, type BackupFile, type PersistenceStatus } from '../../data';
import {
  addDays,
  bodyweightHistory,
  effectiveSettings,
  floorWeeks,
  weekStart,
  type AgeBracket,
  type PlatePair,
  type PullChoice,
  type Settings as SettingsShape,
} from '../../engine';
import { exportBackup, readBackupFile } from '../backups';
import { Choice, Confirm, Question, Sheet, YesNo } from '../components';
import { lb, shortDate } from '../format';
import { useApp } from '../store';
import { PlateRow } from './Setup';

export function Settings() {
  const app = useApp();
  const { program, input, today } = app;
  const settings = useMemo(() => effectiveSettings(input), [input]);
  const [sheet, setSheet] = useState<null | 'plates' | 'weigh' | 'floor'>(null);
  const [message, setMessage] = useState<string | null>(null);

  const change = <K extends keyof SettingsShape>(key: K, value: SettingsShape[K]) => {
    if (JSON.stringify(settings[key]) === JSON.stringify(value)) return;
    void app.log({ type: 'settingsChange', date: today, key, oldValue: settings[key], newValue: value });
  };

  return (
    <main class="screen">
      <h1>Settings</h1>
      {message && (
        <p class="note ok" role="status">
          {message}
        </p>
      )}

      <h2>You</h2>
      <div class="card">
        <Question text="Age">
          <Choice
            label="Age bracket"
            options={[
              { value: 'under40', label: 'Under 40' },
              { value: '40plus', label: '40 and over' },
            ]}
            value={settings.ageBracket}
            onChange={(v) => change('ageBracket', v as AgeBracket)}
          />
          {settings.ageBracket === null && <p class="small muted">Not set, so a layoff uses the 40-and-over drop.</p>}
        </Question>
        <Bodyweight onAdd={() => setSheet('weigh')} />
      </div>

      <h2>Equipment</h2>
      <div class="card">
        <div class="spread">
          <div>
            <div class="question-text">Bar and plates</div>
            <div class="small muted num">
              {lb(settings.barLb)} lb bar · {settings.plates.filter((p) => p.pairs !== 0).map((p) => lb(p.lb)).join(', ')}
            </div>
          </div>
          <button type="button" class="chip" onClick={() => setSheet('plates')}>
            Edit
          </button>
        </div>
        <Question text="Can the assist machine move in 5-lb steps?">
          <YesNo label="5-lb steps" value={settings.assistFiveLbSteps} onChange={(v) => change('assistFiveLbSteps', v)} />
        </Question>
        <Question text="Can it move in 2.5-lb steps?">
          <YesNo label="2.5-lb steps" value={settings.assistTwoPointFiveLbSteps} onChange={(v) => change('assistTwoPointFiveLbSteps', v)} />
        </Question>
        <Question text="Does the SkiErg bother your elbows or shoulders?">
          <p class="small muted">Yes moves the intervals to the air bike.</p>
          <YesNo label="SkiErg bothers my elbows or shoulders" value={settings.skiErgToAirBike} onChange={(v) => change('skiErgToAirBike', v)} />
        </Question>
      </div>

      <h2>Program</h2>
      <div class="card">
        <Question text="Third pull, from week 3">
          <Choice
            label="Third pull"
            options={[
              { value: 'row', label: program.lifts.row.label },
              { value: 'powerClean', label: program.lifts.powerClean.label },
            ]}
            value={settings.pullChoice}
            onChange={(v) => change('pullChoice', v as PullChoice)}
          />
          <p class="small muted">A new pull starts with calibration. The old one's history is kept in case you switch back.</p>
        </Question>
        <Question text="Split chins and dips?">
          <p class="small muted">Yes runs chins on B days and dips on A days, 3 sets each.</p>
          <YesNo label="Split chins and dips" value={settings.splitChinsDips} onChange={(v) => change('splitChinsDips', v)} />
        </Question>
        <FloorWeeks onAdd={() => setSheet('floor')} />
        <div class="question">
          <div class="question-text">Maintenance breaks</div>
          <ul class="lines">
            {program.nutritionPrompts.maintenanceBreaks.computed.map((b) => (
              <li key={b.start}>
                {shortDate(b.start)} to {shortDate(b.end)}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <h2>Safety</h2>
      <div class="card">
        <p>{program.safety.screeningNote}</p>
        <p class="small muted">{program.safety.painRule}</p>
      </div>

      <h2>Your data</h2>
      <DataCard onMessage={setMessage} />

      <h2>About</h2>
      <div class="card">
        <div class="spread">
          <span>Iron Log</span>
          <span class="num">{__APP_VERSION__}</span>
        </div>
        <div class="spread">
          <span>{program.meta.programName}</span>
          <span class="num">{program.meta.programVersion}</span>
        </div>
        <p class="small muted">Everything stays on this phone. Nothing is sent anywhere.</p>
      </div>

      {sheet === 'plates' && (
        <PlatesSheet
          barLb={settings.barLb}
          plates={settings.plates}
          onClose={() => setSheet(null)}
          onSave={(bar, plates) => {
            change('barLb', bar);
            change('plates', plates);
            setSheet(null);
          }}
        />
      )}
      {sheet === 'weigh' && <WeighInSheet onClose={() => setSheet(null)} />}
      {sheet === 'floor' && <AddFloorWeekSheet onClose={() => setSheet(null)} />}
    </main>
  );
}

function Bodyweight(props: { onAdd: () => void }) {
  const { input } = useApp();
  const latest = bodyweightHistory(input).at(-1);
  return (
    <div class="question">
      <div class="spread">
        <div>
          <div class="question-text">Bodyweight</div>
          <div class="small muted num">{latest ? `${lb(latest.lb)} lb on ${shortDate(latest.date)}` : 'None yet'}</div>
        </div>
        <button type="button" class="chip" onClick={props.onAdd}>
          Add weigh-in
        </button>
      </div>
    </div>
  );
}

/** Add a weigh-in (also on Progress). Chins and dips use the latest for their effective load. */
export function WeighInSheet(props: { onClose: () => void }) {
  const app = useApp();
  const latest = bodyweightHistory(app.input).at(-1);
  const [value, setValue] = useState(latest ? String(latest.lb) : '');
  const n = Number(value.replace(',', '.'));
  const valid = Number.isFinite(n) && n > 50 && n < 700;
  return (
    <Sheet title="Add a weigh-in" onClose={props.onClose}>
      <div class="field">
        <label for="weigh">Bodyweight (lb) today</label>
        <input id="weigh" class="num" inputMode="decimal" value={value} onInput={(e) => setValue(e.currentTarget.value)} />
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn-ghost" onClick={props.onClose}>
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-primary"
          disabled={!valid}
          onClick={() => {
            void app.log({ type: 'bodyweight', date: app.today, pounds: Math.round(n * 10) / 10 });
            props.onClose();
          }}
        >
          Save
        </button>
      </div>
    </Sheet>
  );
}

function PlatesSheet(props: { barLb: number; plates: PlatePair[]; onClose: () => void; onSave: (bar: number, plates: PlatePair[]) => void }) {
  const [bar, setBar] = useState(String(props.barLb));
  const [plates, setPlates] = useState<PlatePair[]>(props.plates.map((p) => ({ ...p })));
  const barLb = Number(bar.replace(',', '.'));
  const valid = Number.isFinite(barLb) && barLb > 0 && barLb <= 100;
  return (
    <Sheet title="Bar and plates" onClose={props.onClose}>
      <div class="field">
        <label for="bar-weight">Bar weight (lb)</label>
        <input id="bar-weight" class="num" inputMode="decimal" value={bar} onInput={(e) => setBar(e.currentTarget.value)} />
      </div>
      <div class="field">
        <span class="label">Plate pairs</span>
        <div class="plate-grid">
          {plates.map((p, i) => (
            <PlateRow key={p.lb} plate={p} onChange={(pairs) => setPlates(plates.map((q, j) => (j === i ? { ...q, pairs } : q)))} />
          ))}
        </div>
      </div>
      <p class="small muted">Weights from here on round to what these plates can make.</p>
      <div class="btn-row">
        <button type="button" class="btn btn-ghost" onClick={props.onClose}>
          Cancel
        </button>
        <button type="button" class="btn btn-primary" disabled={!valid} onClick={() => props.onSave(barLb, plates)}>
          Save
        </button>
      </div>
    </Sheet>
  );
}

function FloorWeeks(props: { onAdd: () => void }) {
  const app = useApp();
  const weeks = floorWeeks(app.input);
  const [removing, setRemoving] = useState<string | null>(null);
  return (
    <div class="question">
      <div class="spread">
        <div class="question-text">Floor weeks</div>
        <button type="button" class="chip" onClick={props.onAdd}>
          Add
        </button>
      </div>
      <p class="small muted">Two short lifting sessions, no chins or dips, and no conditioning.</p>
      {weeks.length === 0 && <p class="small muted">None.</p>}
      {weeks.map((w) => (
        <div class="spread" key={w.weekStart} style={{ padding: '6px 0' }}>
          <span>
            Week of {shortDate(w.weekStart)}
            {w.label ? ` · ${w.label}` : ''}
          </span>
          <button type="button" class="chip" onClick={() => setRemoving(w.weekStart)} aria-label={`Remove the floor week of ${shortDate(w.weekStart)}`}>
            Remove
          </button>
        </div>
      ))}
      {removing && (
        <Confirm
          title="Remove this floor week?"
          message={`The week of ${shortDate(removing)} goes back to a normal week.`}
          confirm="Remove"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            void app.log({ type: 'floorWeekRemoved', date: app.today, weekStart: removing });
            setRemoving(null);
          }}
        />
      )}
    </div>
  );
}

function AddFloorWeekSheet(props: { onClose: () => void }) {
  const app = useApp();
  const [date, setDate] = useState(addDays(weekStart(app.today), 7));
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  return (
    <Sheet title="Add a floor week" onClose={props.onClose}>
      <div class="field">
        <label for="floor-date">Any day in that week</label>
        <input id="floor-date" type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)} />
      </div>
      {valid && <p class="small muted">The week of {shortDate(weekStart(date))}, Monday through Sunday.</p>}
      <div class="btn-row">
        <button type="button" class="btn btn-ghost" onClick={props.onClose}>
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-primary"
          disabled={!valid}
          onClick={() => {
            void app.log({ type: 'floorWeekAdded', date: app.today, weekStart: weekStart(date) });
            props.onClose();
          }}
        >
          Add
        </button>
      </div>
    </Sheet>
  );
}

const STORAGE_TEXT: Record<PersistenceStatus, string> = {
  granted: "Kept: the phone won't clear Iron Log's data to make space.",
  denied: 'Not guaranteed: the phone may clear it when space runs low, so keep backups.',
  unsupported: "This browser doesn't say whether it will keep the data, so keep backups.",
};

function DataCard(props: { onMessage: (m: string) => void }) {
  const app = useApp();
  const { repo, today } = app;
  const [status, setStatus] = useState<PersistenceStatus | null>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [erase, setErase] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    void persistentStorageStatus().then(setStatus);
  }, []);
  const lastExport = repo.meta().lastExportAt;

  return (
    <div class="card">
      <div class="question">
        <div class="question-text">Storage on this phone</div>
        <p class="small">{repo.durable ? (status ? STORAGE_TEXT[status] : '') : "Not available: nothing logged will be kept."}</p>
        {status === 'denied' && (
          <button type="button" class="chip" onClick={() => void requestPersistentStorage().then(setStatus)}>
            Ask again
          </button>
        )}
      </div>
      <div class="question">
        <div class="question-text">Backups</div>
        <p class="small muted">
          {lastExport ? `Last backup ${shortDate(localDate(new Date(lastExport)))}.` : 'No backup yet.'} Save the file to Files or iCloud Drive.
        </p>
        {problem && (
          <p class="note alarm" role="alert">
            {problem}
          </p>
        )}
        <div class="btn-row">
          <button
            type="button"
            class="btn btn-primary"
            onClick={() => {
              setProblem(null);
              exportBackup(repo, today).then(
                (r) => r !== 'cancelled' && props.onMessage('Backup saved.'),
                (e: unknown) => setProblem(`The backup didn't save${e instanceof Error ? ` (${e.message})` : ''}.`),
              );
            }}
          >
            Export
          </button>
          <label class="btn btn-ghost" style={{ cursor: 'pointer' }}>
            Import
            <input
              type="file"
              accept=".json,application/json"
              class="sr-only"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = '';
                if (!file) return;
                setProblem(null);
                void readBackupFile(file).then((r) => (r.ok ? setPending(r.file) : setProblem(r.error)));
              }}
            />
          </label>
        </div>
      </div>
      <div class="question">
        <button type="button" class="btn btn-danger" onClick={() => setErase(1)}>
          Erase all data
        </button>
      </div>

      {pending && (
        <Confirm
          title="Replace everything with this backup?"
          message={`It was exported ${shortDate(localDate(new Date(pending.exportedAt)))} and has ${pending.events.length} entries. Everything on this phone now, including a session in progress, will be replaced.`}
          confirm="Replace"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const file = pending;
            setPending(null);
            repo.restore(file).then(
              () => props.onMessage(`Restored ${file.events.length} entries.`),
              (e: unknown) => setProblem(`The backup didn't load${e instanceof Error ? ` (${e.message})` : ''}.`),
            );
          }}
        />
      )}
      {erase === 1 && (
        <Confirm
          title="Erase all data?"
          message="Everything on this phone goes: your log, your settings, and any session in progress."
          confirm="Erase"
          onCancel={() => setErase(0)}
          onConfirm={() => setErase(2)}
        />
      )}
      {erase === 2 && (
        <Confirm
          title="Are you sure?"
          message="This can't be undone. Export a backup first if you might want any of it."
          confirm="Erase everything"
          onCancel={() => setErase(0)}
          onConfirm={() => {
            setErase(0);
            void repo.clearAll();
          }}
        />
      )}
    </div>
  );
}
