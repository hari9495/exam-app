import { dripToSteps } from './drip-migration';

describe('dripToSteps (retire /v2, answer 2512)', () => {
  it('puts a wait before each message, none for a 0-day delay, and splits waits over 60 days', () => {
    expect(dripToSteps([{ subject: 'a', body: 'a', delayDays: 0 }, { subject: 'b', body: 'b', delayDays: 3 }, { subject: 'c', body: 'c', delayDays: 130 }], ['t1', 't2', 't3'])).toEqual([
      { kind: 'message', templateId: 't1' },
      { kind: 'wait', days: 3 },
      { kind: 'message', templateId: 't2' },
      { kind: 'wait', days: 60 },
      { kind: 'wait', days: 60 },
      { kind: 'wait', days: 10 },
      { kind: 'message', templateId: 't3' },
    ]);
  });

  it('a drip with no steps has no steps; a negative delay is no wait', () => {
    expect(dripToSteps([], [])).toEqual([]);
    expect(dripToSteps([{ subject: 'a', body: 'a', delayDays: -2 }], ['t1'])).toEqual([{ kind: 'message', templateId: 't1' }]);
  });
});
