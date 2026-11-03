# Build instructions for Claude Code

You are building **Iron Log**, an offline iPhone home-screen web app for one lifter. It runs the Retraining Protocol and works out every prescription itself, including stalls, resets, deloads, layoffs, and pain stops.

## Read first, in this order

1. `SPEC.md`: what to build, the stack, screens, iPhone requirements, and acceptance criteria.
2. `RULES.md`: every decision the engine makes. This is the authority.
3. `program.json`: the constants RULES.md uses.
4. `TEST_SCENARIOS.md`: T01 through T96, the tests the engine must pass.
5. `PROTOCOL.md`: the plan as the lifter reads it. Use it for context and wording, not for rules.

## Ground rules

1. **RULES.md decides.** Don't invent training rules, and don't "improve" the program. If RULES.md is ambiguous, contradicts PROTOCOL.md or program.json, or a scenario can't pass as written, add an entry to `QUESTIONS.md` with the section, the problem, and your proposed reading. Implement the proposed reading behind a named constant, and list open questions in your milestone report.
2. **Engine first, tests first.** Write the scenario tests before the engine code that satisfies them. Name each test with its scenario ID.
3. **Keep the engine pure.** Nothing in `src/engine/` may touch the DOM, IndexedDB, `Date.now()`, or `new Date()` without an argument. Today's date is an input.
4. **Calendar-day arithmetic.** Represent dates as `YYYY-MM-DD` strings and convert to integer day numbers with `Date.UTC(y, m - 1, d) / 86400000` for differences and weekdays. Never add 24-hour blocks to local `Date` objects. Test T82 checks this.
5. **Copy `program.json` to `src/program/program.json` unchanged.** If a constant has to change, change both copies and log it in `QUESTIONS.md`.
6. **Dependencies.** Use the stack in SPEC.md section 2, plus `@vite-pwa/assets-generator` for icons and Playwright for an optional smoke test. Ask before adding anything else.
7. **No data leaves the phone.** No analytics, no remote fonts, no CDNs, and no network calls after the first load.
8. **Words.** Take labels and messages from `program.json` where it has them. Use the protocol's terms. No exclamation points anywhere in the interface.

## Milestones

Stop after each milestone and report what's done, the test count, and any open questions.

**M0 · Scaffold.** Vite, strict TypeScript, Preact, Vitest, ESLint, and `vite-plugin-pwa`, with scripts for `dev`, `test`, `build`, and `preview`. Done when `npm test` runs.

**M1 · Engine.** In `src/engine/`: dates, plates and rounding, warm-ups, progression, the stall ladder, the light squat day and once-a-week deadlift, chins and dips, conditioning, deloads, missed training, pain, nutrition prompts, time budget, and the API in SPEC.md section 3. Add a terse `buildLog()` test helper so scenarios read like their text. Done when T01 through T94 pass, apart from T77 and T81, which need M2 and M3.

**M2 · Data.** IndexedDB event store with `idb`, session drafts, replay on every change, export and import in the SPEC.md section 4 format, and the persistent-storage request. Done when T81 passes.

**M3 · Core screens.** Setup, Today, Lifting session, and Conditioning session, as SPEC.md section 5 describes. Add a development-only `?today=YYYY-MM-DD` override so a whole week can be clicked through in a desktop browser. Done when a simulated week from 2026-11-02 matches the engine's prescriptions and T77 passes.

**M4 · Remaining screens.** Week, Progress, Lifts, Settings, and backups with the export reminder.

**M5 · iPhone polish.** Manifest, icons generated from one simple SVG (a plain barbell glyph on a dark field, no text), service worker with update prompting, wake lock, audio unlock, screen-flash alerts, and safe areas. Done when SPEC.md acceptance criteria 4, 7, and 8 hold.

**M6 · Deploy.** Deploy to GitHub Pages with a GitHub Actions workflow, setting Vite's `base` to the repository name, or to another static HTTPS host if the user prefers. Write `DEPLOY.md` with the live URL, how to redeploy, and the iPhone steps: open the URL in Safari, tap Share, then Add to Home Screen.

## Finished means

Every acceptance criterion in SPEC.md section 10 holds, `QUESTIONS.md` has no unanswered entries, and `DEPLOY.md` exists.

## Repo-specific instructions

The owner set these on 2026-11-03. They apply on top of the milestones, and they win where they differ from SPEC.md's defaults.

1. **Name and look.** The app is Iron Log. Use its visual language instead of SPEC.md's default styling: the dark palette (with the contrast fixes in `docs/AUDIT.md`), monospace numerals, and the plate bar.
2. **Shared origin.** Every app on theodramatist.github.io shares one origin. The IndexedDB database is named `iron-log`, and Workbox caches use the `iron-log` cache ID. Vite's `base` is `/iron-log/`, and the service worker is `/iron-log/sw.js` with scope `/iron-log/`.
3. **Taking over from the old app.** The old Iron Log's service worker lives at that same URL, so installed phones update to the new one. On activate, delete every cache named `ironlog-v*`, so no phone keeps serving the old app.
4. **No Barbell Medicine program.** The old app and its embedded template are gone. Only the protocol in PROTOCOL.md ships.
5. **Icon.** The generated barbell icon from M5.
6. **Deploy.** The GitHub Actions workflow from M6. There is no `deploy.sh`, and `.gitignore` keeps backup files out of the repo.
7. **Units.** Pounds only. Kilograms are a SPEC.md non-goal.
8. **No migration.** Don't import the old app's `ironlog.v1` data. Before the M6 deploy replaces the old app, remind the owner to export a backup from it: open the old Iron Log from the Home Screen, tap Setup, tap "Copy my data (backup)," and paste the result somewhere safe.
9. **Past-date entries.** Sessions done before launch will be entered as past-date entries (RULES.md §17), so the UI must let him log a session for an earlier date.
10. **Decisions.** The owner answered Q1 through Q19 on 2026-11-03. They live in RULES.md as **[app rule]** entries, with values in `src/engine/readings.ts`. New questions go in QUESTIONS.md the same way.
