# Iron Log

A self-contained iPhone workout tracker (PWA) for **Starting Strength** and the
**Barbell Medicine Beginner Template**. No build step, no dependencies; works fully
offline once installed to the Home Screen.

## Files
- `index.html` — the entire app (HTML + CSS + JS + all program data, inline)
- `manifest.webmanifest` — PWA manifest (name, icon, standalone display)
- `sw.js` — service worker for offline caching (bump `CACHE` when you change `index.html`)
- `icons/` — app icons (192 / 512 / 180 apple-touch)
- `.nojekyll` — tells GitHub Pages to serve files untouched
- `deploy.sh` — one-step publish to GitHub Pages
- `README.md` — this file

## Deploy to GitHub Pages

One-time setup — install the GitHub CLI and sign in:
```
brew install gh        # macOS
gh auth login
```

Then, from inside this folder (or just tell Claude Code "run deploy.sh"):
```
bash deploy.sh
```
The first run creates a public `iron-log` repo, pushes, enables Pages, and prints your
URL — `https://<your-username>.github.io/iron-log/`. Re-run any time to push updates.

Options:
- `bash deploy.sh my-repo-name`   — use a different repo name
- `MSG="add feature" bash deploy.sh`   — custom commit message

On iPhone: open the printed URL in **Safari → Share → Add to Home Screen**.

## Using it
- **Starting Strength** — Workouts A/B alternate (barbell rows replace the power clean;
  chin-ups on A, dips on B). Hit all sets at the target reps and the weight auto-bumps next
  time; miss a lift three sessions running and it deloads 10%. Sets and reps are adjustable
  per session on the workout screen (e.g. 5×3 one day, 3×5 the next). No RPE.
- **Barbell Medicine** — Blocks I–III, weeks 1–4 (repeat week 4 while your e1RMs climb,
  advance when two-plus lifts stall). RPE-driven: enter weight / reps / RPE and it estimates
  your 1RM and pre-fills target weights.
- **Rest timer** (both) — auto-starts when you check off a set; tap to pause, ±30s, skip.
  Defaults 3:00 (SS) / 4:00 (BM), editable in Setup.
- **Plate view** — shows the loaded bar and what to load per side. Add your fractional plates
  in **Setup → Plates** so targets round to a weight you can actually load.
- Data is stored on the device (localStorage). Setup has backup + reset.

## Tweaking
Most defaults live in the `defaults()` function near the top of the `<script>` in
`index.html`: starting weights, per-session increments, rest times, units. The Barbell
Medicine program lives in the `DATA` object at the very top of the script. After editing
`index.html`, bump `CACHE` in `sw.js` (e.g. `ironlog-v3` → `ironlog-v4`) so installed phones
pick up the change, then re-run `deploy.sh`.
