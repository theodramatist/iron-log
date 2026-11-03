# Questions

Open questions from building the app (CLAUDE.md, ground rule 1). Each answer is written into RULES.md as an **[app rule]** in the section named, and its value sits in `src/engine/readings.ts`.

## Open

The M3 audit (`docs/AUDIT-M3.md`) raised these two. To answer, reply in chat ("Q20: keep it"). Each reading gets its constant and tests when it's built, and until then the engine works as described under **Problem**.

### Q20. A first calibration that falls in a light or floor week (§2, §9, §10)

**Problem.** Bench, rows, cleans, and dips calibrate the first time they appear, and a calibration day counts as the lift's first heavy session (§9, Q6). But nothing progresses in a light or floor week (§10). When a lift's first appearance falls in one of those weeks, the two rules collide. Today the calibration runs: the row's first Workout B in week 3, inside a light week, ramps to a heavy set and sets the row's starting weight and next jump (audit finding H2).

**Reading.** In a light or floor week, a lift that still needs calibration sits out, with the note "Calibrates at its first session of a normal week," and calibrates then. Chin and dip calibrations stay as they are: they look for a setting with reps to spare, and a light week doesn't progress them.

**Constant.** `CALIBRATION_WAITS_FOR_NORMAL_WEEK = true`.

### Q21. A pain return that falls in a light or floor week (§10, §12)

**Problem.** A lift back from a pain stop "runs one session of its normal sets" at 90% (§12). In a light week the other lifts run 2×5 at 90%, and in a floor week 2×5 at `lcw`. Today the returning lift runs its normal sets, 3×5 at 90%, in either week, so it does more than anything else that week (audit finding M1).

**Reading.** The return session takes the week's set count at the return weight: 2×5 at 90% (1×5 for the deadlift and 3×3 for cleans). It still counts as the return, and the lift resumes its prescription afterward.

**Constant.** `PAIN_RETURN_TAKES_WEEK_SETS = true`.

## Answered

The owner accepted every recommendation on 2026-11-03: keep 16 readings as they were, and change Q8 and Q13. Q19 came up while building the screens and was answered the same day.

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
