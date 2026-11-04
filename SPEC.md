# Iron Log: product spec

A workout tracker for one lifter, installed on an iPhone home screen from Safari. It runs the Retraining Protocol: it tells him what to lift today, records what he did, and works out the next session, including every stall, reset, deload, layoff, and pain rule. It works offline and keeps all data on the phone.

Read RULES.md for every decision the app makes. This file covers what the app looks like, how it is built, and how it is judged finished.

## 1. Platform

- **Install:** a static web app served over HTTPS and added to the home screen from Safari (Share, then Add to Home Screen). It opens full screen with no browser bar.
- **Target:** iPhone on iOS 18.4 or later, portrait only. It should also run in desktop Safari and Chrome for development.
- **No backend, no accounts, and no network calls after the first load.** Everything is cached for offline use, because gyms often have poor signal.

## 2. Architecture

- **Stack:** Vite, TypeScript (strict), Preact, `vite-plugin-pwa` (Workbox), `idb` for IndexedDB, and Vitest. No UI kit, no CSS framework, and no runtime CDN. Charts are hand-drawn SVG.
- **Folders:**
  - `src/engine/`: the rules engine. Pure TypeScript with no DOM, storage, or clock access. Today's date is always passed in.
  - `src/data/`: IndexedDB storage, the event log, export, and import.
  - `src/ui/`: screens and components.
  - `src/program/program.json`: a copy of this package's `program.json`, bundled at build time.
  - `tests/`: one test file per RULES.md section, with tests named by scenario ID.
- **Event sourcing.** The app stores an append-only log of events (section 4). State is never stored. It is derived by replaying the log through the engine, so editing a past session just replays. A year of training is a few hundred events, so a full replay on every change is fine.
- **Dates.** Store local dates as `YYYY-MM-DD` strings and do day arithmetic on calendar dates only (RULES.md section 0). Store timestamps as ISO strings for session clocks and timers.
- **Determinism.** The same log, settings, and date always give the same plan. The engine never reads the system clock.

## 3. Engine interface

The UI talks to the engine through a small API. Names can change, but the separation can't.

```ts
type EngineInput = { program: Program; settings: Settings; events: Event[]; today: LocalDate };

planFor(input, date): DayPlan            // what to do on a date: lifting, conditioning, floor, or off
prescribe(input, date): SessionPlan      // full lifting plan: lifts, sets, weights, plates, warm-ups
liftStates(input): Record<LiftId, LiftState>       // stage, lcw, next, flags, history
conditioningState(input, date): ConditioningPlan   // week, phase, target, interval layout
weekSummary(input, weekStart): WeekSummary         // sessions, minutes, week type, banners
triggers(input): Suggestion[]            // light week, food lever, early-stall note, graduation
```

Session screens build a draft session in memory and save it as one event when finished, so a half-logged session never changes the plan. A draft survives the app being closed (kept in IndexedDB as a draft, not as an event).

## 4. Data model

Every event has `id`, `type`, `date` (local date), `createdAt`, and `updatedAt`.

| Event type | Payload |
| --- | --- |
| `setup` | age bracket, Monday's effort ratings and chin spare reps, plate inventory, bar weight, machine steps, `pullChoice`, bodyweight |
| `liftingSession` | workout, week type, start and end times, check-ins, per lift (prescription, warm-ups done, the layoff warm-up answer, each work set with weight, reps, form-broke and skipped flags, effort rating, pain stop, calibration result), chins and dips (assistance or added load, reps per set, spare reps, negatives done) or their substitutions, spin minutes, notes, `stopped` |
| `conditioningSession` | conditioning week, phase, short-night answer, target minutes, actual minutes, machines, intervals planned and done, notes, `stopped` |
| `bodyweight` | pounds |
| `settingsChange` | key, old value, new value |
| `weekDeclaration` | week start, kind (`light`, `floor`, `illness`, `overload`), scope (`restOfWeek` or `nextWeek`) |
| `floorWeekRemoved` / `floorWeekAdded` | week start |
| `screeningAcknowledged` | none |
| `foodLeverAnswer` | lift, answer |
| `illness` | kind (`start` with the symptom answer, or `better`) |
| `painCleared` | lift, how (`gone` or `clinician`) |
| `suggestionDismissed` | suggestion kind |
| `override` | lift, field, value, reason |
| `skip` | kind (`lifting` or `conditioning`), reason (`time`): "No time today" (RULES.md section 1) |

Export format: `{ "app": "iron-log", "schemaVersion": 1, "programVersion": "2026-11-02", "exportedAt": "...", "settings": {...}, "events": [...] }`. Import validates the shape and the schema version, shows a count of events, and replaces all data only after a confirmation.

## 5. Screens

Five tabs along the bottom: **Today**, **Week**, **Progress**, **Lifts**, and **Settings**. Session screens open full screen over the tabs.

### 5.1 Setup (first launch only)

Six short steps, each one screen, with Back and Next:

1. Welcome, with one sentence on what the app does and that data stays on the phone.
2. Monday, November 2: the seeded session, prefilled. For squat, press, and deadlift, ask "How did the last work set feel?" with the four effort chips. For chins, ask "Reps to spare on the last set?" (0, 1, or 2+).
3. Age bracket: under 40, or 40 and over.
4. Equipment: bar weight, plate pairs (defaults from `program.json`, plus any other sizes he owns, such as fractional plates), and whether the assist machine allows 5-lb and 2.5-lb steps.
5. Third pull from week 3: row (default) or power clean, with the protocol's note that cleans are only for someone who already cleans well.
6. Bodyweight and the screening note (`program.json → safety.screeningNote`), acknowledged with one tap, then Finish. Finish requests persistent storage (section 7).

### 5.2 Today

- Header: the date, program week, and conditioning phase.
- **Session card:** today's plan. Lifting shows the workout letter and each lift with its work weight and sets ("Squat 3×5 · 115"). Conditioning shows target minutes and intervals. A floor or light week says so. Off days say "Off."
- **Buttons:** Start session, Swap today, and a small "Something came up" menu (no time today, declare illness, overloaded week, or floor week). "No time today" shows how the rest of the week moves before it's confirmed, and a skipped day offers Undo (RULES.md section 1). In sick mode the session card shows the rest message from RULES.md section 10 and an "I'm better" button, and nothing can be started.
- **Banners,** at most two visible, in priority order: pain check, light-week suggestion, food-lever question, graduation, early-stall note, maintenance break, export reminder.
- **Week strip:** Monday through Friday with done, planned, missed, and off states.
- **Conditioning bar:** minutes this week against 150.
- **Food line:** the day's nutrition prompt from RULES.md section 13.

### 5.3 Lifting session

- **Top bar:** elapsed time, projected finish, and a red **Stop session** button (RULES.md section 12).
- **Start check-ins:** the three questions from RULES.md section 10, plus "Flat from the intervals?" when it applies, and the pain question for any paused lift.
- **Session menu:** Equipment down (assist machine, SkiErg, or air bike), which swaps in the substitutes from RULES.md sections 2 and 8.
- **Checklist row:** 5 easy minutes on the air bike.
- **One card per lift,** in slot order. Each card shows the lift, work weight, set scheme, plates per side, the stage when it isn't `NORMAL` ("Bridge: 5×3 at 250"), and cues.
  - Warm-up rows with weights, reps, and plates. Tap to check off.
  - Work-set rows as large buttons. One tap logs the set as made. A minus button lowers the reps for a short set. A small toggle marks "form broke." A long press marks the set skipped.
  - After the last work set, effort chips appear (Light, 3–4 left, 1–2 left, Grind). If any set came up short, the rating is set to Missed and the chips are hidden. Cleans and rows show Crisp and Not crisp.
  - "Pain stop" in the card's menu.
  - A "Use a smaller jump next time" control in the post-session summary, never on the card.
- **Calibration cards** replace normal cards the first time bench, rows, cleans, or dips appear. They add sets one at a time. Bench, rows, and cleans offer "Fast," "Starting to slow," and "Clearly slowed" (or "Bar speed dropped") after each set, and dips end with "5 solid with 2 or 3 to spare."
- **Returning lifts.** A lift back from a pain stop shows "Return session at 90%" and its lighter weight. In a 22-to-60-day layoff return, each lift asks "Did that warm-up feel heavy?" after its last warm-up set and adjusts the work sets on yes.
- **Chin-and-dip block:** six rows alternating chin and dip, each showing assistance (or belt weight) and effective load, with a reps stepper defaulting to the target. After the last set, chips ask for spare reps (0, 1, 2+). Negatives appear as two checkboxes when due.
- **Rest timer:** a bar that starts when a work set is logged, with the RULES.md section 14 default, plus and minus 30 seconds, and Skip. It sounds and flashes the screen when time is up.
- **Time guard:** when the projection passes 80 minutes, a banner shows the next cut step.
- **Finish:** the end check-in ("Did warm-ups feel heavy today?"), then a summary listing each lift's next prescription and any stage change, the food line, and any new suggestion.

### 5.4 Conditioning session

- The check-in "Last night under 6 hours?" first, then phase, conditioning week, a target-minutes stepper limited to the phase's range (down to 20 minutes when short on time, with intervals hidden under 30), and the machines.
- A segmented timer: easy on the air bike, the interval block on the SkiErg, then easy on the air bike. A large countdown shows the current segment and what's next, with a sound and a screen flash at each change. "Restart timer" sends a timer started by mistake back to zero on the Start screen.
- The screening gate before the first interval session.
- Finish: actual minutes and intervals done (prefilled), notes, then the food line.

### 5.5 Week

Monday through Sunday for the current week, with arrows for other weeks. Each day shows its plan or what was logged, the week type, and any calendar note from `program.json`. Tapping a logged day opens the session to view or edit. Editing a past session warns that later prescriptions will be recalculated.

### 5.6 Progress

- One small line chart per barbell lift: work weight over time, with resets and light weeks marked.
- Chins and dips: effective load over time.
- Bodyweight entries over time, with an "Add weigh-in" button.
- Conditioning minutes per week against 150.

### 5.7 Lifts

A list of every lift with its stage and next prescription. Tapping one opens its detail: `lcw`, next, stage, `hasMissed`, resets and `lastResetFrom`, light-day or once-a-week status, paused state, and history. Actions: override the next prescription (with a reason), and for a graduated lift, restart or log freely.

### 5.8 Settings

Age bracket, bodyweight, bar and plates, assist-machine steps, `pullChoice`, split chins and dips, SkiErg-to-air-bike swap, floor weeks (list, add, remove), maintenance breaks (read only), the screening note, persistent-storage status, export, import, erase all data (two confirmations), and an About row with the program and app versions.

## 6. Interaction and visual design

- One-handed use with chalky hands. Tap targets at least 44 points, primary actions in the bottom half of the screen, and no typing during a normal session.
- Iron Log's visual language: its dark palette (with the contrast fixes in `docs/AUDIT.md`), large monospace numerals for weights and timers, and the plate bar. System font stacks only (`-apple-system` and `ui-monospace`), with no web fonts to download.
- Dark theme always. High contrast: text at least 4.5:1 against its background. Respect safe areas (`env(safe-area-inset-*)`).
- Respect the user's text size where the layout allows, and give every control an accessible label.
- Plain words: "Bridge," "Reset," "Light week," and "Floor week," as in the protocol. Labels and messages come from `program.json` where it has them.
- Tone: short and direct. No exclamation points, streaks, badges, or guilt.

## 7. iPhone requirements and limits

- **Manifest:** `name` "Iron Log", `short_name` "Iron Log", `display` "standalone", `orientation` "portrait", `start_url` and `scope` "./", theme and background colors, and 192, 512, and maskable 512 icons. Add a 180×180 `apple-touch-icon`, `apple-mobile-web-app-title`, and `viewport-fit=cover`.
- **Offline:** the service worker precaches every asset. Every app on theodramatist.github.io shares one origin, so the worker lives at `/iron-log/sw.js` with scope `/iron-log/`. That is the old Iron Log's URL, so installed phones update to the new worker, which deletes the old `ironlog-v*` caches on activate. Use update prompting rather than auto-reload, and never reload during a session. Show "Update ready" on the Today screen, applied on the next launch.
- **Storage:** IndexedDB, in a database named `iron-log`. After setup, call `navigator.storage.persist()` and show the result in Settings. WebKit grants it by heuristics, such as whether the site is opened as a home-screen web app, and persistent origins are excluded from eviction ([WebKit, "Updates to Storage Policy," August 10, 2023](https://webkit.org/?p=14403)). Because the grant isn't guaranteed, backups are required (section 8).
- **Screen awake:** request a Screen Wake Lock while a session screen is open, and request it again when the app returns to the foreground. It works in home-screen web apps from iOS 18.4 ([WebKit bug 254545](https://bugs.webkit.org/show_bug.cgi?id=254545)). Fail quietly where it's missing.
- **Timers** compute remaining time from stored timestamps, never from counting ticks, because iOS suspends background pages.
- **Sound:** create the Web Audio context on the Start session tap, since iOS needs a user gesture. Sounds may be muted by the silent switch, so every alert also flashes the screen. Don't use vibration, which Safari on iPhone doesn't support.
- **No background alerts.** A web app can't schedule a local notification without a push server, so the rest timer only alerts while the app is open. The wake lock keeps it open.

## 8. Backups

- Export from Settings creates the JSON file in section 4. Use the share sheet (`navigator.share` with a file) where available, so he can save it to Files or iCloud Drive, and fall back to a download.
- After Friday's session, if there has been no export in 7 days, the Today screen shows "Back up your log" with one-tap export.
- Import replaces everything after a confirmation that shows the file's date and event count.

## 9. Non-goals

Food logging, accounts, sync, multiple users, Apple Health or Apple Watch, push notifications, exercise videos, programming for lifts after they graduate (the app just logs them), and kilograms (the app is pounds only). Android should work but isn't a target.

## 10. Acceptance criteria

1. `npm test` passes every scenario in TEST_SCENARIOS.md (T01 through T96), and every RULES.md section has at least one test.
2. `src/engine/` imports nothing from the DOM, storage, or the clock.
3. `npm run build` produces static files that deploy to an HTTPS host.
4. On an iPhone with iOS 18.4 or later: it installs from Safari, opens full screen, works in airplane mode after the first launch, and keeps its data after the app is closed and the phone restarts.
5. A made work set takes one tap, and a normal session can be logged without typing.
6. Export, erase, and import restore the same log, state, and plan (T81).
7. The rest timer is right after the app is backgrounded (T77).
8. No network requests happen after the first load.
9. Every visible label and message follows the protocol's terms and contains no exclamation points.
