import { deriveStepStates } from './approvals-display';

describe('deriveStepStates', () => {
  const steps = [{ name: 'Manager' }, { name: 'Director' }, { name: 'VP' }];

  it('marks a step with a recorded decision by that decision, regardless of position', () => {
    const result = deriveStepStates(steps, [{ stepPosition: 1, decision: 'rejected' }], 1);
    expect(result.map((s) => s.state)).toEqual(['approved', 'rejected', 'pending']);
  });

  it('marks steps before the current position as approved when nothing was recorded for them', () => {
    const result = deriveStepStates(steps, [], 2);
    expect(result.map((s) => s.state)).toEqual(['approved', 'approved', 'pending']);
  });

  it('marks the current and future steps as pending', () => {
    const result = deriveStepStates(steps, [], 0);
    expect(result.map((s) => s.state)).toEqual(['pending', 'pending', 'pending']);
  });

  it('preserves step names and order', () => {
    const result = deriveStepStates(steps, [], 0);
    expect(result.map((s) => s.name)).toEqual(['Manager', 'Director', 'VP']);
  });
});
