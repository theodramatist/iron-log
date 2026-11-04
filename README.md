# Iron Log

An iPhone app that runs the Retraining Protocol for one lifter. It tells you what to lift each day, records what you did, and works out the next session on its own, including stalls, the 5×3 bridge, resets, light and floor weeks, illness, missed training, short nights, broken equipment, and pain stops. It lives on your home screen like a regular app, works with no signal, and keeps your data on your phone.

## What's in the repo

| Path | What it is |
| --- | --- |
| `CLAUDE.md` | Build instructions for Claude Code, in milestones, plus this repo's own instructions |
| `SPEC.md` | What the app looks like, how it's built, and how to tell it's finished |
| `RULES.md` | Every decision the app makes, written precisely enough to code |
| `program.json` | The numbers behind the rules: jumps, percentages, dates, and phases |
| `TEST_SCENARIOS.md` | 96 worked cases the app must get right |
| `PROTOCOL.md` | The audited Retraining Protocol, as you read it |
| `QUESTIONS.md` | Questions from the build and how each was decided |
| `DEPLOY.md` | The live address, how to deploy, and how to put the app on the iPhone |
| `src/engine/` | The rules engine: pure TypeScript, tested against every scenario |
| `src/data/` | On-phone storage, backups, and drafts |
| `src/ui/` | The screens, and the session drafts behind them |
| `tests/` | One test file per RULES.md section, named by scenario ID |
| `e2e/smoke.mjs` | A browser walk through the first week, checked against the engine |
| `.github/workflows/deploy.yml` | Tests, builds, and publishes the app to GitHub Pages on every push to `main` |
| `docs/AUDIT.md` | The audit of the original Iron Log, which this rework replaced |
| `docs/AUDIT-M3.md` | The audit of the rebuilt app at M3, with findings ranked by severity |

## Working on it

```bash
npm install
```

```bash
npm test
```

```bash
npm run dev
```

The dev server serves the app at `http://localhost:5173/iron-log/`, the same path it has on GitHub Pages. In development, add `?today=2026-11-04` to that address to see any day. The smoke test clicks through the first week in a headless browser:

```bash
npm run smoke
```

The milestones in `CLAUDE.md` say what comes next. After each one, read its report and answer anything new in `QUESTIONS.md`.

## How to install it on your iPhone

The app lives at https://theodramatist.github.io/iron-log/. `DEPLOY.md` has the full steps, including how to log a session from an earlier day.

1. Open the address in Safari.
2. Tap Share, then Add to Home Screen.
3. Open the app from your home screen, not from Safari. Your data lives with the home-screen app.
4. Walk through the setup screens. The app will ask how Monday's last sets felt, so have that in mind.

Sessions done before the app was ready go in as past-date entries.

## Keeping your data safe

The app stores everything on your phone. Back up from Settings with Export once a week, and save the file to iCloud Drive. The app reminds you after Friday's session if a week has passed.

## What the app won't do

It doesn't track food. It shows your eating plan's prompts on the right days, such as the second Shake on conditioning days, and nothing more. It doesn't sync between devices, send notifications, use kilograms, or program a lift after it leaves the novice run. At that point it just logs what you do.

## Changing the plan later

Change `RULES.md` and `program.json` first, then add a test to `TEST_SCENARIOS.md`, then ask Claude Code to update the app. If the app and `PROTOCOL.md` ever disagree, the app follows `RULES.md`, so keep the protocol in step.
