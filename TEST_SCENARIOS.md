# Test scenarios

Every scenario below becomes at least one automated test of the engine (`src/engine/`), named by its ID (for example `T07 Wednesday squat jumps`). The numbers were computed from `program.json` with the default plate inventory (one pair each of 1.25-lb and 0.5-lb plates) and 2.5-lb assistance steps available, unless a scenario says otherwise. Section references point to RULES.md.

A scenario that can't pass as written is a bug in this file or in RULES.md, not a reason to change the test quietly. Record it in `QUESTIONS.md` (see CLAUDE.md).

## Setup and scheduling

**T01 · Seeded first session (§17).** Given a first launch with setup answers of squat `rir3to4`, press `rir1to2`, deadlift `light`, and chins with 2+ to spare. Then the log holds a 2026-11-02 Workout A: squat 3×5 at 95, press 3×5 at 65, deadlift 1×5 at 145, chins 3×5 at 160 assistance. The screening note was acknowledged at setup. The next lifting session is Wednesday 2026-11-04, Workout B.

**T02 · Alternation (§1).** Given 11-02 A. When sessions are completed on 11-04, 11-06, 11-09, 11-11, and 11-13. Then they are B, A, B, A, B.

**T03 · A missed session keeps the alternation (§1, §11).** Given 11-02 A and 11-04 B, and nothing on 11-06. Then Monday 11-09 is Workout A, `daysAway` is 5, and every lift progresses normally.

**T04 · Swap today (§1).** Given 11-06 A completed and 11-09 skipped. When Tuesday 11-10 is swapped to lifting. Then it is Workout B with normal progression (`daysAway` 4), Tuesday's conditioning is dropped rather than moved, and starting a lifting session on Wednesday 11-11 shows the two-days-in-a-row confirmation.

**T05 · Weekly caps (§1).** Given 3 lifting sessions completed in a calendar week. Then no lifting session is offered for the rest of that week, including by swap. Given 2 conditioning sessions completed, no more conditioning is offered that week. Saturday and Sunday show "Off," unless "No time today" moved a session to the weekend (T97, T104).

**T06 · Workout B's third slot (§2).** Then B on 11-04 (program week 1) and 11-13 (week 2) has the deadlift. B on 11-18 (week 3) has the row, the default `pullChoice`, starting with row calibration. With `pullChoice` set to power clean, 11-18 starts power-clean calibration instead.

## Barbell progression

**T07 · Wednesday, November 4 (§4).** Given the seeded session and no short night. When Monday's squat and deadlift ratings take each value. Then:

| Monday's rating | Squat on 11-04 | Deadlift on 11-04 |
| --- | --- | --- |
| `light` | 115 | 175 |
| `rir3to4` | 105 | 160 |
| `rir1to2` | 100 | 155 |
| `grind` | 97.5 | 150 |

**T08 · Friday's press (§4).** Given Monday's press at 65. Then Friday 11-06's press is 75 (`light`), 70 (`rir3to4`), 67.5 (`rir1to2`), or 66 (`grind`).

**T09 · Cap after a miss (§4).** Given a squat with `hasMissed` true and `lcw` 200. When 3×5 at 200 is made and rated `rir3to4` or `light`. Then the next squat is 205. Rated `grind`, it is 202.5.

**T10 · First jump after a recovery (§4, §5).** Given a squat in `REPEAT` at 210. When 3×5 at 210 is made and rated `rir3to4`. Then the next squat is 212.5 (the smallest jump), and the stage is `NORMAL`.

**T11 · Rows (§4).** Given a row with `lcw` 135 that has never been rated `notCrisp`. When it is made `crisp`, the next row is 140. When 140 is made `notCrisp`, the next is 142.5, and every later jump is 2.5, even when rated `crisp`.

**T12 · Choosing a smaller jump (§4).** Given a suggested squat of 115. Then the user can choose any loadable weight from 95 to 115, and nothing above 115.

**T13 · Incomplete lift (§4).** Given a squat prescription of 3×5 at 150. When the user ends the squat after two made sets, marking the third "skipped." Then the next squat is 3×5 at 150 and the stage is unchanged. The same holds for a lift never started because time ran out.

**T14 · Logged weights rule (§3).** Given a prescription of 252.5. When the user logs 3×5 at 250, made, rated `rir1to2`. Then `lcw` is 250 and the next squat is 255.

## Plates and rounding

**T15 · Default inventory (§3).** Given a press `lcw` of 66 and a 1-lb jump. Then 67 isn't loadable, so the next press is 67.5 with the note "Your plates can't make a 1-lb jump. The next step up is 67.5." From 67.5 a 1-lb jump gives 68.5 with no note. From 68.5 it gives 70, with the note.

**T16 · Edited inventory (§3).** Given two pairs of 0.5-lb plates. Then a press at 66 with a 1-lb jump becomes 67, with no note.

**T17 · Plates per side (§3).** Then 252.5 shows 45, 45, 10, 2.5, and 1.25 per side. 232.5 shows 45, 45, 2.5, and 1.25. 67.5 shows 10 and 1.25.

**T18 · Percentage weights (§3).** Then 90% of a 260 squat is 232.5, of a 330 deadlift is 295, of a 105 press is 92.5, and of a 182.5 bench is 162.5.

## Stall ladder

Unless a scenario gives a date, assume program week 10 or later and no maintenance break within 14 days.

**T19 · First miss (§5).** Given a `NORMAL` squat. When 3×5 at 250 is missed (5, 5, 4). Then the stage is `REPEAT`, `hasMissed` is true, and the next squat is 3×5 at 250.

**T20 · Stall to bridge (§5).** Given `REPEAT` at 250. When it is missed again. Then the stage is `BRIDGE_SHORT` round 1 and the next squat is 5×3 at 250, with rests of at least 5:00.

**T21 · Bridge made (§5).** Given `BRIDGE_SHORT` round 1 at 250. When 5×3 is made, the next squat is 3×5 at 250 (`BRIDGE_NORMAL`). When that is made, the stage is `NORMAL`, `lcw` is 250, and the next squat is 252.5.

**T22 · The squat's second round, then reset (§5).** Given the squat bridge at 250, with the last miss on Wednesday 2027-02-03 (program week 14, next break 26 days away). When 5×3 is made, 3×5 missed, 5×3 made, and 3×5 missed. Then the squat resets: `lcw` 225, next 3×5 at 225, `lastResetFrom` 250, `resetCount` 1, stage `NORMAL`.

**T23 · Missed short sets reset at once (§5).** Given `BRIDGE_SHORT` round 1 at 250 on the same date. When 5×3 is missed. Then the squat resets to 225.

**T24 · Graduation (§5).** Given T22's reset. When the squat climbs and then misses twice at 245. Then its stage is `GRADUATED`, the graduation message shows, the squat is prefilled with its last completed weight and sets, and the other lifts keep progressing.

**T25 · A second reset above the old stall (§5).** Given T22's reset. When the squat climbs to 260 and misses twice there. Then it enters `BRIDGE_SHORT`, because 260 is above 250. When both bridge rounds fail, it resets to 232.5 with `lastResetFrom` 260 and `resetCount` 2.

**T26 · Hold before a maintenance break (§5).** Given a squat bridge at 250 that fails on Wednesday 2027-02-17, 12 days before the break that starts Monday 2027-03-01. Then the stage is `HOLD` with `holdUntil` 2027-03-01. Friday 02-19 is 5×3 at 250, Monday 02-22 is 3×5 (missed, nothing changes), 02-24 is 5×3, and 02-26 is 3×5 (missed). Monday 03-01 is 3×5 at 250. Made, the next squat is 252.5. Missed, the squat resets to 225 with no food-lever question.

**T27 · No hold when the break is 17 days away (§5).** Given the same failure on Friday 2027-02-12. Then the squat resets to 225.

**T28 · A hold that spans a floor week (§5, §10).** Given a lift's bridge failing on Wednesday 2026-12-09 (program week 6, 12 days before the December 21 break). Then the stage is `HOLD`, and no food-lever question is asked, because the hold comes first. The Christmas floor-week sessions aren't heavy, so the retry is Monday 2026-12-28.

**T29 · Food lever (§5, §13).** Given a deadlift bridge at 285 that fails on Wednesday 2026-12-02 (program week 5, break 19 days away). Then the app asks "Has recovery felt poor?" Yes: the food lever turns on, the deadlift gets one more round (2×3 at 285, then 1×5 at 285), and every lifting-day card adds "Second Shake today (your eating plan's lever)." If that round fails, the deadlift resets to 255 with no question. On a normal schedule the round ends Friday, December 11, inside the 14 days before the December 21 break, so the deadlift holds first (§5, after the food lever's extra round) and resets when the December 28 retry fails. A later lift reaching a reset in weeks 1–8 isn't asked again. Had the answer been No, the deadlift would reset to 255 at once.

**T30 · Early-stall note (§5, §13).** When a lift enters `BRIDGE_SHORT` on 2026-11-30 (program week 5), the early-stall note shows. When one enters it on 2027-01-04 (week 10), no note shows.

**T31 · Deadlift bridge (§5).** Given a deadlift in `REPEAT` at 300. When it is missed again, the next deadlift is 2×3 at 300. When that is made, the next is 1×5 at 300. When that is missed, the deadlift resets to 270, because the deadlift gets one round.

**T32 · Power cleans skip the bridge (§5).** Given power cleans missed twice at 135. Then they reset to 120 with no short sets.

**T33 · Counting lifts on the ladder (§5, §10).** A squat in `BRIDGE_SHORT` and a press in `REPEAT` is one lift on the ladder, so no suggestion. A squat in `BRIDGE_SHORT` and a bench in `HOLD` is two, so the app suggests a light week. A reset 5 days ago counts. One 8 days ago doesn't.

**T84 · The press gets one round (§5).** Given a press in `BRIDGE_SHORT` at 105. When 5×3 is made and 3×5 is missed. Then the press resets to 92.5 with `lastResetFrom` 105.

**T91 · Power-clean hold (§5).** Given power cleans that miss twice at 135 on Wednesday 2027-02-17. Then the stage is `HOLD`, every heavy session until 2027-03-01 is 5×3 at 135, and Monday 03-01 retries 5×3 at 135.

**T92 · Power-clean food lever (§5).** Given power cleans that miss twice at 135 on 2026-12-02 and the answer Yes to "Has recovery felt poor?" Then the next power-clean session is 5×3 at 135, and a miss there resets them to 120 with no question.

## Light squat day and once-a-week deadlift

**T34 · Switching on (§6).** Given made heavy squats whose suggested jumps are 10, then 5, then 5. Then the light squat day switches on after the second 5. With 5, then 10, then 5, it isn't on yet.

**T35 · Which session is light (§6).** Given the light squat day on. In a Monday, Wednesday, Friday week with a 200 squat on Monday, Wednesday's squat is 2×5 at 160 and Friday's is heavy. In a week with Monday missed, Wednesday and Friday are both heavy, because no third session can follow Friday.

**T36 · Light-day weight (§6).** Given a most recent heavy squat of 247.5. Then the light squat is 2×5 at 197.5.

**T37 · Once-a-week deadlift (§6).** Given the once-a-week deadlift on, in program week 3 or later. In an A, B, A week, Monday's A has the heavy deadlift, Wednesday's B has `pullChoice` as usual, and Friday's A has `pullChoice` because a heavy deadlift is already done. In a B, A, B week, Wednesday's A has the deadlift. In a week whose first A is missed, the first A completed that week has the deadlift.

**T94 · The once-a-week deadlift waits for week 3 (§6).** Given two made heavy deadlifts with suggested jumps of 5 lb in program week 2. Then deadlifts stay as programmed through week 2, and the once-a-week rule applies from the first session on 2026-11-16.

## Chins and dips

**T38 · Wednesday's chins (§7).** Given Monday's 3×5 at 160 assistance. Made with room, Wednesday's chins are at 155. Made with 0 to spare, they are at 157.5. Made with 0 to spare on a machine without 2.5-lb steps, they stay at 160.

**T39 · Small steps, then a reps build (§7).** Given chins at 150. Made with room, the next is 145. Missed at 145: the step becomes 2.5 and 145 repeats. Made with room, the next is 142.5. Missed twice at 142.5: `REPS_BUILD` at 145 for 3×6. Each made session adds a rep, to 3×7 and then 3×8. After 3×8 is made, the chins return to `LOAD` at 140 for 3×5, with a 2.5-lb step.

**T40 · No small steps (§7).** Given 2.5-lb steps not possible, chins made at 150, and a miss at 145. Then 145 repeats. A second miss starts `REPS_BUILD` at 150 for 3×6.

**T41 · Negatives (§7).** At 50 lb of chin assistance on an A day, 2 negatives follow the last chin set. At 52.5, none. On a B day at 50, none. With chins and dips split, a B day at 45 gets them. At 0 assistance, none.

**T42 · Reaching zero (§7).** Given chins in `LOAD` at 2.5, made with room. Then the mode is `BODYWEIGHT`: 3 sets of as many as possible, up to 5. When he gets 4, 3, and 3, the next target is 11 total, shown as 4, 4, 3. When he gets 5, 5, and 5, the mode is `WEIGHTED` with 2.5 lb on the belt, and each later made session adds 2.5 lb.

**T43 · Dip calibration (§9).** On 11-04, dip calibration starts at the chin assistance and suggests 10 lb less each set. When the user marks the set at 120 as "5 solid, 2 or 3 to spare," dip assistance and `lastMadeAssistance` become 120, and all 3 rounds use 120.

**T44 · Effective load (§7).** At 270 lb bodyweight and 155 lb of assistance, the effective load shows 115. After a 262-lb weigh-in, it shows 107.

## Conditioning

**T45 · Phases and targets (§8).** Tuesday 11-03 is phase 1 with a 20-minute target. In conditioning week 3 (from 11-16 if every week counted), Tuesday is 30 easy, and Thursday is 30 with 6 intervals, laid out as 9 easy, 12 of intervals, and 9 easy. In week 5 (from 11-30), Tuesday is 40 easy, Thursday is 40 with 8 intervals (12, 16, 12), and lifting days offer the 10-minute spin.

**T46 · Weeks that don't count (§8).** Given both conditioning sessions done every week from 11-02 except the Christmas floor week. Then the week of 12-28 is conditioning week 8 (phase 3, target 50), and the week of 2027-01-04 is week 9 (phase 4, target 50, 8 intervals by default, up to 10).

**T47 · Missed and half weeks hold the phase (§8).** Given both sessions in the weeks of 11-02 and 11-09 and none in the weeks of 11-16 and 11-23. Then the week of 11-30 is conditioning week 3 (phase 2), not week 5, and there is no layoff drop (19 days since the last session). A week with only Tuesday's session done also doesn't count.

**T48 · Conditioning layoff (§8).** Given phase 3 and a last conditioning session 25 days ago. Then the next session is conditioning week 3 (phase 2). After more than 60 days, it is week 1.

**T49 · Screening gate (§8, §12).** The screening note is acknowledged once at setup. The first session with intervals shows it again and can't start until the user taps "I've read this." Later interval sessions don't ask.

**T50 · Light-week conditioning (§8, §10).** In a light week, Thursday is easy only at the usual target, and the week doesn't count toward conditioning weeks.

**T51 · Flat from intervals (§8).** Given 8 intervals on Thursday. When Friday's check-in "Flat from the intervals?" is answered yes, the next Thursday has 4.

**T52 · Weekly bar (§8).** Tuesday 40, Thursday 40, and two 10-minute spins show 100 of 150 minutes.

**T88 · Short sessions (§8).** A 20-minute Tuesday counts as a completed session. A 25-minute Thursday counts, has no intervals, and the interval block is hidden. A 15-minute session is logged but doesn't count.

**T95 · Intervals stay on Thursday (§8).** Given conditioning week 3 (phase 2). With Tuesday's session done and Thursday swapped to lifting, a Friday conditioning session is easy only. With Monday swapped to conditioning and Tuesday's session done, the week has no intervals. With Tuesday missed, Thursday still has its 6 intervals.

## Warm-ups and calibration

**T53 · Warm-ups (§9).** Squat 95: bar×5, bar×5, 65×3, 80×2. Squat 115: bar×5, bar×5, 60×5, 80×3, 95×2. Press 67.5: bar×5, bar×5, 55×2. Deadlift 155: 135×5. Deadlift 175: 135×5, 145×2. Squat 250: bar×5, bar×5, 100×5, 135×5, 175×3, 210×2. Deadlift 330: 135×5, 180×5, 230×3, 280×2.

**T54 · Bench calibration (§9).** On 11-04, the user does sets of 5 at 45 ("Fast"), 65 ("Fast"), 85 ("Fast"), 105 ("Starting to slow"), and 115 ("Clearly slowed," all 5 reps made). Then 115 is the work weight, that set is work set 1, and two more follow at 115. If the 115 set had missed reps, the work weight is 105, with 3 fresh work sets.

**T55 · Row calibration (§9).** The first row session (11-18 by default) runs the same calibration in sets of 5.

## Deloads, illness, and floor weeks

**T56 · Light-week loads (§10).** Given `lcw` values of squat 250, press 100, bench 180, deadlift 330, row 155, and power clean 135, with chins at 120 assistance. Then the light week has squat 2×5 at 225, press 2×5 at 90, bench 2×5 at 160, deadlift 1×5 at 295, row 2×5 at 137.5, power clean 3×3 at 120, and 2 rounds of chins at 130.

**T57 · After a light week (§10).** Given a `NORMAL` squat with `lcw` 250 and a press in `BRIDGE_NORMAL` at 105. Then the first heavy sessions back are squat 3×5 at 250 and press 3×5 at 105.

**T58 · Triggers (§10).** "Most nights under 7 hours" at two lifting sessions in a row suggests a light week. One alone doesn't. "Warm-ups felt heavy" at two in a row suggests one. So do two lifts on the ladder (T33) and a declared overloaded week. Joint pain never suggests a light week.

**T59 · Starting a light week (§10).** Chosen as "Rest of this week" on a Wednesday, Wednesday's and Friday's sessions are light and the whole week counts as a light week. Chosen as "Next week," the next Monday through Sunday is light.

**T60 · Christmas floor week (§10).** Monday 12-21 and Wednesday 12-23 are the next two workouts in A/B order, slots 1 to 3: squat 2×5 and press or bench 2×5 at `lcw`, plus slot 3 as it would run (deadlift 1×5, row 2×5, or power clean 3×3, at `lcw`). No chins, dips, or conditioning are offered that week, and Friday 12-25 has no session. The maintenance-break banner is hidden 12-21 through 12-25 and shows 12-28 through 2027-01-03. On Monday 12-28, `daysAway` is 5, and `NORMAL` lifts repeat `lcw` with no jump.

**T61 · Holy Week (§10).** 2027-03-22 through 03-26 is preloaded as a floor week, and the user can remove it.

**T62 · Declaring a floor week midweek (§10).** Given Monday's session done. When the user declares a floor week on Wednesday, Wednesday's session is a floor session and Friday has no lifting session.

**T85 · Illness with a fever (§10).** Given a last lifting session on Monday 2027-01-11 and illness declared on Tuesday 01-12 with the symptom question answered yes. Then no sessions are offered and the rest message shows until "I'm better" is tapped. When it is tapped on Monday 01-18 (`daysAway` 7), that week becomes a light week: lifts at 2 work sets of 90% of `lcw` and conditioning easy with no intervals. The week after, `NORMAL` lifts repeat `lcw` with no jump. The sick days add nothing to any count.

**T86 · Mild illness (§10).** Given illness declared on a Wednesday with that question answered no. Then Wednesday's and Friday's sessions are light-week sessions, and Thursday's conditioning is easy only.

**T93 · A floor week inside a maintenance break (§10, §13).** On 2026-12-21 the floor-week card shows, the maintenance banner is hidden, and the card adds "Eat on the maintenance pattern this week: three Mains a day."

## Missed training

**T63 · The table (§11).** Given `lcw` values of squat 250, press 100, and deadlift 330.

| Gap | `daysAway` | First session back |
| --- | --- | --- |
| Mon to Fri (Wednesday missed) | 4 | Normal progression |
| Fri to Wed (Monday missed) | 5 | Normal progression |
| Fri to Fri (two missed) | 7 | `NORMAL` lifts at `lcw`, ladder lifts at their pending prescription |
| Fri 2027-01-08 to Mon 2027-01-18 | 10 | Under 40: squat 237.5, press 95, deadlift 310. 40 and over: 225, 90, 295 |
| 30 days | 30 | Squat at 225, with warm-ups ending at 190×2. If that warm-up felt heavy, the work sets are at 200, and `lcw` becomes 200 |
| 75 days | 75 | Squat 150, press 60, deadlift 195. `hasMissed`, `resetCount`, and `lastResetFrom` cleared, graduated lifts back to `NORMAL`, light squat day and once-a-week deadlift off |

**T64 · Lifts not in the return session (§11).** Given 10 days away, under 40, a return session of Workout A, and a bench `lcw` of 180. Then the bench drops to 170 at that return, and the next B two days later uses 170 with no second drop.

**T65 · Age bracket unset (§11).** With no age bracket set, the 8-to-21-day drop is 10%.

**T66 · Chins after a layoff (§11).** Given chins at 120. After 10 days away they are at 130, after 30 days at 140, and after 75 days both chins and dips recalibrate.

**T96 · Chins recalibrate from 30 lb more (§11).** Given chins at 120 assistance. After 75 days away, chin recalibration starts at 150, and dip calibration starts there too. With chins weighted at 5 lb on the belt, it starts at 25.

## Pain and safety

**T67 · Pain stop and return (§12).** When the user taps "Pain stop" on the press after set 1, the press is paused, the session continues, and that session doesn't count for the press. At the next session with the press, the app asks "Is the press pain gone?" Yes: with `lcw` 100, the press runs 3×5 at 90 that day, which moves nothing, and the session after that resumes the prescription it had. No: the press stays paused and "See a doctor or physical therapist before loading it again" shows, with a "Cleared by a clinician" button. No light week is suggested either way.

**T68 · Joint pain at check-in (§10, §12).** Answering yes to "Any joint pain right now?" and choosing the squat pauses the squat before the session starts.

**T69 · Stop session (§12).** Tapping "Stop session" ends it, nothing from it counts, and the message shows: "Stop now. Chest pain that doesn't ease within a few minutes of stopping is a 911 call. Get checked before training again."

**T70 · Paused for two weeks (§11, §12).** Given the press paused from 2027-01-04 until it returns on 2027-01-18. Then the 8-to-21-day drop applies to the press alone, before its 90% return session.

**T71 · Soreness note (§12).** It shows in program weeks 1 and 2 only.

**T87 · Short night (§4, §8).** Given Monday's squat rated `light` and "Last night under 6 hours?" answered yes on Wednesday 11-04. Then Wednesday's squat is 105 instead of 115, and the deadlift is 160 instead of 175. On a Thursday with the same answer, the session is easy only.

**T89 · Equipment down (§2, §8).** Choosing "Assist machine down" replaces the block with lat pulldowns 3×8 and incline push-ups for 3 sets, and the chin and dip settings are the same next session. "SkiErg unavailable" moves the intervals to the air bike for that session. "Air bike unavailable" turns the easy minutes into an incline treadmill walk.

## Nutrition prompts

**T72 · Day prompts (§13).** A lifting day shows "Shake after lifting." After a logged conditioning session in phase 1 or 2, "Add a second Shake today" shows. In phase 3 or 4 it is "Add a second Breakfast today." A conditioning day with no session logged shows no food prompt.

**T73 · Food lever on (§13).** Lifting-day cards add the lever line. Conditioning days don't add another extra.

**T74 · Maintenance-break banner (§10, §13).** It shows from 2027-03-01 through 03-14 and not on 03-15.

**T75 · No compensation (§13).** No prompt, suggestion, or session offer ever ties exercise to food eaten.

## Time and rest

**T76 · Rest defaults (§14).** A squat last rated `rir1to2` gets 3:30. A lift with no rating history gets 2:00. Bridge short sets get at least 5:00, even after a `light` rating. The chin-and-dip block gets 1:15.

**T77 · Timer accuracy (§14).** Start a 3:30 rest, background the app for 2 minutes, and return. The timer shows 1:30 left.

**T78 · Time projection (§14).** A session projected at 84 minutes shows cut step 1. If the projection is still over 80, it shows step 2, then step 3 (chins between press or bench sets, dips after the last one). No step ever shortens a squat or deadlift rest.

## Replay and data

**T79 · Editing history replays (§0).** Given 11-04's squat logged at 105, made, rated `rir3to4`, and 11-06 not yet logged, so 11-06's squat is 115. When 11-04's rating is edited to `rir1to2`, 11-06's squat becomes 110.

**T80 · Deleting a session replays (§0).** Deleting 11-04's session makes the next lifting session Workout B again, with prescriptions built from 11-02.

**T81 · Export and import (SPEC).** Export, clear all data, and import. The event log, state, and today's plan are identical.

**T82 · Daylight saving (§0).** Program week on 2027-03-15, the day after clocks change, is 20. From Friday 2027-03-12 to Monday 2027-03-15, `daysAway` is 3.

**T83 · Changing `pullChoice` (§17).** Switching from row to power clean starts power-clean calibration at its next appearance. Switching back restores the row's saved state.

**T97 · No time on Wednesday (§1).** Given 11-02 A and Tuesday's conditioning done. When Wednesday 11-04 is skipped with "No time today." Then Wednesday shows skipped, Thursday 11-05 is lifting, Workout B, with the prescription Wednesday had, Friday 11-06 is conditioning, Saturday 11-07 is lifting, Workout A, and Sunday 11-08 is off.

**T98 · No time on Friday (§1).** Given 11-02 A, 11-04 B, and both conditioning sessions done. When Friday 11-06 is skipped. Then Saturday 11-07 is lifting, Workout A, and Monday 11-09 is lifting as usual.

**T99 · No time for conditioning (§1).** Given 11-02 A. When Tuesday 11-03's conditioning is skipped. Then Tuesday shows skipped, Wednesday 11-04 is still lifting, Thursday 11-05 is still conditioning, and Saturday 11-07 stays off.

**T100 · Two moves fill the weekend (§1).** Given 11-02 A and Tuesday's conditioning done. When Wednesday 11-04 is skipped, and then Thursday 11-05, now lifting, is skipped too. Then Friday 11-06 is lifting, Saturday 11-07 is conditioning, and Sunday 11-08 is lifting.

**T104 · Saturday or Sunday (§1).** Given 11-02 A, 11-04 B, both conditioning sessions done, and Friday 11-06 skipped, so Saturday 11-07 is lifting. When Saturday is skipped too. Then Sunday 11-08 is lifting, Workout A, and once he lifts Sunday, Monday 11-09 asks before a second lifting day in a row. When Sunday is skipped as well, the session drops, and Monday is lifting, Workout A, with no question.

**T101 · Time after all (§1).** Given Wednesday 11-04 skipped. When a lifting session is logged on Wednesday anyway. Then Wednesday is done, Thursday 11-05 is conditioning, and Saturday 11-07 is off.

**T102 · Light squat day after a move (§6).** Given the light squat day on and a 200 squat on Monday 11-09. When Wednesday 11-11 is skipped. Then Thursday 11-12's squat is 2×5 at 160, because Saturday 11-14 can still follow, and Saturday's squat is heavy. With Wednesday simply missed and Thursday swapped to lifting, Thursday's squat is heavy.

**T103 · Intervals stay Thursday's after a move (§8).** Given conditioning week 3 (phase 2) and Tuesday's conditioning done. When Wednesday's lifting is skipped. Then Thursday is lifting, Friday's conditioning is easy only, and the week has no intervals.

**T90 · Calendar notes (§1).** The Week screen shows the notes for 2026-11-26, 2027-01-01, and 2027-02-10, and none of them changes a prescription.
