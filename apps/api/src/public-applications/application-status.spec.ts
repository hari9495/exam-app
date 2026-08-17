import { applicationStatusBucket } from './application-status';

describe('applicationStatusBucket', () => {
  it('maps each stage to its candidate-facing bucket', () => {
    expect(applicationStatusBucket('applied', false)).toBe('Application received');
    expect(applicationStatusBucket('screened', false)).toBe('Under review');
    expect(applicationStatusBucket('interview', false)).toBe('Under review');
    expect(applicationStatusBucket('offer', false)).toBe('Moving forward — the team will be in touch');
    expect(applicationStatusBucket('hired', false)).toBe('Moving forward — the team will be in touch');
  });
  it('rejected overrides any stage', () => {
    expect(applicationStatusBucket('interview', true)).toBe('A decision has been made; the team will follow up');
    expect(applicationStatusBucket('applied', true)).toBe('A decision has been made; the team will follow up');
  });
});
