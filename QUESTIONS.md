# Questions

Open questions from building the engine (CLAUDE.md, ground rule 1). Each one names the RULES.md section, the problem, and the reading the engine uses now. Every reading sits behind a named constant in `src/engine/readings.ts`, so changing an answer is a one-line change plus a test.

To answer, reply in chat ("Q2: keep it") or add an **Answer** line under the question. The four that matter most for training are Q1, Q2, Q6, and Q15.

## Open

### Q1. A failed food-lever round inside the hold window (§5, T29)

**Problem.** T29 says that if the deadlift's extra round fails, "the deadlift resets to 255 with no question." But `beforeReset` checks the maintenance-break hold first. On a normal schedule, that round's last session falls on Friday, December 11, ten days before the December 21 break, so RULES as written gives a hold, not an immediate reset.

**Reading.** Keep RULES' order: the hold comes first. The deadlift holds through Christmas week, retries 1×5 at 285 on Monday, December 28, and resets to 255 with no question if that fails. T29's test follows this path, and its end state matches T29's.

**Constant.** `HOLD_CHECK_AFTER_FOOD_LEVER_ROUND = true`. Set it to `false` to reset at once instead.

### Q2. Which sessions count toward the light squat day (§6)

**Problem.** "Misses and repeats don't change the count," but "repeats" isn't defined. A made session in the REPEAT stage, on bridge normal sets, or at a hold retry gets the smallest jump by rule, not by effort.

**Reading.** Only a made heavy session that took a progression step (stage NORMAL, weight above `lcw`) changes the count. Sessions that repeat a weight leave it alone: the REPEAT stage, bridge normal sets, hold retries, layoff and after-light-week repeats, and a repeat he chooses. After a reset, the first session back at the reset weight doesn't count, and the next two do. The same count drives the once-a-week deadlift.

**Constant.** `LIGHT_DAY_COUNT_ONLY_PROGRESSION_STEPS = true`. With `false`, any made heavy session with a suggested jump of 5 lb or less counts.

### Q3. Rest defaults for power cleans and rows (§14)

**Problem.** Their ratings (crisp, not crisp) aren't in `restDefaultsSec`.

**Reading.** Crisp 2:30 (like 3–4 left), not crisp 3:30 (like 1–2 left), missed 5:00, no history 2:00. PROTOCOL's "at least 5 minutes between sets of 3" reads as the bridge rule, so it isn't applied to power cleans' 5×3. Tell me if it should be.

**Constants.** `REST_CRISP_SEC = 150`, `REST_NOT_CRISP_SEC = 210`.

### Q4. Work sets logged at different weights (§3)

**Problem.** If he logs set 1 at 250 and sets 2 and 3 at 245, which is W?

**Reading.** The lowest attempted weight. The session screen will keep one work weight per lift, so this should be rare.

**Constant.** `MIXED_WORK_WEIGHTS_USE_LOWEST = true`.

### Q5. Short sessions and the weekly bar (§8)

**Problem.** A 15-minute session "is logged but doesn't count" as a completed session. Do its minutes show on the 150-minute bar?

**Reading.** Yes. They're real minutes; they just don't complete a session.

**Constant.** `SHORT_SESSIONS_COUNT_TOWARD_WEEKLY_BAR = true`.

### Q6. Does a calibration day progress? (§9)

**Problem.** After bench calibration finds 115 and two more work sets follow, is that session rated, so Friday's bench is 115 plus a jump? And after dips calibrate at 120, do the day's three rounds follow the normal rules, so "made with room" means 115 next time?

**Reading.** Yes to both. The calibration day is the lift's first heavy session.

**Constant.** `CALIBRATION_DAY_PROGRESSES = true`. With `false`, the next session repeats the calibrated weight.

### Q7. Floor-week weekends (§10)

**Problem.** Christmas week is listed as December 21 to 25. Is Saturday and Sunday part of the floor week?

**Reading.** A floor week is its whole calendar week, so the maintenance-break banner stays hidden through Sunday, December 27, and shows from Monday, December 28. T60 checks only the listed days, so it passes either way.

**Constant.** `FLOOR_WEEK_IS_CALENDAR_WEEK = true`.

### Q8. Which conditioning session gets the intervals when days move (§8)

**Problem.** The phase table puts intervals on Thursday. If he swaps days, which session has them?

**Reading.** Thursday's session, or else the week's second session as long as no interval session has run that week. Never more than one a week.

**Constant.** `INTERVALS_ON_THURSDAY_OR_SECOND_SESSION = true`.

### Q9. Two lifts reach the food-lever question in one session (§5)

**Reading.** One answer covers both. Yes gives each lift its extra round, and No resets each.

**Constant.** `FOOD_LEVER_ANSWER_APPLIES_TO_ALL_PENDING = true`.

### Q10. The food-lever question goes unanswered (§5)

**Reading.** If he reaches that lift's next session without answering, the app treats it as No and resets. The question appears in the post-session summary, so this should be rare.

**Constant.** `UNANSWERED_FOOD_LEVER_IS_NO = true`.

### Q11. A made lift with no effort rating (§4)

**Problem.** The session screen will require a rating, but an edited or imported session could lack one.

**Reading.** Take the smallest table row ("When in doubt, take the smaller jump"). Cleans and rows take the 2.5-lb jump without being marked "not crisp."

**Constant.** `MISSING_RATING_IS_GRIND = true`.

### Q12. An assist machine without 5-lb steps (§7)

**Problem.** RULES covers machines without 2.5-lb steps but not without 5-lb steps.

**Reading.** "Made with room" takes off the stack step (10 lb) instead. Your defaults have both steps available, so this matters only if the machine changes.

**Constant.** `NO_FIVE_LB_STEPS_USE_STACK_STEP = true`.

### Q13. Where chin recalibration starts after more than 60 days (§11)

**Problem.** Dips calibrate from the current chin assistance. Chins have no stated starting point.

**Reading.** 20 lb more than the old setting, after coming off the belt.

**Constant.** `CHIN_RECALIBRATION_EXTRA_LB = 20`.

### Q14. A graduated lift and an 8-to-60-day layoff (§11 and §17)

**Problem.** §11 says every lift's stage returns to NORMAL from 8 days on. §17 says a graduated lift stays graduated unless he restarts it or a layoff passes 60 days.

**Reading.** §17 wins. The lift stays graduated, and its prefill drops by the layoff percentage.

**Constant.** `GRADUATED_SURVIVES_SHORT_LAYOFF = true`.

### Q15. A paused lift's last heavy session (§0, §11, §12; T67 and T70)

**Problem.** A lift back from pain after more than 7 days takes the §11 drop, counted from its last heavy session. Does the session where pain stopped it count?

**Reading.** Yes. It ran its normal prescription, which is §0's definition of heavy, even though it moves nothing. So a press stopped on a Wednesday and back the next Monday returns at 90% with no drop (T67). A press paused at the check-in, before any sets, counts from its previous session (T70).

**Constant.** `PAIN_STOP_COUNTS_AS_LAST_HEAVY = true`.

### Q16. Does a fresh novice run clear "not crisp"? (§11)

**Problem.** After more than 60 days, RULES clears `hasMissed`, `resetCount`, and `lastResetFrom`, but doesn't mention `hasBeenNotCrisp`.

**Reading.** Clear it too, so cleans and rows start again at 5-lb jumps.

**Constant.** `FRESH_RUN_CLEARS_NOT_CRISP = true`.

### Q17. The restart weight for a graduated lift (§3 and §17)

**Problem.** §3 lists restarts among percentage weights but gives no percentage.

**Reading.** The Lifts screen (M4) suggests 90% of the last completed weight, as a reset would, and he can edit it.

**Constant.** `RESTART_SUGGESTED_FRACTION = 0.9`.

### Q18. Time-projection estimates (§14)

**Problem.** The 80-minute guard needs set durations RULES doesn't give.

**Reading.** 5:00 for the bike warm-up, 1:15 per warm-up set (loading included), 0:45 per work set plus its rest, 2:00 to change lifts, 0:40 per chin or dip set plus 1:15 rests, and 10:00 for the spin. These decide only when the cut steps appear and whether the spin is offered. Once there are a few weeks of real session times, I can tune them.

**Constants.** `BIKE_WARMUP_SEC`, `WARMUP_SET_SEC`, `WORK_SET_SEC`, `LIFT_CHANGE_SEC`, `ASSIST_SET_SEC`, `SPIN_SEC`, and `CHINS_BETWEEN_PRESS_MIN_REST_SEC`.

## Answered

None yet.
