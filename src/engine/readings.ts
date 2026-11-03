// Proposed readings for open questions (QUESTIONS.md). CLAUDE.md rule 1:
// where RULES.md is ambiguous, the engine implements a proposed reading
// behind a named constant until the question is answered.

export const READINGS = {
  /**
   * Q1 (RULES.md section 5, T29). After the extra round the food lever buys,
   * a failure goes back through beforeReset, so the maintenance-break hold is
   * checked before the reset, as the pseudo-code is written.
   */
  HOLD_CHECK_AFTER_FOOD_LEVER_ROUND: true,

  /**
   * Q2 (section 6). Only a made heavy session whose prescription was a normal
   * progression step changes the light-day and once-a-week count. Sessions
   * that repeated a weight (the REPEAT stage, bridge normal sets, hold
   * retries, layoff and after-light-week repeats, a user-chosen repeat) leave
   * it alone, like misses.
   */
  LIGHT_DAY_COUNT_ONLY_PROGRESSION_STEPS: true,

  /** Q3 (section 14). Rest defaults for power cleans and rows, in seconds. */
  REST_CRISP_SEC: 150,
  REST_NOT_CRISP_SEC: 210,

  /** Q5 (section 3). Work sets logged at different weights: W is the lowest attempted. */
  MIXED_WORK_WEIGHTS_USE_LOWEST: true,

  /** Q6 (section 8). Sessions under 20 minutes still add their minutes to the weekly bar. */
  SHORT_SESSIONS_COUNT_TOWARD_WEEKLY_BAR: true,

  /** Q7 and Q8 (section 9). A calibration day's work sets and rounds progress like any heavy session. */
  CALIBRATION_DAY_PROGRESSES: true,

  /** Q9 (section 10). A floor week covers its whole calendar week, Monday through Sunday. */
  FLOOR_WEEK_IS_CALENDAR_WEEK: true,

  /** Q10 (section 8). The interval session is Thursday's, or the week's second session if none ran yet. */
  INTERVALS_ON_THURSDAY_OR_SECOND_SESSION: true,

  /** Q11 (section 5). One food-lever answer applies to every lift waiting on the question. */
  FOOD_LEVER_ANSWER_APPLIES_TO_ALL_PENDING: true,

  /** Q12 (section 4). A made lift with no effort rating takes the smallest table row. */
  MISSING_RATING_IS_GRIND: true,

  /** Q13 (section 7). Without 5-lb assistance steps, the step is the machine's stack step. */
  NO_FIVE_LB_STEPS_USE_STACK_STEP: true,

  /** Q14 (section 11). Chins recalibrate after a long layoff starting 20 lb above the old setting. */
  CHIN_RECALIBRATION_EXTRA_LB: 20,

  /** Q15 (section 14). Time projection estimates. */
  BIKE_WARMUP_SEC: 300,
  WARMUP_SET_SEC: 75,
  WORK_SET_SEC: 45,
  LIFT_CHANGE_SEC: 120,
  ASSIST_SET_SEC: 40,
  SPIN_SEC: 600,
  CHINS_BETWEEN_PRESS_MIN_REST_SEC: 180,
} as const;
