# Questions

Open questions from building the app (CLAUDE.md, ground rule 1). Each answer is written into RULES.md as an **[app rule]** in the section named, and its value sits in `src/engine/readings.ts`.

## Open

None.

## Answered

The owner accepted every recommendation on 2026-11-03: keep 16 readings as they were, and change Q8 and Q13. Q19 came up while building the screens, and Q20 and Q21 came from the M3 audit (`docs/AUDIT-M3.md`). All three were answered the same day. Q22 and Q23 are features the owner asked for after launch, on 2026-11-04, Q24 and Q25 followed on 2026-11-09, Q26 and Q27 on 2026-11-14, and Q28 through Q30 on 2026-11-16.

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
| Q22 | Skipping a session for lack of time | §1, §6, §8 | **New, at the owner's request:** "No time today" moves a skipped lifting session to the next day and the rest of the week with it. Saturday takes the overflow, and skipping Saturday too moves it to Sunday, as the owner added the same day. A skipped conditioning session just drops. Intervals stay Thursday's (Q8), and the light squat day can look ahead to a moved weekend session (T97–T104). |
| Q23 | A rest timer that lags a session behind | §14 | **New, at the owner's request:** the timer asks how many reps were left on the set just logged and resets that rest from the §14 table, so a set that turns hard gets 3:30 or 5:00 at once instead of next session. A short set starts the missed rest. After the last work set, the answer fills in an empty effort rating. It changes rest only. |
| Q24 | Conditioning minutes on lifting days | §8 | **New, at the owner's request:** he can log extra easy minutes on any day, after lifting on lifting days, so the weekly bar can reach 150. They count toward the bar only, not as one of the week's two conditioning sessions, so the protocol's slow ramp of conditioning weeks and phases is unchanged (T105–T107). |
| Q25 | Automatic backups | SPEC §8 | **New, at the owner's request:** both a one-tap "Back up now" to iCloud Drive on a session's last screen when the last copy is a week old, and an automatic backup to a private GitHub repository he owns, after every change. The backup file is the one thing that may leave the phone, and only there. The token stays on the phone, out of exported files (CLAUDE.md, repo instruction 11). |
| Q26 | A missed day he wants to do the next day | §1 | **New, at the owner's request:** when yesterday's lifting was missed with nothing logged, Today offers "Do yesterday's workout today." It records yesterday as a "No time today" skip after the fact and moves the week the same way, so conditioning isn't dropped and a missed Friday can be done on Saturday (T108). In the same request, a logged session's Edit screen can now add a lift that shows "Not reached," or chins and dips with nothing logged, at that day's prescription (§17, T109). |
| Q27 | Conditioning weeks from rides after lifting | §8 | **New, at the owner's request:** a conditioning week counts whenever it has two sessions of 20 minutes or more, on any days, and an extra ride after lifting counts as one. Before this, extra minutes counted toward the weekly bar only (Q24), so weeks of riding after lifting left the ramp at week 1. Qualifying extra rides also reset the layoff clock. They still don't fill Tuesday's or Thursday's place in the week, carry intervals, or add food lines (T106). `program.json`'s descriptive `conditioning.countingRule` still says "both sessions." No code reads it, and this rule governs. |
| Q28 | Waist measurements | SPEC §4, §5.3, §5.6 | **New, at the owner's request:** he measures his waist with a tape every 14 days, since waist tracks fat loss better than the scale while he's lifting. The last screen of a lifting session asks for it when a check is due, starting with the first session, and never on a past-date entry. Progress charts it, with an "Add measurement" button, the change since the first one, and the next check's date. No rule reads it, and it goes into backups like any other entry (T110). |
| Q29 | Weigh-ins with the waist check | SPEC §5.3, §5.6 | **New, at the owner's request:** the session's last screen asks for a weigh-in at the same time as the waist. Each comes due 14 days after its last entry, setup's weight counting as the first weigh-in, and the card asks for both whenever either is due. Progress shows the bodyweight change and the next weigh-in, one point a day (T111). |
| Q30 | Chin and dip settings he actually used | §7 | **New, at the owner's request:** he can change the help, or the belt when weighted, during a session ("Change" on each movement) and afterward in the session editor. Section 7 already reads `LOAD` from the session's A, which is what he logged. This makes `REPS_BUILD` keep the help he used and `WEIGHTED` add 2.5 to the belt he used, so every mode goes on from what he lifted. Bodyweight and calibration sessions have no setting to change, and light weeks still don't progress (T112). |
