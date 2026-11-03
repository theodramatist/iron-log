// Proposed readings for open questions (QUESTIONS.md). CLAUDE.md rule 1:
// where RULES.md is ambiguous, the engine implements a proposed reading
// behind a named constant until the question is answered. Numbers match
// QUESTIONS.md.

export const READINGS = {
  /** Q1 (section 5, T29): a failure after the food lever's extra round still checks the maintenance-break hold first. */
  HOLD_CHECK_AFTER_FOOD_LEVER_ROUND: true,

  /** Q2 (section 6): only made sessions that took a progression step change the light-day and once-a-week count. */
  LIGHT_DAY_COUNT_ONLY_PROGRESSION_STEPS: true,

  /** Q3 (section 14): rest defaults for power cleans and rows, in seconds. */
  REST_CRISP_SEC: 150,
  REST_NOT_CRISP_SEC: 210,

  /** Q4 (section 3): work sets logged at different weights count as the lowest attempted weight. */
  MIXED_WORK_WEIGHTS_USE_LOWEST: true,

  /** Q5 (section 8): sessions under 20 minutes still add their minutes to the weekly bar. */
  SHORT_SESSIONS_COUNT_TOWARD_WEEKLY_BAR: true,

  /** Q6 (section 9): a calibration day's work sets (bench, rows, cleans) and rounds (dips) progress like any heavy session. */
  CALIBRATION_DAY_PROGRESSES: true,

  /** Q7 (section 10): a floor week covers its whole calendar week, Monday through Sunday. */
  FLOOR_WEEK_IS_CALENDAR_WEEK: true,

  /** Q8 (section 8): the interval session is Thursday's, or the week's second session if no interval session has run. */
  INTERVALS_ON_THURSDAY_OR_SECOND_SESSION: true,

  /** Q9 (section 5): one food-lever answer applies to every lift waiting on the question. */
  FOOD_LEVER_ANSWER_APPLIES_TO_ALL_PENDING: true,

  /** Q10 (section 5): a food-lever question still unanswered at the lift's next session is treated as No. */
  UNANSWERED_FOOD_LEVER_IS_NO: true,

  /** Q11 (section 4): a made lift with no effort rating takes the smallest table row (cleans and rows: the 2.5-lb jump). */
  MISSING_RATING_IS_GRIND: true,

  /** Q12 (section 7): without 5-lb assistance steps, "made with room" takes off the machine's stack step. */
  NO_FIVE_LB_STEPS_USE_STACK_STEP: true,

  /** Q13 (section 11): after more than 60 days, chins recalibrate starting this much above their old setting. */
  CHIN_RECALIBRATION_EXTRA_LB: 20,

  /** Q14 (sections 11 and 17): an 8-to-60-day layoff keeps a graduated lift graduated and drops only its prefill. */
  GRADUATED_SURVIVES_SHORT_LAYOFF: true,

  /** Q15 (sections 0, 11, 12; T67 and T70): a pain-stopped session is the lift's last heavy session for the return rule. */
  PAIN_STOP_COUNTS_AS_LAST_HEAVY: true,

  /** Q16 (section 11): a fresh novice run after 60 days also clears hasBeenNotCrisp for cleans and rows. */
  FRESH_RUN_CLEARS_NOT_CRISP: true,

  /** Q17 (sections 3 and 17): the restart weight the Lifts screen suggests for a graduated lift, as a fraction of its last weight. */
  RESTART_SUGGESTED_FRACTION: 0.9,

  /** Q18 (section 14): time projection estimates, in seconds. */
  BIKE_WARMUP_SEC: 300,
  WARMUP_SET_SEC: 75,
  WORK_SET_SEC: 45,
  LIFT_CHANGE_SEC: 120,
  ASSIST_SET_SEC: 40,
  SPIN_SEC: 600,
  CHINS_BETWEEN_PRESS_MIN_REST_SEC: 180,
} as const;
