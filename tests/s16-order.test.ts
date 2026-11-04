// RULES.md section 16: order of operations.
import { describe, expect, it } from 'vitest';
import { buildLog, madeAt, missed, missedAt, painStop } from './helpers/log';

describe('§16 Order of operations', () => {
  it('missed-training adjustments come before the short-night shift', () => {
    // Seven days after Monday's session: the repeat isn't a table jump, so a short night changes nothing.
    const log = buildLog({ setup: { squat: 'light' } });
    expect(log.liftPlan('2026-11-09', 'squat').weight).toBe(95);
    expect(log.liftPlan('2026-11-09', 'squat', { checkIns: { lastNightUnder6: true } }).weight).toBe(95);
    expect(log.liftPlan('2026-11-06', 'squat', { checkIns: { lastNightUnder6: true } }).weight).toBe(105);
  });

  it('a layoff drop comes before the light-week version', () => {
    const log = buildLog()
      .lift('2027-01-08', { squat: madeAt(250, 'rir1to2') }, { workout: 'B' })
      .declare('2027-01-18', 'light');
    // 10 days away (40 and over): 225, then the light week's 90%: 202.5.
    expect(log.liftPlan('2027-01-18', 'squat')).toMatchObject({ kind: 'lightWeek', sets: 2, weight: 202.5 });
  });

  it('a pain stop is checked before made or missed', () => {
    const log = buildLog().lift('2026-11-04', { squat: painStop(1) });
    expect(log.state('squat')).toMatchObject({ pain: 'paused', hasMissed: false, stage: 'NORMAL' });
  });

  it('deload triggers are checked after the session’s results', () => {
    const log = buildLog()
      .lift('2027-01-04', { squat: madeAt(240, 'rir3to4'), bench: madeAt(170, 'rir3to4') })
      .lift('2027-01-08', { squat: missedAt(250) })
      .lift('2027-01-11', { squat: missedAt(250), bench: missedAt(175) })
      .lift('2027-01-15')
      .lift('2027-01-18', { bench: missed() });
    // The bench stalls into its bridge in this session, joining the squat: two on the ladder.
    expect(log.state('bench')?.stage).toBe('BRIDGE_SHORT');
    expect(log.state('squat')?.stage).toBe('BRIDGE_SHORT');
    expect(log.suggestions().filter((s) => s.kind === 'lightWeek')).toHaveLength(1);
  });
});
