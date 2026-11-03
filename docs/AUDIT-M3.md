# Iron Log: M3 Audit

*November 3, 2026 · Audited at commit `d4799de` on `claude/clever-volta-6xjl4x`*

This audit covers the rebuilt Iron Log after milestone M3: the rules engine, the on-phone data layer, and the four core screens (Setup, Today, and the lifting and conditioning sessions). Week, Progress, Lifts, Settings, the service worker, the icons, and the deploy come in M4 through M6, so they're listed at the end as not yet built rather than as findings. Finding IDs here belong to this document. The IDs in `docs/AUDIT.md` refer to the old app.

## Scope and method

I read every engine file against RULES.md, section by section, and the data and screen code against SPEC.md sections 3 through 8. Where the code looked wrong or the rules looked silent, I ran throwaway scenarios through the engine's own API, the way the tests do. I drove the development build in headless Chromium at 375 × 667, the smallest iPhone screen that runs iOS 18, and at 390 × 844. I measured every control on each screen and timed the engine on logs of 12, 52, and 104 weeks. I also searched the production bundle for network code.

Findings tagged *Verified* were reproduced that way, and the observed numbers are quoted. Findings tagged *By inspection* come from reading the code. I didn't test on a physical iPhone, so iOS behavior (audio, long press, text size) is by inspection or from WebKit's documented behavior.

At the time of the audit, all 174 tests passed in 22 files, and so did typecheck, lint, the production build, and the browser smoke test.

## Bottom line

The engine is in good shape. Every RULES.md section has its own test file, and every yes-or-no decision, along with Q13's 30 lb, fails a test when its constant is changed. A week clicked through the real screens produced exactly the states and plans the scenarios expect. The engine never reads the clock, and the bundle makes no network calls.

The audit found one bug that can put a wrong weight on the bar (H1). It found two places where RULES.md contradicts itself or says nothing, which need your call (H2 and M1, written up as Q20 and Q21). And it found a group of screen problems: a cramped stepper, a countdown that VoiceOver would read aloud four times a second, sheets that grab focus every second, a resumed session that can't beep, and no warning when a save fails or storage won't open.

None of it blocks M4. I'd fix H1 and most of the medium findings first, since M4's screens will build on the same pieces.

Severity reflects what happens to the lifter, not how hard the fix is.

## High

### H1. The layoff warm-up question never goes away
*Verified* · `src/engine/replay.ts:408`, `src/engine/barbell.ts:300`, `src/engine/prescribe.ts:285`

After 22 to 60 days away, each lift's first session back asks "Did that warm-up feel heavy?" A yes drops the work sets to 80% of the weight before the layoff (RULES.md section 11). The engine keeps that old weight in `preLayoffLcw` and clears it only on a yes or at the next layoff. A no leaves it set, so the question comes back at every later session.

I logged 35 days off after November 2. The squat's first session back, on December 7, was 85 lb with the question attached, which is right. It was logged without a yes. The question was still there on December 9, and still there on December 14, when the squat was back up to 115. A yes that day would have dropped the squat to 75 lb (80% of the old 95) and made 75 its new base, a week after the layoff ended.

Fix: clear `preLayoffLcw` once a lift's first heavy session after the layoff is logged, whatever the answer. Lifts that weren't in that session keep it until their own first session back, since they haven't been asked yet.

### H2. A first calibration in a light week sets the lift's weight and progresses
*Verified* · `src/engine/prescribe.ts:212` · proposed as Q20

Bench, rows, cleans, and dips calibrate the first time they appear, and a calibration day is the lift's first heavy session (RULES.md section 9, Q6). But nothing progresses in a light or floor week (section 10). When a first appearance lands in one of those weeks, the two rules collide, and today the calibration wins. With a light week declared on November 16, the row's first appearance on November 18 ramps from the empty bar to a heavy set, and its work sets set the row's starting weight and its next jump.

The likely case is the row's first Workout B in week 3, during a light week after an illness or an overloaded week. I'd have the lift sit out that week with a note, and calibrate at its first session of a normal week. QUESTIONS.md has this as Q20.

## Medium

### M1. A pain return inside a light or floor week runs full sets
*Verified* · `src/engine/prescribe.ts:208` · proposed as Q21

A lift back from a pain stop runs "one session of its normal sets" at 90% (section 12). Inside a light week, every other lift runs 2×5 at 90%, but the returning lift runs 3×5. With the squat pain-stopped on November 4 and a light week declared for November 6, the squat came back as 3×5 at 85. In a floor week it would run 3×5 while everything else runs 2×5. I'd have the return take the week's set count at the return weight. That's Q21.

### M2. A floor week shows three lifting days
*Verified* · `src/engine/plan.ts:106–109`, `:151`

Floor weeks allow two lifting sessions, on the first two lift days (section 10). But each day's plan counts only the sessions already logged. So before Christmas week starts, Monday, Wednesday, and Friday all show as planned lifting days, and Friday turns off only once Monday and Wednesday are done. Today's week strip shows this now, and M4's Week screen would too. The week summary should count planned days against the cap, the way it now takes turns A and B.

### M3. Chins recalibrating after a long layoff get the dip instructions
*Verified* · `src/engine/prescribe.ts:309`

After more than 60 days away, chins recalibrate with the only calibration text in program.json, which was written for dips: "Start with the current chin assistance… stopping at upper arms parallel." For chins the start is 30 lb above the old setting (Q13), and the depth cue doesn't apply. The engine should build chin-specific text, which leaves program.json unchanged.

### M4. The conditioning minutes stepper is crushed on a small phone
*Verified* · `src/ui/theme.css:723`, `src/ui/screens/ConditioningSession.tsx:169`

At 375 points wide, the minutes stepper shares a row with the phase-range note, and its − and + buttons shrink to 19 × 44 points. Every other control I measured meets the 44-point minimum. The stepper shouldn't be allowed to shrink, and the note can sit below it.

### M5. Sheets pull focus back every second
*By inspection* · `src/ui/components.tsx:127–130`

The bottom sheet moves focus to itself in an effect that depends on its `onClose` prop. Every caller passes a new function on each render, so the effect reruns on every render. That's every second inside a session, where the clock ticks, and every minute on Today. A VoiceOver user would be pulled back to the top of the sheet each time, and the past-session date field would lose focus. Focus should move once, when the sheet opens.

### M6. A resumed session can't sound its alerts
*By inspection* · `src/ui/screens/Today.tsx:38`

iOS starts Web Audio only from a tap, so the app unlocks audio on the Start session tap (SPEC.md section 7). If iOS closes the app mid-session, it reopens straight into the saved session without that tap. For the rest of that session, the rest timer can flash but can't beep. Any tap inside a session screen should unlock audio too.

### M7. A session left from an earlier day reopens as if it were live
*By inspection* · `src/ui/App.tsx:81`, `src/ui/screens/LiftingSession.tsx:118`

A session that's never finished reopens at the next launch, even days later. The clock then shows the time since it started, in hours, and the time guard sees a session far past 80 minutes and starts offering cuts. A draft dated before today should reopen as a past entry, with no clock or timer, and offer to finish or discard it.

### M8. A failed save leaves Finish stuck
*By inspection* · `src/ui/screens/LiftingSession.tsx:1018`, `src/ui/screens/ConditioningSession.tsx:317`

Save session disables itself and starts the write, but nothing handles a failure. If IndexedDB refuses the write, the button stays disabled and nothing says why. The draft is safe, but you'd have no way to know that or to retry short of closing the app. A failure should re-enable the button and say what happened.

### M9. If storage won't open, nothing warns that data won't be kept
*By inspection* · `src/data/index.ts:29–31`

When IndexedDB can't open, the app falls back to memory so it still runs, and the repository reports `durable: false`. Nothing on screen uses that flag. A session logged in that state would vanish when the app closes, without warning. That's unlikely in a Home Screen app on iOS 18, but the cost would be lost training history. Today should show a plain warning whenever storage isn't durable.

### M10. Text size is fixed in pixels
*Verified* · `src/ui/theme.css`

Every size in the stylesheet is in pixels, and the root font is a fixed 16 px, so the iPhone's text-size setting has no effect. SPEC.md section 6 asks the app to respect it where the layout allows. The usual fix is `font: -apple-system-body` on the root and `rem` sizes everywhere else, with the big numerals and timers capped so they still fit. It belongs with M5's iPhone polish, but it's cheaper to do before M4 adds four more screens.

### M11. The engine slows faster than the log grows
*Verified* · `src/engine/plan.ts:151`, `src/engine/conditioning.ts:12`

Every screen replays the whole log, which is SPEC.md's design and fine at this scale. But the cost grows faster than the log does:

| Log | Events | `planFor` | Today's work |
| --- | --- | --- | --- |
| 12 weeks | 61 | 0.7 ms | 5 ms |
| 1 year | 261 | 3.4 ms | 35 ms |
| 2 years | 521 | 9.1 ms | 107 ms |

Two things drive it. The week summary replays the log eight times, once for each day and once for the totals. And `weekCounted` rescans every conditioning session for each week it checks. At two years, Today would spend about a tenth of a second per render, and M4's Week and Progress screens add more of the same work. A cache of replayed states, keyed on the log's version and the date, plus an index of conditioning sessions by week, would bring it back to linear. These are desktop timings. An iPhone may be somewhat slower, and I haven't measured one.

### M12. The conditioning countdown would be read aloud four times a second
*Verified* · `src/ui/screens/ConditioningSession.tsx:253`

The countdown sits inside a polite live region, and the time in it changes four times a second, so VoiceOver would announce it without pause. Only the change of segment should be announced. The ticking time should be a plain timer, like the rest timer's.

## Low and polish

- **L1. Calibration cards have no Pain stop.** SPEC.md puts Pain stop in each lift card's menu, but the calibration card that replaces it on a lift's first day has no menu. *By inspection* · `src/ui/screens/LiftingSession.tsx:614`
- **L2. A long press might select text on an iPhone.** Holding a set to mark it skipped could start iOS text selection or its callout bubble. The set buttons should turn both off. *By inspection, not tried on a phone*
- **L3. A power clean's food-lever repeat skips the graduation check.** When that repeat misses, the clean resets at once, as section 5 says. But a clean that had already reset from that weight would graduate under the normal stall rule. RULES.md doesn't say which comes first, and the case is very rare. *By inspection* · `src/engine/barbell.ts:202`
- **L4. Import keeps old drafts, and a backup with no setup event sends you to Setup.** A restore leaves any in-progress session draft in place. And Setup would seed a second November 2 session on top of the imported log. Import should clear drafts and refuse a backup without a setup event. *By inspection* · `src/data/idbAdapter.ts:59`, `src/ui/App.tsx:79`
- **L5. Start session sits in the upper half of Today.** SPEC.md section 6 wants primary actions in the bottom half for one-handed use. At 390 × 844, the button's top is about a third of the way down the screen. *Verified by screenshot*
- **L6. The light squat day, light weeks, and floor weeks aren't named on their lift cards.** The light squat day shows as "Squat 2×5 · 115," with nothing to say it's the light day. *By inspection*
- **L7. There's no way to log a second session on the same day.** RULES.md section 17 allows it with a warning, and the engine handles it. But Today hides Start once the day is done, and past entries stop at yesterday. *By inspection*
- **L8. The page behind a session screen can scroll.** The session screen doesn't contain its own overscroll, so on an iPhone a fast flick can move the page underneath. *By inspection*
- **L9. A past entry's summary shows today's next prescriptions.** After logging an earlier date, "Next time" reflects the whole log, including later sessions, which reads oddly. *By inspection*
- **L10. An unused module-preload polyfill ships in the bundle.** It never fires in a one-file build, but it's the only `fetch` in the app. Vite's `build.modulePreload.polyfill: false` removes it. *Verified*
- **L11. PROTOCOL.md and RULES.md disagree slightly on rest.** PROTOCOL says "about 2 minutes" while sets end with 3 or more reps to spare. RULES.md gives 2:30 for 3–4 left. RULES decides, but the two should match.
- **L12. A short layoff overwrites a graduated lift's "last completed" weight.** That field doubles as the prefill, so after a layoff it holds the dropped weight. M4's restart suggestion (90% of the last completed weight, Q17) should read the lift's history instead. *By inspection* · `src/engine/barbell.ts:315`
- **L13. The lifting session screen is one 1,148-line file.** The stop sheet and the session menu are also written twice, once for each session screen. It's worth splitting before M4 adds more. *By inspection*
- **L14. `npm audit` reports 20 warnings.** All come from build tools inside vite-plugin-pwa (ejs and jake, under workbox-build). Nothing that ships has a reported vulnerability: `npm audit --omit=dev` finds none.

## Questions for you

Both are in QUESTIONS.md, written up the usual way.

**Q20. A first calibration in a light or floor week** (H2). My recommendation: the lift sits out that week with a note, and calibrates at its first session of a normal week.

**Q21. A pain return in a light or floor week** (M1). My recommendation: the return takes the week's set count at the return weight. That's 2×5 at 90% in either week, and it still counts as the return.

## Acceptance criteria at M3

| SPEC.md section 10 | Status |
| --- | --- |
| 1. `npm test` passes T01–T96, and every RULES section has a test | Met: 174 tests, with one file per section |
| 2. The engine imports nothing from the DOM, storage, or the clock | Met, and enforced by its own tsconfig, lint rules, and a test |
| 3. `npm run build` produces static files for an HTTPS host | Met, though `base` waits for M6 |
| 4. Installs from Safari, opens full screen, works offline, keeps its data | Not yet: needs M5's service worker and icons, and M6's deploy |
| 5. One tap for a made set, and a normal session needs no typing | Met |
| 6. Export, erase, and import restore the same log, state, and plan (T81) | Met in the data layer; the buttons come in M4 |
| 7. The rest timer is right after the app is backgrounded (T77) | Met, in Vitest and in the real screen across a reload |
| 8. No network requests after the first load | The app makes none, but until M5's service worker, a reload needs the network |
| 9. Protocol terms, and no exclamation points | Met on every screen the smoke test visits |

## Not yet built

So these aren't mistaken for findings:

- **M4:** Week, Progress, Lifts, and Settings, with the export reminder and the export and import buttons.
- **M5:** the manifest icons and apple-touch-icon, service worker registration with update prompting, deleting the old `ironlog-v*` caches, and the rest of the iPhone polish.
- **M6:** `base: '/iron-log/'`, the GitHub Actions workflow, and DEPLOY.md.

Before M6 replaces the old app, export your data from it: open the old Iron Log from the Home Screen, tap Setup, tap "Copy my data (backup)," and paste the result somewhere safe.

## Suggested order

1. Fix H1, with a test.
2. Answer Q20 and Q21, then build both with tests.
3. Fix M2 through M9 and M12. Each is small and local.
4. Do M10 and M11 at the start of M4, since the new screens will inherit both.
5. Take the low findings as their screens come up in M4 and M5.

## Appendix: how findings were verified

The engine probes were throwaway Vitest files. They built logs with `tests/helpers/log.ts` and read plans through the engine's public API, as the scenario tests do. The timings came from logs built the same way, with every set made and every session logged, then run through `planFor`, `prescribe`, `weekSummary`, and the four calls Today makes. The screen findings came from Playwright 1.63.0 driving `npm run dev` with the `?today=` override. It measured each control's bounding box and listed the live regions on each screen, and it took screenshots at 375 × 667 and 390 × 844.
