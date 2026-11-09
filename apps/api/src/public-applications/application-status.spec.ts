import { applicationStatusBucket, bucketOf } from './application-status';

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

describe('applicationStatusBucket with a YukthiX pipeline (T9-09)', () => {
  const st = (name: string, category: string, position: number) => ({ stage: { name, category, position, pipeline: { stages: [{ position: 1 }] } } });
  it('the first active stage is received, a later one under review, offer and hired move forward', () => {
    expect(bucketOf(st('Applied', 'active', 1), false)).toBe('Application received');
    expect(bucketOf(st('Panel', 'active', 3), false)).toBe('Under review');
    expect(bucketOf(st('Offer made', 'offer', 4), false)).toBe('Moving forward — the team will be in touch');
    expect(bucketOf(st('Joined', 'hired', 5), false)).toBe('Moving forward — the team will be in touch');
  });
  it('a rejected category or flag, and no stage at all', () => {
    expect(bucketOf(st('Not a fit', 'rejected', 6), false)).toBe('A decision has been made; the team will follow up');
    expect(bucketOf(st('Panel', 'active', 3), true)).toBe('A decision has been made; the team will follow up');
    expect(bucketOf(null, false)).toBe('Application received');
  });
});
