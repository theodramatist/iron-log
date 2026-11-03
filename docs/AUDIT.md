# Iron Log: Pre-Rework Audit

*November 3, 2026 · Audited at commit `fda4cbe` on `claude/clever-volta-6xjl4x`*

This audit covers the app as it stands, ahead of the move to a single hybrid protocol drawn from Starting Strength and Barbell Medicine. Finding IDs (C1, H4, and so on) are stable, so the rework spec can cite them.

## Scope and method

I read every file in the repo, including all 948 lines of `index.html` and the 31 KB program blob on line 211, which I parsed and dumped block by block. Then I checked suspected problems two ways. I loaded the app's own exported math functions in Node and called them directly. And I drove the real app in headless Chromium at iPhone size (390 × 844), scripting whole workouts and reading back the saved state.

Findings tagged *Verified* were reproduced that way, and the observed numbers are quoted. Findings tagged *By inspection* come from reading the code. I did not test on a physical iPhone, so iOS-specific behavior (audio, wake lock, storage) comes from WebKit and MDN sources, cited where it matters.

## Bottom line

This is a well-made personal tool. The visual design is strong, the rest timer is built correctly, and the RPE math is clever and accurate inside the chart's range. But it isn't a platform yet, and I don't think it should be refactored into one.

The two biggest problems are both about data. First, the numbers that drive training are wrong in specific, reproducible ways. Barbell Medicine e1RMs climb on sessions where nothing was lifted. Starting Strength progression can record a completed session as a miss, which counts toward an automatic deload, and it advances a lifter who used half the prescribed weight. Second, the data model can't carry a new protocol. Lifts are identified by display-name strings, weights carry no units, the program format can't express back-off sets, and history records prescribed work as if it were performed.

And so I'd rebuild the engine and data model from a clean spec, keep the visual design and a handful of well-built pieces, and import your existing history into the new format.

Severity below reflects what happens to the lifter, not how hard the fix is.

## Critical: wrong training numbers or lost data

### C1. Barbell Medicine e1RMs inflate from sets that were never done
*Verified* · `index.html:381`, `:531`, `:533`

Each BM draft pre-fills every set with the target weight, the target reps, *and the target RPE as a real value* rather than a placeholder. `recalcBmE1` then takes the best e1RM across all sets, ticked or not. Targets are rounded to loadable weights, so at least one pre-filled set usually rounds up, and the e1RM ratchets upward from rounding alone. A session finished with zero sets ticked moved Back squat from 300 to 302.1, Standing Overhead Press from 120 to 122.5, and Conventional deadlift from 400 to 403.1. Ticking only the first set displayed an e1RM computed from an unticked set below it.

Two design choices compound this. Taking the maximum across sets biases e1RM high, since the largest of several noisy estimates tends to overshoot. And a pre-filled RPE anchors the lifter's report: an untouched field claims the set went exactly as planned.

**Fix:** compute only from completed sets, show target RPE as a placeholder, and name one source set (the top set) instead of taking the max.

### C2. "Discard this session" doesn't discard
*Verified* · `index.html:477`, `:533`

The e1RM is written to saved state the moment a set is ticked. Discarding clears the draft but never restores the old value. Logging one set and then discarding left Back squat at 302.1 instead of 300.

**Fix:** snapshot at draft start and commit only on Finish.

### C3. History records prescribed work as performed
*Verified* · `index.html:620`, `:635`, `:636`, `:731`

`finishDraft` saves every set, ticked or not, with its pre-filled values. The BM entry also stores each lift's *current* e1RM even when the lift wasn't performed, so the Progress chart gains a point for work that never happened. A session with nothing ticked appears under Recent sessions as "9 sets."

**Fix:** keep prescription and performance as separate records, save only performed sets, and record an e1RM only when that session produced one.

### C4. The SS reps stepper causes false misses and false logs
*Verified* · `index.html:566`

SS sets start with reps pre-filled at 5. The reps stepper changes the goal but leaves the pre-filled reps alone. The line that appears to update them only replaces an empty value with an empty value. Step squat reps up to 8, tick all three sets, and the app records 5, 5, 5 and logs "Squat hold (1/3 miss)." Three such sessions trigger an automatic 10 percent deload. Stepping down does the reverse: a 5×3 day is partly logged as 5-rep sets. The README advertises exactly this feature.

**Fix:** move untouched sets with the goal, and treat a tick on an untouched set as "did the goal."

### C5. SS "success" ignores the weight on the bar
*Verified* · `index.html:624`

Success checks only that every set is ticked with reps at or above the goal. Doing 3×5 at 45 lb against a 95 lb target advanced the squat to 100. Lifting heavier than prescribed doesn't register either: the next target is the old target plus the increment.

**Fix:** require load at or above target, and decide explicitly what a heavier-than-prescribed set should mean.

### C6. Barbell Medicine Blocks II–III can't be logged as written
*Verified* · program data at `index.html:211`; renderer at `:458`

Back-off sets ("−10% from 4 @ 9 × 2 sets") exist only in the prose `scheme` text, never in the structured `sets` arrays, and BM has no add-set control (the stepper is SS-only). Block II, Week 4, Day 1 renders 9 loggable rows against a 16-set prescription. In Block III, Weeks 2–4, the main squat, bench, and deadlift entries have *empty* `sets` arrays, so they render zero rows above a plate bar reading "0 lb · empty bar." Paused bench and overhead press in those weeks are missing their back-offs as well.

This is a limit of the data model, not a typo. The format has no way to say "a percentage off today's top set" or "a percentage of e1RM."

### C7. A corrupt save bricks the app
*Verified* · `index.html:318`

The saved blob goes through `JSON.parse` with no `try`/`catch`. A truncated or malformed save produces a blank screen and no recovery path, with your only copy of the training log stuck behind the crash.

**Fix:** guard the parse, keep the raw string, and show a recovery screen with an export button.

### C8. Backup without restore, on a single device
*By inspection* · `index.html:866`

"Copy my data" puts the whole state on the clipboard. There's no import. The toast reports "Backup copied" even when the Clipboard API is missing, because the result is never checked. Meanwhile, everything lives in one `localStorage` key on one phone. On iOS, a Home Screen web app keeps its own storage, separate from Safari's, and as far as I know, removing the icon deletes that storage with it.

**Fix (now, whatever the direction):** file export through the share sheet, validated file import, and a persistent-storage request (`navigator.storage.persist()`) where supported.

## High

### H1. Switching units converts nothing
*Verified* · `index.html:762–767`

Switching from lb to kg sets the bar to 20 and resets the increments, but every stored weight keeps its number, so a 95 lb squat becomes a 95 kg squat. History entries carry no unit, so old sessions are silently reinterpreted. Custom increments are overwritten without warning. There are also two unit fields (`S.units` and `S.ss.unit`) that can drift apart.

**Fix:** store one canonical unit, convert at display, and record the unit on every logged set.

### H2. Lifts are identified by display name
*By inspection* · `index.html:375–383`, `:711`, `:820`

Estimated 1RMs, substitutions, and Progress series all key on name strings. "Back squat" (Block I) and "Low bar back squat" (Blocks II–III) are different lifts to the app, so Block II opens with blank targets. "Bench Press" is the only name SS and BM share, so its Progress line mixes an SS proxy e1RM with a BM RPE-based one while every other lift stays split. Swapping an exercise forks its history.

**Fix:** a stable lift ID with a separate display name, plus parent/variant links (paused squat → squat) and optional ratios for seeding targets.

### H3. Default increments assume plates the defaults don't include
*Verified* · `index.html:307`, `:311`

Press and bench default to +2.5 lb a session, but the default plate inventory has no fractional plates, so the smallest loadable jump is 5 lb. The second press session targets 67.5 lb, and the plate bar shows "+1.25/side off-plate." Kilos are worse: +1.25 kg on the press needs 0.625 kg a side, which none of the offered fractional sizes can make, so every other press session is off-plate. SS targets are never rounded to loadable weights at all.

### H4. The plate math can contradict itself
*Verified* · `index.html:264`, `:267–272`

`loadStep` assumes any multiple of the smallest plate is loadable, which is false when you own a single pair of fractional plates. The greedy solver also misses valid loads: with one 1.25 and two 0.75s per side, 1.5 lb per side fails, though 0.75 + 0.75 works. And there's no way to mark standard plates as unavailable, which matters in home gyms.

**Fix:** enumerate the reachable per-side loads once from the actual inventory, then round targets to the nearest reachable total.

### H5. GPP and conditioning are never shown
*Verified* · `index.html:386`; orphaned `.gpp` styles at `:100–103`

Every BM week carries a conditioning prescription, and Blocks II–III add trunk, upper-back, and arm work. It's copied into the draft and never rendered anywhere.

### H6. Block advance is offered too early
*Verified* · `index.html:678`

"Advance to Block II →" appears after *every* Week 4 session, Day 1 included, so one tap skips Days 2–3. There's also no stall detection, though the README's rule (advance when two or more lifts stall) could be computed from data the app already keeps.

### H7. Unticked lifts count as misses
*Verified* · `index.html:624`

Forgetting to tick a lift, or skipping it for time, counts toward the three-strike deload. Finish gives no "unticked sets" warning, and there's no "skipped" state distinct from "failed."

### H8. History is write-only
*By inspection*

There's no session detail view and no way to edit or delete a session, correct a typo, or backdate a missed log. For RPE work, seeing last week's numbers for the same day is close to essential.

### H9. The service worker can strand users on an old or broken version
*By inspection* · `sw.js:12`, `:23–28`

HTML is served cache-first, so updates depend on a hand-bumped `CACHE` string; forget the bump and installed phones never update. Install errors are swallowed, so a failed precache can still activate and delete the last good cache. Every GET response is cached without checking `res.ok`, so a transient 404 or 503 stays pinned until the next version bump.

**Fix:** network-first HTML with a cache fallback (or a build-generated, versioned precache), check `res.ok`, and let install fail loudly.

### H10. Leg press gets overhead-press substitutes
*Verified* · `index.html:897`

`classify` tests for "press" before it tests for "squat" or "leg press," so Leg press is classed as an overhead press, and its swap list offers Standing Overhead Press, Push Press, and the like.

## Medium

### M1. The RPE chart is extrapolated past its edge
*Verified* · `index.html:237–248`

The chart covers reps minus RPE from −9 to 3.5. The program calls for 12-rep sets and for 10 reps at RPE 6, both outside that range, and the code extends the last segment in a straight line. Near the edge that's fine (12 @ 9 gives 65.3 percent). Further out it breaks down fast (20 @ 8 gives 41.9 percent, far below any common estimate). Those 12-rep sets also feed e1RM. I'd decide which sets may update e1RM (top sets, capped around 8 reps) rather than trusting the chart everywhere.

### M2. The plate bar shows the first set's weight only
*Verified* · `index.html:462`

In an RPE ramp of 235, 245, and 250, the bar keeps showing 235 while you load 250. It should follow the next unfinished set.

### M3. Comma decimals are silently truncated
*Verified* · `index.html:489`

`parseFloat("102,5")` returns 102. In many locales iOS puts a comma on the decimal keypad, so this quietly drops weight for a large share of kilo users. There's no other input validation either: an RPE of 14 or a negative weight is accepted.

### M4. No warm-ups, and the copy says otherwise
*By inspection* · `index.html:775`

The SS settings note says "Empty-bar warm-ups happen automatically." Nothing in the app generates warm-ups. For a Starting Strength–style program, a warm-up calculator is table stakes.

### M5. Saves can be lost on exit
*By inspection* · `index.html:323`, `:937`

Saves are debounced by 120 ms, with no flush on `visibilitychange` or `pagehide`. A final tap right before swiping the app away can vanish. (A smaller oddity: a fresh install persists nothing until its first interaction.)

### M6. The rest timer works only in the foreground
*By inspection* · `index.html:570–610`

Timer state isn't saved, so when iOS reloads a backgrounded app, the timer is gone. That's easy to fix, since it already counts down to an absolute end time. The beep uses Web Audio, which iOS mutes under the silent switch by default; since iOS 17, setting `navigator.audioSession.type = 'playback'` addresses that ([WebKit bug 264473](https://bugs.webkit.org/show_bug.cgi?id=264473)). The screen sleeps mid-workout, though the Screen Wake Lock API has worked in Home Screen web apps since iOS 18.4 and must be started from a tap ([MDN compatibility data](https://chromium.googlesource.com/external/github.com/mdn/browser-compat-data/+/73d346309ee9d8be7e32fda8ff574d4c79dd4c51/api/WakeLock.json), [WebKit bug 254545](https://bugs.webkit.org/show_bug.cgi?id=254545)). Vibration isn't available on iOS, and a web app can't raise a notification when rest ends without a push server. Those last two are real arguments for an eventual native wrapper.

### M7. Setup stays editable mid-session
*By inspection*

Changing the BM block, week, day, or units while a draft is open changes where Finish advances from and what the draft's numbers mean.

### M8. The "1RM / target calculator" only does 1RMs
*By inspection* · `index.html:860`, `:872–884`

### M9. The render layer is fragile
*By inspection* · `index.html:535`, `:464`

Every tick rebuilds the whole view from HTML strings, and a DOM node is stored on persisted state (`ex._bar`). The whole state, history included, is re-serialized on every keystroke. It all works at this size, but it ties every interaction to one mutable global, which makes change risky and gets slower as the log grows.

### M10. HTML injection through `innerHTML`
*By inspection* · `index.html:427`, `:454`, `:671` (35 sinks in all)

Custom exercise names typed into `prompt()` go straight into `innerHTML`, as does program text. That's harmless while every byte of data is yours. It becomes a real hole once there's import, shared programs, or sync.

## Low and polish

- **Accessibility.** There are no ARIA attributes at all. Inputs lack programmatic labels; the ✓, −, and + buttons have no accessible names; the timer and toasts aren't live regions. The `--faint` gray (#5d6878) on the card surface measures 2.86:1, failing WCAG AA, and it carries set numbers and hints at 10–13 px. White on the red button measures 4.25:1. And `maximum-scale=1` blocks pinch zoom (`index.html:5`) without need, since every input is already 16 px or larger.
- **Type size.** Labels at 9–11 px are hard to read on a phone lying on the floor.
- **Dead code.** The `window.storage` branch (which looks like a leftover from Claude's artifact runtime), the `.rpebar`/`.rpechip` styles, the no-op line in `ssRepsDelta`, and the duplicate `S.ss.unit`.
- **Program text.** "Excercise" six times, doubled spaces, "RPE 9. (86%)," and "RPE 8(90-93%)."
- **Progress chart.** The x-axis counts sessions rather than dates, so gaps disappear; dates show no year; SS e1RMs assume every set was RPE 9; weighted chin-ups and dips produce meaningless e1RM lines.
- **Manifest.** No `id`. The maskable icon reuses the standard icon, which happens to fit the safe zone, so that's fine.
- **deploy.sh.** `git add -A` with no `.gitignore` will publish anything dropped in the folder, a JSON backup included, to a public repo. It pushes `main` whatever branch you're on, and the cache bump is manual.
- **Tests.** None, though `module.exports` at `index.html:941` shows the intent.

## Beyond the code: launch issues

**Program content.** The current build embeds the full Barbell Medicine Beginner Template (all three blocks plus GPP) in a public repo. Shipping someone else's program text in a product needs their permission, even when they give the program away. Moving to your own protocol, written in your own words, removes the question.

**Names.** Trademark records list The Aasgaard Company as owner of STARTING STRENGTH registrations ([Justia](https://trademark.justia.com/owners/the-aasgaard-company-1602684)); that's an aggregator, so confirm on USPTO's TSDR. I didn't check Barbell Medicine's marks and would assume they're protected. Both names appear in the UI and the manifest. At launch, neither the product name nor the marketing should depend on them, and any "inspired by" language deserves a lawyer's review. I'm not a lawyer, and this is the section I'd least want you to take on my say-so.

**Icon license.** The SVG credits "Noun Project (noun-7487700)" but not the icon's creator. As I understand Noun Project's terms, free use requires visible credit to the creator, and a paid license removes that requirement. Settle which one applies before launch.

**Privacy.** No accounts, no server, and no analytics is a real strength. If sync or analytics arrive, a privacy policy comes with them.

**Audience.** If this goes to beginners you don't coach, it needs onboarding, form cues or links, and a basic medical disclaimer.

## Platform assessment

**Worth keeping**

- The visual language: large monospace numerals, the plate-bar signature, the dark palette (once contrast is fixed).
- The offline-first PWA shell and the no-account privacy posture.
- The rest timer's absolute-end-time design, which survives throttling.
- Draft persistence: an in-progress workout survives a reload.
- The RPE lookup. It collapses the chart onto reps minus RPE, and the table checks out: zero conflicts along those diagonals.
- On-the-fly set and rep changes, as a concept.

**Needs replacing.** The data model, the program format, both progression engines (SS and BM share almost no code), storage, and the render layer. That's most of the app by weight, which is why I'd call this a rebuild with salvage rather than a refactor. A hybrid protocol can't be assembled from the two existing engines; it needs one.

**The shape I'd recommend**

1. **A pure protocol engine.** Prescription and logged performance go in; the next prescription comes out. No DOM, no storage, thoroughly unit-tested. A hybrid protocol lives or dies here, so this is the part most worth getting right.
2. **A declarative program schema** that can express fixed-load sets, RPE-targeted sets, back-offs as a percentage of the top set or of e1RM, AMRAPs, generated warm-ups, and progression and stall rules.
3. **A log that separates prescribed from performed,** with units, timestamps, and editable history.
4. **IndexedDB storage** with a schema version and migrations, file export and import, a persistent-storage request, and an importer for your current `ironlog.v1` data.
5. **Tooling.** TypeScript and Vite, with Preact or Svelte for the UI, deployed to Pages by a GitHub Action that also stamps the service-worker version. The no-build design was the right call for a personal tool. A product needs types, modules, and tests, and a build step makes all three cheap. If you'd rather stay build-free, ES modules with JSDoc types and `node --test` get you part of the way.
6. **Distribution.** Ship as a PWA first. Wrap it with Capacitor when you need App Store presence, rest-timer notifications, a lock-screen timer, HealthKit, or in-app purchases. A clean, tested engine also turns a later native rewrite into a port rather than an excavation.

## Quick wins worth doing now

These hold up whatever direction the rework takes. They matter most if you keep training with the current app while the new one is built, since your current log is what you'll import later.

1. Guard the `load()` parse and add a recovery screen (C7).
2. Real file export and import, plus a persistent-storage request (C8).
3. Flush saves on `visibilitychange` and `pagehide` (M5).
4. Service worker: network-first HTML, check `res.ok`, and stop swallowing install errors (H9).
5. If you're running SS now, fix the reps stepper and the weight check (C4, C5).
6. If you're running BM now, compute e1RM from completed sets only, show target RPE as a placeholder, and restore e1RM on discard (C1, C2).

Each is small. Everything else I'd leave for the rebuild.

## Questions the new spec should settle

1. **Load selection.** Fixed linear increments by default, with RPE as a brake? An RPE-targeted top set loaded from e1RM? SS-style progression until RPE drifts upward, then autoregulation?
2. **e1RM source.** Top set only? A rep cap? Smoothing across sessions?
3. **Back-offs.** A percentage off today's top set, a percentage of e1RM, or reps at a target RPE?
4. **Stalls.** Missed reps, rising RPE at the same load, or both? And what happens next: a reset, a smaller increment, a new rep scheme?
5. **Warm-ups.** Generated by rule, and by which rule?
6. **Lift roster.** The SS core plus chin-ups and dips? Power clean or row? Which variants, and at what ratios to their parent lifts?
7. **Accessories and conditioning.** Logged set by set, checked off, or just displayed?
8. **Units and plates.** Both kilos and pounds at launch? A per-user plate inventory?
9. **Devices.** One phone, or accounts and sync? This is the biggest architectural fork on the list.
10. **Distribution and audience.** A link for you and a few others, or the App Store and the public?
11. **Migration.** Should your existing history come along?

## Appendix: how findings were verified

- **Math.** The functions exported at `index.html:941` were loaded in Node 22 and called directly: RPE-table consistency along reps-minus-RPE diagonals, extrapolated percentages, the plate solver, `ssAdvance`, and `classify`.
- **UI.** Playwright drove headless Chromium at 390 × 844 against a local server with service workers blocked, seeding state through `localStorage` where needed. Each *Verified* finding matches a scripted check, and its observed output is quoted above.
- **Contrast.** The WCAG 2.x relative-luminance formula, applied to the CSS custom properties.
