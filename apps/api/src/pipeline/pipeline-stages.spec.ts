import { PIPELINE_STAGES, isValidStage } from './pipeline-stages';

describe('pipeline-stages', () => {
  it('is the five fixed stages in order', () => {
    expect(PIPELINE_STAGES).toEqual(['applied', 'screened', 'interview', 'offer', 'hired']);
  });
  it('accepts a valid stage and rejects rejected/garbage', () => {
    expect(isValidStage('interview')).toBe(true);
    expect(isValidStage('rejected')).toBe(false); // rejected is a flag, not a stage
    expect(isValidStage('nope')).toBe(false);
  });
});
