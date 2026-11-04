# Progression engine rules

This file is the source of truth for every decision the app makes. It turns the Retraining Protocol (`PROTOCOL.md`) into deterministic rules. Constants live in `program.json`. Where PROTOCOL.md leaves a gap that software has to fill, this file decides, and each such decision is marked **[app rule]**. PROTOCOL.md and this file must never contradict each other. If they seem to, stop and ask (CLAUDE.md explains how).

The engine is a pure function. Given the program constants, the settings, and the full event log, it returns the plan for any date and the state of every lift. All state comes from replaying the log in date order, so editing or deleting a past entry replays everything after it.

## 0. Definitions

- **Dates.** Every date is a local calendar date (`YYYY-MM-DD`) in the user's time zone. Day differences are counted in calendar days, never in 24-hour blocks, so daylight saving changes can't shift anything.
- **Calendar week.** Monday through Sunday.
- **Program week.** `floor(daysBetween(startDate, date) / 7) + 1`, with `startDate = 2026-11-02`. It decides what goes in Workout B's third slot, whether the once-a-week deadlift may start, and whether a stall counts as early.
- **Lifting session.** A logged Workout A or B, including light-week and floor-week versions.
- **Heavy session (for a lift).** A lifting session in which that lift ran its normal prescription. Light-week sessions, floor-week sessions, the light squat day, and a lift's 90% return session after pain (section 12) are not heavy. Only heavy sessions move progression or the stall ladder.
- **Work sets.** The prescribed sets at the work weight, after warm-ups.
- **Made.** Every prescribed rep of every work set was completed to full depth or lockout without help. The user can mark any rep "form broke," which makes it a missed rep.
- **Missed.** Any attempted work set came up short, or any rep was marked "form broke." Finishing the reps in broken sets still counts as a miss.
- **Effort rating.** Recorded once per lift per session, for the last work set, judged by its slowest rep: `light` (5 or more reps left), `rir3to4`, `rir1to2`, `grind` (0 left), or `missed`. Power cleans and rows record `crisp` or `notCrisp` (a slow rep) instead.
- **Per-lift state.** `lcw` (the base the next prescription builds on, normally the last weight made), `next` (the next prescribed weight and set scheme), `stage` (section 5), `round`, `hasMissed`, `hasBeenNotCrisp` (power cleans and rows), `resetCount`, `lastResetFrom` (the weight that stalled before the most recent reset, which PROTOCOL.md calls the weight that forced the reset), and `pain` (none, paused, or returning).

## 1. Scheduling

- **Default week.** Lifting Monday, Wednesday, and Friday. Conditioning Tuesday and Thursday. Saturday and Sunday are off, and no sessions are offered, except a session that "No time today" moves to the weekend (below).
- **Swap today.** On any weekday the user can do the other kind of session instead. This is how a missed lifting day moves to the next weekday, and the conditioning it displaces is dropped, not moved.
- **Alternation.** The next workout is the opposite of the most recent completed lifting session. The first completed session was A on 2026-11-02. Light-week and floor-week sessions count. Alternation follows completed sessions, not the calendar, so a missed or moved day never breaks it.
- **Rest day.** Lifting the day after a lifting session needs a confirmation: "Lifting two days in a row cuts recovery. Lift anyway?" **[app rule]**
- **Caps.** At most 3 lifting sessions and 2 conditioning sessions in a calendar week (floor weeks: 2 lifting, 0 conditioning). The app never offers more and never suggests a session to make up for missed training or for food.
- **Missed sessions** are skipped, not owed. The next lifting session gets the prescription the missed one would have had. Section 11 covers longer gaps.
- **No time today [app rule].** On the day of a planned session, he can tap "No time today." A skipped lifting session moves to the next day, and the rest of that week's sessions move with it, a day each. Saturday and Sunday take sessions only this way: a session moved to Saturday can move on to Sunday the same way, and one pushed past Sunday drops, as a missed one does. A skipped conditioning session drops and moves nothing. Caps, alternation, and the rest-day confirmation work as usual. A session logged on the skipped day cancels the skip, and a day that simply passes moves nothing.
- **Calendar notes.** `program.json → calendarNotes` (Thanksgiving, New Year's Day, Ash Wednesday) show on the Week screen as heads-ups. They change nothing by themselves.

## 2. What goes in a lifting session

| Slot | Workout A | Workout B |
| --- | --- | --- |
| 1 | Squat 3×5 | Squat 3×5 |
| 2 | Press 3×5 | Bench press 3×5 |
| 3 | Deadlift 1×5 | Program weeks 1–2: deadlift 1×5. Week 3 on: `pullChoice` (row 3×5 by default, or power clean 5×3) |
| 4 | Chin-and-dip block | Chin-and-dip block |

- **Light squat day** (section 6) changes slot 1 on some sessions once it is on.
- **Once-a-week deadlift** (section 6) changes slot 3 on some Workout A sessions once it is on.
- **Chin-and-dip block.** 3 rounds of one chin set and one dip set, about 75 seconds between sets. If "split chins and dips" is on in Settings, chins run only on B days and dips only on A days, still 3 sets each.
- **Before lifting:** 5 easy minutes on the air bike as a warm-up, shown as a checklist item and never counted as conditioning.
- **After lifting:** in conditioning phases 3 and 4, an optional 10-minute easy spin, offered only if the session will still end inside 80 minutes.
- **Paused lifts** (section 12) are left out, with a note.
- **First appearances.** Bench, dips, rows, and power cleans start with calibration (section 9) the first time they appear.
- **Equipment down** (a session menu): "Assist machine down" replaces the block with lat pulldowns 3×8 and incline push-ups for 3 sets, each with 2 reps to spare, logged as substitutions that change no assistance settings.

## 3. Loads, plates, and rounding

- **Plate inventory** (Settings): bar weight, plus a number of pairs for each plate size. Default: a 45-lb bar, unlimited pairs of 45-, 25-, 10-, 5-, and 2.5-lb plates, one pair of 1.25-lb plates, and one pair of 0.5-lb plates.
- **Loadable.** A weight is loadable when `(weight − bar) / 2` can be made from the inventory, using each plate size no more times per side than the pairs owned.
- **Plates shown** for every set, per side, largest first.
- **Progression weights** (section 4): the largest loadable weight at or below `lcw + jump`. If that is not above `lcw`, use the smallest loadable weight above `lcw` and show "Your plates can't make a <jump>-lb jump. The next step up is <weight>." **[app rule]**
- **Percentage weights** (resets, the light squat day, light weeks, pain returns, layoff drops, and restarts): multiply, round down to the nearest 2.5 lb (5 lb for the deadlift), then take the largest loadable weight at or below that. Written `percentWeight(base, fraction)` below.
- **Warm-up weights:** round down to the nearest 5 lb (section 9).
- **Logged weights rule.** Results always use the weight actually lifted. If the user lifts something other than the prescription, the logged weight is `W` for every rule below.
- **Mixed work weights [app rule].** If the work sets were logged at different weights, `W` is the lowest weight among the attempted sets.
- **Assist machine** (Settings): whether 5-lb steps are possible (a 5-lb stack, or a half-step magnet on a 10-lb stack) and whether 2.5-lb steps are possible (an add-on weight). Section 7 covers what happens when a step isn't possible.

## 4. Barbell progression

After a made heavy session at `W`:

```
lcw = W
if this session completed a ladder step (REPEAT, BRIDGE_NORMAL, or a HOLD retry):
    jump = smallestJumpLb[lift]
else if lift in (squat, press, bench, deadlift):
    jump = jumpTableLb[lift][effortRating]
    if lift.hasMissed: jump = min(jump, maxJumpAfterAnyMissLb[lift])
else:                                    // power clean or row
    if effortRating == notCrisp: lift.hasBeenNotCrisp = true
    jump = (lift.hasMissed or lift.hasBeenNotCrisp) ? 2.5 : 5
next = progressionWeight(lcw, jump), same set scheme
```

- **Short night.** If today's check-in says last night was under 6 hours, every `NORMAL` lift whose prescription came from a table jump uses the next smaller row instead (light to 3–4 left, 3–4 left to 1–2 left, 1–2 left to grind, grind stays). For power cleans and rows, 5 becomes 2.5. Lifts on the ladder are unchanged.
- The user may pick a smaller jump than the suggestion, down to the smallest jump or a repeat, but never a larger one. PROTOCOL.md: "When in doubt, take the smaller jump."
- **Cap after a miss.** A lift that has missed reps once stays on its 1–2-left increments for the rest of the novice run, and the first jump after any recovery from a miss is the smallest jump. PROTOCOL.md states both.
- **Incomplete lifts.** A lift stopped for pain (section 12), cut short because he had to leave, or not reached because time ran out is not a miss. It neither progresses nor moves on the ladder, and `next` repeats.
- **No effort rating [app rule].** A made lift with no rating, which can only come from an edit or an import, takes the smallest table row (`grind`). Power cleans and rows take the 2.5-lb jump without setting `hasBeenNotCrisp`.

## 5. Stall ladder

Each barbell lift has its own ladder. Stages: `NORMAL`, `REPEAT`, `BRIDGE_SHORT`, `BRIDGE_NORMAL`, `HOLD`, and `GRADUATED`.

| Lift | Normal sets | Bridge short sets | Bridge rounds |
| --- | --- | --- | --- |
| Squat | 3×5 | 5×3 | 2 |
| Press, bench, row | 3×5 | 5×3 | 1 |
| Deadlift | 1×5 | 2×3 | 1 |
| Power clean | 5×3 | none | 0 |

Short sets get at least 5 minutes of rest between sets (section 14).

```
On the result of a heavy session for a lift at weight W:

NORMAL
  made    -> section 4
  missed  -> hasMissed = true, stage = REPEAT, next = normal sets at W

REPEAT                                   // missed once at W
  made    -> section 4 (ladder step), stage = NORMAL
  missed  -> a stall at W:
               if resetCount >= 1 and W <= lastResetFrom: stage = GRADUATED
               else if bridgeRounds[lift] == 0: beforeReset(W)
               else: stage = BRIDGE_SHORT, round = 1, next = short sets at W
                     if program week <= 8: show the early-stall note (section 13)

BRIDGE_SHORT (round r)
  made    -> stage = BRIDGE_NORMAL (round r), next = normal sets at W
  missed  -> beforeReset(W)

BRIDGE_NORMAL (round r)
  made    -> section 4 (ladder step), stage = NORMAL
  missed  -> if r < bridgeRounds[lift]: stage = BRIDGE_SHORT, round = r + 1, next = short sets at W
             else: beforeReset(W)

beforeReset(W), checked in this order:
  1. Maintenance-break hold. If the next maintenance break starts within 14 days after today,
     and today is not inside a break: stage = HOLD, holdUntil = that break's start date,
     next = short sets at W (normal sets for power cleans).
  2. Food lever. If program week <= 8 and the food lever is not yet on, ask
     "Has recovery felt poor?"
       Yes -> foodLever = on (from today). The lift gets one more round with the extra food:
              stage = BRIDGE_SHORT, round = bridgeRounds[lift], next = short sets at W
              (power cleans: stage = REPEAT, next = normal sets at W, and a miss resets).
       No  -> go to 3.
  3. Reset: lastResetFrom = W, resetCount += 1, lcw = percentWeight(W, 0.90),
     next = normal sets at lcw, stage = NORMAL.

HOLD
  Before holdUntil, heavy sessions alternate short sets and normal sets at W
  (power cleans repeat normal sets).
  Made normal sets at any point -> section 4 (ladder step), stage = NORMAL.
  Misses before holdUntil change nothing.
  The first heavy session on or after holdUntil is normal sets at W:
    made   -> section 4 (ladder step), stage = NORMAL
    missed -> step 3 (reset), with no second hold and no food-lever question

GRADUATED
  The lift stops auto-progressing. Show: "The novice run is over for the <lift>. Hold it at its
  last completed weight and sets until you pick its next program, such as Starting Strength's
  Texas Method or a Barbell Medicine template." The lift stays in its workout, prefilled with
  its last completed weight and sets, and the user logs what was done. The other lifts carry on.
```

- The food lever is global. Once on, it stays on for the novice run and is never asked again. A power clean's food-lever repeat counts its next miss as the stall, so it goes straight to the reset.
- **After the food lever's extra round [app rule].** If the extra round fails, `beforeReset` runs again from step 1, so a maintenance break within 14 days still holds the lift before any reset. Only the food-lever question is skipped. Power cleans still go straight to the reset, as above.
- **One answer [app rule].** One answer to "Has recovery felt poor?" covers every lift waiting on it. The session screen asks an open question when the next session starts. If the next lifting session is logged while the question is still open, the answer counts as No.
- "On the ladder," for the deload trigger in section 10, means a stage of `BRIDGE_SHORT`, `BRIDGE_NORMAL`, or `HOLD`, or a reset in the last 7 days. A single miss (`REPEAT`) doesn't count.
- Light weeks, floor weeks, light squat days, and pain-return sessions never move the ladder, and a light or floor week pauses a bridge round where it stands.

## 6. Light squat day and once-a-week deadlift

- **Switching on.** Each switches on for good (until that lift graduates or restarts after a long layoff) the second time in a row that a made heavy session of that lift gets a suggested jump of 5 lb or less. A made heavy session with a bigger suggested jump starts the count over. Misses and repeats don't change the count.
- **Repeats [app rule].** A repeat is any session that ran a weight the lift had already reached: the REPEAT stage, bridge normal sets, a hold retry, a layoff or after-light-week repeat, or a repeat he chose. Only made heavy sessions that took a progression step (stage `NORMAL` and a weight above `lcw`) change the count.
- **Light squat day.** Once on, the squat is light in the second lifting session of a calendar week whenever a third lifting session can still follow it that week (a day at least two days later: Friday at the latest, or Sunday once "No time today" has moved that week's sessions **[app rule]**). In a normal week that is Wednesday. The light squat is 2×5 at `percentWeight(most recent heavy squat weight, 0.80)`, with no effort rating, no progression, and no ladder effect.
- **Once-a-week deadlift.** It can't switch on before program week 3. If its count reaches two earlier, it switches on at the start of week 3. Once on, a Workout A runs the heavy deadlift only if no heavy deadlift has been done yet that calendar week. Otherwise slot 3 runs `pullChoice`. Workout B keeps its usual slot 3.
- Neither applies in light weeks, which have their own loads (section 10).

## 7. Chins and dips

Each movement keeps: `assistance` (lb), `step` (5 or 2.5), `mode` (`LOAD`, `REPS_BUILD`, `BODYWEIGHT`, or `WEIGHTED`), `targetReps`, `missStreak`, `lastMadeAssistance`, `addedLoad`, and `lastTotalReps`.

The user records reps for each set and, after the last set, the reps to spare (0, 1, or 2+). A session is **made** when every prescribed rep was done, and **made with room** when it was made with 1 or more to spare.

```
LOAD (3 sets of 5 at assistance A)
  made with room -> lastMadeAssistance = A, A = max(0, A - step), missStreak = 0
  made, 0 spare  -> lastMadeAssistance = A, missStreak = 0
                    A = A - 2.5 if 2.5-lb steps are possible, else repeat A
  missed         -> missStreak += 1
                    if step == 5 and 2.5-lb steps are possible: step = 2.5, repeat A
                    else if missStreak >= 2: mode = REPS_BUILD, A = lastMadeAssistance, targetReps = 6
                    else: repeat A
  whenever A reaches 0: mode = BODYWEIGHT

REPS_BUILD (3 sets of targetReps at A)
  made     -> targetReps += 1
              if targetReps > 8: A = max(0, A - 5), targetReps = 5, missStreak = 0,
                                 mode = (A == 0 ? BODYWEIGHT : LOAD)
  missed   -> repeat

BODYWEIGHT (3 sets of as many reps as possible, up to 5 each)
  all 3 sets of 5 done -> mode = WEIGHTED, addedLoad = 2.5
  otherwise            -> lastTotalReps = reps done, next target = lastTotalReps + 1 total,
                          spread as evenly as possible with the larger sets first (11 shows as 4, 4, 3)

WEIGHTED (3 sets of 5 with a belt)
  made     -> addedLoad += 2.5
  missed   -> repeat
```

- Once `step` drops to 2.5, it stays there. **[app rule]**
- Without 5-lb steps, made with room takes off the machine's stack step (`program.json → equipment.assistMachine.stackStepLb`) instead of 5. **[app rule]**
- **Slow lowering.** Every rep is lowered over about 3 seconds, shown as a cue.
- **Negatives.** Chins only, in heavy sessions, while chin assistance is 50 lb or less and above 0: 2 bodyweight negatives of 3 to 5 seconds after the last chin set, on A days (or on every chin day when chins and dips are split).
- **Effective load** on every set: the latest bodyweight minus assistance, or plus `addedLoad`.
- **Dip depth cue.** Through program week 4: "Lower until your upper arms are parallel to the floor, and no deeper." After that: "You may go until your shoulders are just below your elbows. Stop before your shoulders roll forward."
- **Light week:** 2 rounds at 10 lb more assistance (in `BODYWEIGHT` or `WEIGHTED`, 10 lb of help taken off the belt first, then added as assistance), no progression. **Floor week:** no chins or dips. After either, resume the settings from before.
- Missed training: section 11.

## 8. Conditioning

- **Counting weeks [app rule].** `conditioningWeek` = 1 + the number of earlier calendar weeks in which both conditioning sessions were completed and that were neither light weeks nor floor weeks. The phase comes from this count, not from the calendar, so missed weeks never push him into harder work.

| Phase | Conditioning weeks | Tuesday | Thursday | After lifting |
| --- | --- | --- | --- | --- |
| 1 | 1–2 | 20–30 min easy | 20–30 min easy | none |
| 2 | 3–4 | 30–40 min easy | 30–40 min easy with 6 intervals | none |
| 3 | 5–8 | 40–50 min easy | 40–50 min easy with 8 intervals | 10 min easy, optional |
| 4 | 9 on | 50–60 min easy | 50–60 min easy with 8–10 intervals | 10 min easy, optional |

- **Default target minutes.** The phase's lower bound in its first conditioning week, then 5 more minutes each conditioning week, up to the phase's upper bound. By conditioning week: 20, 25, 30, 35, 40, 45, 50, 50, 50, 55, 60, and 60 from then on. The user can pick anything in the range.
- **Short on time.** Any session of 20 easy minutes or more counts as a completed session. Intervals need a session of at least 30 minutes, so a shorter Thursday is easy only.
- **Thursday intervals** sit in the middle of the session's total time: easy on the air bike, then the interval block on the SkiErg (30 seconds hard but not all-out, about 8 out of 10, then 90 seconds easy, repeated), then easy on the air bike to finish. Example: 40 minutes with 8 intervals is 12 easy, 16 of intervals, and 12 easy. Phase 4 defaults to 8 intervals, and the user can choose up to 10.
- **Intervals are Thursday's [app rule].** Only a Thursday session has intervals. If Thursday's conditioning doesn't happen, that week has none: displaced conditioning is dropped, not moved (section 1). A conditioning session that "No time today" moves off Thursday is easy only.
- **Machines.** "SkiErg bothers my elbows or shoulders" in Settings, or "SkiErg unavailable" for one session, moves intervals to the air bike. "Air bike unavailable" turns the easy minutes into a brisk incline treadmill walk.
- **No intervals** in a light week, after a check-in of last night under 6 hours, or in the rest of a week cut short by illness (section 10).
- **Flat after intervals.** The first lifting session after an interval session asks, "Flat from the intervals?" Yes halves the next interval session's rounds, rounded down.
- **Screening gate.** Before the first session with intervals, show the screening note (`program.json → safety.screeningNote`) again and require a tap on "I've read this." Store it.
- **Floor week:** no conditioning.
- **Layoff [app rule].** If the last completed conditioning session was more than 21 days ago, drop one phase, to the first week of the lower phase. More than 60 days, go back to conditioning week 1.
- **Weekly bar.** Conditioning minutes this calendar week (sessions plus after-lifting spins) against the 150-minute guideline. Sessions under 20 minutes still add their minutes. **[app rule]**
- Never offer extra sessions to make up for missed ones or for food.

## 9. Warm-ups and calibration

```
warmups(lift, W):
  if lift == deadlift and W >= 155: sets = [135 x 5], last = 135
  else: sets = [bar x 5, bar x 5], last = bar
  for (pct, reps) in [(0.40, 5), (0.55, 5), (0.70, 3), (0.85, 2)]:
      w = floor(W * pct / 5) * 5
      if w >= last + 10 and w <= W - 10:
          sets += [w x reps], last = w
  return sets
```

- Examples: squat 115 gives bar×5, bar×5, 60×5, 80×3, 95×2. Deadlift 175 gives 135×5, 145×2. Press 67.5 gives bar×5, bar×5, 55×2.
- A deadlift under 155 shows the cue "Raise the bar to plate height on blocks for the empty-bar sets."
- **Bench (first Workout B).** Sets of 5 from the empty bar. After each set the user taps "Fast" (next set +20 lb), "Starting to slow" (next set +10 lb), or "Clearly slowed." The set that clearly slowed is the work weight and the first work set, so two more follow. If that set missed reps, the work weight is the set before it, and 3 fresh work sets follow at it.
- **Rows (first appearance).** The same as the bench.
- **Power cleans (first appearance).** The same, in sets of 3, ending with "Bar speed dropped." That set is the first of 5 work sets.
- **Dips (first Workout B).** Before the chin-and-dip block, start with generous assistance (default: the current chin assistance) and do sets of up to 5, taking off 10 lb a set (5 lb once it feels close), until 5 solid reps leave 2 or 3 to spare, stopping at upper arms parallel. That setting is the dip assistance and its `lastMadeAssistance`, and all 3 rounds use it.
- **A calibration day counts [app rule].** The work sets that follow a calibration are the lift's first heavy session, rated and progressed by section 4. The dip rounds after dip calibration follow section 7 the same way.
- **Not in a light or floor week [app rule].** A bench, row, or power clean that still needs calibration sits out a light or floor week, with the note "Calibrates at its first session of a normal week," and calibrates then. Chin and dip calibrations go ahead: they look for a setting with reps to spare, and the week doesn't progress them.

## 10. Deloads, illness, and floor weeks

**Check-ins.** At the start of each lifting session: "Last night under 6 hours?", "Most nights under 7 hours since your last lifting session?", and "Any joint pain right now?" (yes asks which lift and starts a pain stop for it, section 12). At the start of each conditioning session: "Last night under 6 hours?" At the end of each lifting session: "Did warm-ups feel heavy today?"

**Light-week triggers,** checked after every lifting session and when the user declares something:

1. Two or more barbell lifts on the ladder at once (section 5).
2. "Most nights under 7 hours" at two lifting sessions in a row.
3. "Warm-ups felt heavy" at two lifting sessions in a row.
4. The user declares an overloaded week (the "Something came up" menu on the Today screen).

The app suggests a light week. The user picks "Rest of this week," "Next week," or "Not now." A light week is a calendar week.

**Light week contents.**
- Same sessions and alternation.
- 3×5 lifts drop to 2×5, the deadlift stays 1×5, and power cleans drop to 3×3, all at `percentWeight(lcw, 0.90)`.
- Chins and dips: section 7. Conditioning: easy minutes only at the usual target.
- Nothing progresses or moves on the ladder. Light-day counters and assistance settings are frozen.

**After a light week** **[app rule]:** lifts in `NORMAL` repeat `lcw` with no jump at their first heavy session back. Lifts in `REPEAT`, `BRIDGE_SHORT`, `BRIDGE_NORMAL`, or `HOLD` resume the prescription they had.

**Illness.** Declared from "Something came up." The app asks, "Fever, widespread aches, unusual fatigue, chest congestion, a hacking cough, or an upset stomach?"
- Yes: sick mode. No sessions are offered, and the Today screen says "Rest. Come back once you've gone 24 hours without a fever and without fever medicine." When the user taps "I'm better," the first lifting session back uses section 11 by `daysAway`, and the rest of that calendar week is a light week with no intervals. Sick days log nothing and count toward nothing.
- No (a runny nose, congestion, or a minor sore throat only): the rest of the calendar week becomes a light week, with easy conditioning.

**Floor week.**
- Declared by the user for the current calendar week, or scheduled. Christmas week (2026-12-21 to 12-25) and Holy Week (2027-03-22 to 03-26) are preloaded, and the user can remove or add weeks.
- A floor week is its whole calendar week, Monday through Sunday, including a preloaded week's weekend. **[app rule]**
- At most 2 lifting sessions in the week, counting any already done, on days that aren't back to back. The default days are the first two lift days.
- Each session is the next workout in A/B order, slots 1 to 3 as they would normally run, with no chin-and-dip block: 3×5 lifts at 2×5, the deadlift at 1×5, and power cleans at 3×3, all at `lcw`. No conditioning.
- Floor-week sessions count for alternation. Everything else is frozen, as in a light week, and the week after resumes as after a light week.

**Maintenance breaks** (from the eating plan) are not deloads. During a break the Today screen shows "Maintenance break: keep lifting normally and push." When a floor week falls inside a break, the floor-week card wins for those days, and it adds "Eat on the maintenance pattern this week: three Mains a day."

## 11. Missed training

At the start of each lifting session, `daysAway` = calendar days since the last completed lifting session of any kind.

| daysAway | First session back |
| --- | --- |
| 5 or fewer | Normal. This covers weekends and any one missed session. |
| 6 or 7 | Repeat. Lifts in `NORMAL` use `lcw` with no jump. Lifts on the ladder repeat their pending prescription. |
| 8 to 21 | `lcw = percentWeight(lcw, 0.95)` if under 40, or `percentWeight(lcw, 0.90)` if 40 or over. |
| 22 to 60 | `lcw = percentWeight(lcw, 0.90)`. After each lift's last warm-up set, the app asks "Did that warm-up feel heavy?" Yes: that lift's work sets drop to `percentWeight(lcw before the layoff, 0.80)`, which becomes its `lcw`. |
| More than 60 | Start light: `lcw = percentWeight(lcw, 0.60)` by default, editable. |

- Drops apply once, at the first session back, to every lift, including lifts not in that session.
- From 8 days on, every lift's stage returns to `NORMAL`, except that a `GRADUATED` lift stays graduated (section 17) and only its prefilled weight drops. `hasMissed`, `resetCount`, and `lastResetFrom` are kept, except after more than 60 days, which starts a fresh novice run: those and `hasBeenNotCrisp` are cleared, `GRADUATED` lifts return to `NORMAL`, and the light squat day and once-a-week deadlift switch off. **[app rule]**
- Chins and dips: 6 or 7 days, repeat. 8 to 21 days, 10 lb more assistance. 22 to 60 days, 20 lb more. More than 60 days, recalibrate both as dips were calibrated on day one. Chins start that recalibration 30 lb above their old assistance, coming off the belt first, and dips start where chins do. **[app rule]** In `BODYWEIGHT` or `WEIGHTED` mode, "more assistance" means taking that much off the belt first, then adding assistance in `LOAD` mode.
- The age bracket comes from Settings. Until it is set, use 40 and over.
- A paused lift that returns after more than 7 days uses this table on its own, counting from its last heavy session. A session where pain stopped the lift partway counts as its last heavy session, since it ran its normal prescription (section 0). **[app rule]**
- Travel is just time away: the walks PROTOCOL.md suggests aren't logged, and the return uses this table.
- Conditioning after a layoff: section 8.

## 12. Pain and safety

- **Pain stop (per lift).** For joint pain, sharp pain, or pain that changes how he moves. It ends that lift for the session, and the rest of the session continues. The lift's `pain` becomes `paused`, and that session doesn't count for its progression or ladder.
- **At the next session with that lift,** the app asks, "Is the <lift> pain gone?"
  - Yes: `pain = returning`. The lift runs one session of its normal sets at `percentWeight(lcw, 0.90)`, which isn't heavy, and then resumes the prescription it had. If the pain comes back in that session, it's a new pain stop.
  - No, or still there in the warm-ups: the lift stays paused and shows "See a doctor or physical therapist before loading it again." It asks again at each later session, and a "Cleared by a clinician" button starts the return as above.
  - In a light or floor week, the return session takes that week's sets at the return weight: 2×5 at `percentWeight(lcw, 0.90)`, 1×5 for the deadlift, and 3×3 for power cleans. It still counts as the return. **[app rule]**
- **Stop session.** A button on every session screen for chest pain or pressure, fainting, unusual breathlessness, dizziness, or a racing or irregular heartbeat. It ends the session, nothing counts, and it shows: "Stop now. Chest pain that doesn't ease within a few minutes of stopping is a 911 call. Get checked before training again."
- **Soreness note** in program weeks 1 and 2: "Heavy soreness is normal after a year off. Joint pain, sharp pain, or pain that changes how you move is not."
- **Screening note** at setup (acknowledged once), again before the first interval session (section 8), and always in Settings.

## 13. Nutrition prompts

The app doesn't track food. It shows these prompts only:

- Lifting day: "Shake after lifting."
- Conditioning day, after the session is logged: in conditioning phase 1 or 2, "Add a second Shake today." In phase 3 or 4, "Add a second Breakfast today." Keyed to the phase, so the food changes when the sessions get longer. No session logged, no prompt.
- Early-stall note (a lift enters `BRIDGE_SHORT` in program weeks 1–8): "If recovery feels poor, your eating plan's lever comes before any reset: a second Shake on lifting days." It lasts as long as that lift's stall: it clears when the lift makes the bridge, resets, or graduates, when the food lever turns on, or when he dismisses it. **[app rule]**
- Food lever on (section 5): every lifting day's card adds "Second Shake today (your eating plan's lever)." Conditioning days already have their extra slot.
- The maintenance-break banner (dates in `program.json`), its floor-week addition (section 10), and the hold rule (section 5).
- Never: a prompt that ties exercise to food eaten, or an extra session for food.

## 14. Time budget and rest timer

- **Session clock** starts at "Start session." The app projects the finish from the sets left and default rests.
- **Over 80 minutes projected:** show the cut order, one step at a time. (1) Skip the after-lifting spin. (2) Drop one warm-up set from each remaining lift: the second empty-bar set, or for the deadlift its lowest ramp set when it has two or more. (3) Do the chin sets in the rests between press or bench sets, keeping at least 3 minutes between press or bench sets, and do the dips after the last one. Never suggest shortening squat or deadlift rests.
- **Rest timer** starts when a work set is logged. Its default comes from the lift's effort rating at its last heavy session: light 2:00, 3–4 left 2:30, 1–2 left 3:30, grind or missed 5:00, and 2:00 with no history. Power cleans and rows: crisp 2:30 and not crisp 3:30. **[app rule]** Bridge short sets never get less than 5:00. The chin-and-dip block uses 1:15. Buttons add or take off 30 seconds.
- The timer runs from timestamps, so it stays right if the phone locks or the app goes to the background.
- **Projection estimates [app rule].** 5:00 for the bike warm-up, 1:15 per warm-up set including loading, 0:45 per work set plus its rest, 2:00 to change lifts, 0:40 per chin or dip set plus 1:15 rests, and 10:00 for the spin. The projection updates from the session clock as sets are logged. Tune the estimates against logged session times.

## 15. What gets logged

- **Lifting session:** date, workout, week type, check-ins, every set (weight, reps, form flags, skipped), effort rating per lift, assistance settings and reps, spare reps, negatives done, substitutions, pain stops and pain answers, calibration results, layoff warm-up answers, start and end times, and notes.
- **Conditioning session:** date, conditioning week, phase, target and actual minutes, machines, interval rounds planned and done, the short-night answer, and notes.
- **Other events:** bodyweight entries, settings changes, week declarations (light, floor, overloaded), illness start and "I'm better," screening acknowledgments, the food-lever answer, clinician clearances, and manual overrides.

## 16. Order of operations

At the start of a lifting session:

1. Week type for today: floor, light, or normal (including sick mode, which offers nothing).
2. Missed-training adjustments (section 11), once per return.
3. Check-ins, pain answers, and paused or returning lifts (sections 10 and 12).
4. Each lift's prescription from its stage (sections 4 and 5), or its light-week, floor-week, or pain-return version (sections 10 and 12), then the short-night adjustment (section 4).
5. Slot changes: light squat day, once-a-week deadlift, split chins and dips, and equipment substitutions (sections 2, 6, and 7).
6. Rounding and plates (section 3), then warm-ups (section 9).

At the end, for each lift in this order: pain stops, incomplete lifts, made or missed (sections 4 and 5), light-day counters (section 6), and chins and dips (section 7). Deload triggers are checked last (section 10).

## 17. Edge cases

- **First launch:** seed the log with the 2026-11-02 session from `program.json → startingState`, asking the effort rating for Monday's squat, press, deadlift, and the spare reps for chins.
- **Two sessions on the same day:** allowed, with a warning.
- **Past-date entries:** replay from that date.
- **Changing `pullChoice` mid-run:** the new lift starts with calibration, and the old lift's state is kept in case he switches back.
- **Graduated lifts** stay graduated unless the user restarts that lift in Settings (logged as an override) or a layoff of more than 60 days starts a fresh run. A restart suggests 90% of the lift's last completed weight, which he can edit, and clears that lift's ladder history. **[app rule]**
- **Stale bodyweight:** effective load uses the latest entry and shows its date if it is more than 14 days old.
- **Manual overrides** of any prescription are logged as events, and the engine treats an override as that session's prescription.
