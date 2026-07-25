import { flaggedAttemptIds, ATTENTION_ALERT_COUNT } from './attention-alert';
import { ProctoringFlag } from './types';

const NOW = new Date('2026-07-25T10:00:00.000Z').getTime();

function alert(attemptId: string, secondsAgo: number, severity = 'high'): ProctoringFlag {
  return {
    attemptId,
    candidateId: `cand-${attemptId}`,
    eventType: 'tab_switch',
    severity,
    occurredAt: new Date(NOW - secondsAgo * 1000).toISOString(),
  };
}

describe('flaggedAttemptIds', () => {
  it('does not flag below the threshold', () => {
    const alerts = Array.from({ length: ATTENTION_ALERT_COUNT - 1 }, (_, i) => alert('a1', i));
    expect(flaggedAttemptIds(alerts, NOW).has('a1')).toBe(false);
  });

  it('flags at the threshold', () => {
    const alerts = Array.from({ length: ATTENTION_ALERT_COUNT }, (_, i) => alert('a1', i));
    expect(flaggedAttemptIds(alerts, NOW).has('a1')).toBe(true);
  });

  it('ignores alerts older than the window', () => {
    const alerts = Array.from({ length: ATTENTION_ALERT_COUNT }, (_, i) => alert('a1', 200 + i));
    expect(flaggedAttemptIds(alerts, NOW).has('a1')).toBe(false);
  });

  it('counts each attempt separately', () => {
    const alerts = [
      ...Array.from({ length: ATTENTION_ALERT_COUNT }, (_, i) => alert('a1', i)),
      ...Array.from({ length: ATTENTION_ALERT_COUNT - 1 }, (_, i) => alert('a2', i)),
    ];
    const flagged = flaggedAttemptIds(alerts, NOW);
    expect(flagged.has('a1')).toBe(true);
    expect(flagged.has('a2')).toBe(false);
  });

  it('ignores low severity', () => {
    const alerts = Array.from({ length: ATTENTION_ALERT_COUNT }, (_, i) => alert('a1', i, 'low'));
    expect(flaggedAttemptIds(alerts, NOW).has('a1')).toBe(false);
  });

  it('returns an empty set for no alerts', () => {
    expect(flaggedAttemptIds([], NOW).size).toBe(0);
  });
});
