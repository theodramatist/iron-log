# Retraining Tracker: app handoff

This folder holds everything needed to build an iPhone app that runs your Retraining Protocol. The app tells you what to lift each day, records what you did, and works out the next session on its own, including stalls, the 5×3 bridge, resets, light and floor weeks, illness, missed training, short nights, broken equipment, and pain stops. It lives on your home screen like a regular app, works with no signal, and keeps your data on your phone.

## What's in the folder

| File | What it is |
| --- | --- |
| `CLAUDE.md` | Build instructions for Claude Code, in milestones |
| `SPEC.md` | What the app looks like, how it's built, and how to tell it's finished |
| `RULES.md` | Every decision the app makes, written precisely enough to code |
| `program.json` | The numbers behind the rules: jumps, percentages, dates, and phases |
| `TEST_SCENARIOS.md` | 94 worked cases the app must get right before any screen is built |
| `PROTOCOL.md` | The audited Retraining Protocol, as you read it |

## How to get it built

1. Create a new GitHub repository and add these files to it.
2. Open Claude Code on that repository.
3. Tell it: "Read CLAUDE.md and build the app, one milestone at a time."
4. After each milestone, read its report. Answer anything it lists in `QUESTIONS.md`.
5. When it finishes, it writes `DEPLOY.md` with your app's web address.

## How to install it on your iPhone

1. Open the address from `DEPLOY.md` in Safari.
2. Tap Share, then Add to Home Screen.
3. Open the app from your home screen, not from Safari. Your data lives with the home-screen app.
4. Walk through the six setup screens. The app will ask how Monday's last sets felt, so have that in mind.

## Keeping your data safe

The app stores everything on your phone. Back up from Settings with Export once a week, and save the file to iCloud Drive. The app reminds you after Friday's session if a week has passed.

## What the app won't do

It doesn't track food. It shows your eating plan's prompts on the right days, such as the second Shake on conditioning days, and nothing more. It doesn't sync between devices, send notifications, or program a lift after it leaves the novice run. At that point it just logs what you do.

## Changing the plan later

Change `RULES.md` and `program.json` first, then add a test to `TEST_SCENARIOS.md`, then ask Claude Code to update the app. If the app and `PROTOCOL.md` ever disagree, the app follows `RULES.md`, so keep the protocol in step.
