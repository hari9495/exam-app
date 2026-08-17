import { deriveDriveState } from './derive-drive-state';

describe('deriveDriveState', () => {
  it('registered when there is no attempt', () => {
    expect(deriveDriveState(null, null)).toBe('registered');
  });
  it('in_progress when the attempt is in progress', () => {
    expect(deriveDriveState({ status: 'in_progress', submittedAt: null }, null)).toBe('in_progress');
  });
  it('submitted when submitted but not yet graded', () => {
    expect(deriveDriveState({ status: 'submitted', submittedAt: new Date() }, null)).toBe('submitted');
  });
  it('passed / failed from the result, regardless of attempt status', () => {
    expect(deriveDriveState({ status: 'submitted', submittedAt: new Date() }, { passFail: 'pass' })).toBe('passed');
    expect(deriveDriveState({ status: 'submitted', submittedAt: new Date() }, { passFail: 'fail' })).toBe('failed');
  });
  it('a result with null passFail (pending manual grade) reads as submitted, not passed', () => {
    // A code question pending manual grade produces a Result with passFail null. That is not a
    // verdict yet, so the board must not show it as passed/failed.
    expect(deriveDriveState({ status: 'submitted', submittedAt: new Date() }, { passFail: null })).toBe('submitted');
  });
});
