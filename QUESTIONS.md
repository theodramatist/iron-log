# Questions

Open questions from building the app (CLAUDE.md, ground rule 1). Each answer is written into RULES.md as an **[app rule]** in the section named, and its value sits in `src/engine/readings.ts`.

## Open

None.

## Answered

The owner accepted every recommendation on 2026-11-03: keep 16 readings as they were, and change Q8 and Q13. Q19 came up while building the screens, and Q20 and Q21 came from the M3 audit (`docs/AUDIT-M3.md`). All three were answered the same day.

| # | Question | RULES.md | Decision |
| --- | --- | --- | --- |
| Q1 | A food-lever round that fails within 14 days of a maintenance break | §5 | Keep: the hold comes first. T29's wording now says so. |
| Q2 | Which sessions count toward the light squat day and once-a-week deadlift | §6 | Keep: only made sessions that took a progression step. Repeats and misses leave the count alone. |
| Q3 | Rest defaults for power cleans and rows | §14 | Keep: crisp 2:30, not crisp 3:30, missed 5:00. |
| Q4 | Work sets logged at different weights | §3 | Keep: `W` is the lowest attempted weight. |
| Q5 | Sessions under 20 minutes and the weekly bar | §8 | Keep: their minutes count toward the bar, though not as completed sessions. |
| Q6 | Whether a calibration day progresses | §9 | Keep: it's the lift's first heavy session, for bench, rows, cleans, and dips. |
| Q7 | Whether a floor week includes its weekend | §10 | Keep: the whole calendar week. |
| Q8 | Which session gets the intervals when days move | §8 | **Changed:** Thursday only. No Thursday session, no intervals that week (T95). |
| Q9 | Two lifts waiting on "Has recovery felt poor?" | §5 | Keep: one answer covers both. |
| Q10 | That question left unanswered | §5 | Keep: No once the next lifting session is logged, and the session screen asks it at the start. |
| Q11 | A made lift with no effort rating | §4 | Keep: the smallest table row. |
| Q12 | An assist machine without 5-lb steps | §7 | Keep: take off the stack step (10 lb). |
| Q13 | Where chins restart after more than 60 days | §11 | **Changed:** 30 lb above the old setting, off the belt first (T96). |
| Q14 | A graduated lift and an 8-to-60-day layoff | §11, §17 | Keep: it stays graduated, and only its prefill drops. |
| Q15 | Whether a pain-stopped session is the lift's last heavy session | §11 | Keep: yes, so T67 and T70 both hold. |
| Q16 | Whether a fresh novice run clears "not crisp" | §11 | Keep: yes, cleans and rows go back to 5-lb jumps. |
| Q17 | The restart weight for a graduated lift | §17 | Keep: suggest 90% of the last completed weight, editable. |
| Q18 | Time-projection estimates | §14 | Keep, and tune them against logged session times once there are a few weeks of them. |
| Q19 | When the early-stall note goes away | §5, §13 | Keep: it lasts as long as that lift's stall, clearing when the lift makes the bridge, resets, or graduates, when the food lever turns on, or when he dismisses it. Left up, two notes could fill both banner slots and hide the export reminder. |
| Q20 | A first calibration that falls in a light or floor week | §9, §10 | Keep: the bench, row, or clean sits out that week with a note and calibrates at its first session of a normal week. Chin and dip calibrations go ahead. |
| Q21 | A pain return that falls in a light or floor week | §10, §12 | Keep: the return takes the week's sets at 90% (2×5, 1×5 for the deadlift, 3×3 for cleans) and still counts as the return. |
