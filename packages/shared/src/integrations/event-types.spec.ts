import { INTEGRATION_EVENT_TYPES, INTEGRATION_EVENT_LABELS } from './event-types';

describe('integration event catalog', () => {
  it('has exactly the 9 catalog events, unique', () => {
    expect(INTEGRATION_EVENT_TYPES).toEqual([
      'invitation.created', 'attempt.submitted', 'attempt.settled', 'integrity.flagged',
      'interview.confirmed', 'offer.accepted', 'candidate.applied', 'candidate.fit_scored', 'candidate.hired',
    ]);
    expect(new Set(INTEGRATION_EVENT_TYPES).size).toBe(9);
  });

  it('has a human label for every event', () => {
    for (const t of INTEGRATION_EVENT_TYPES) {
      expect(typeof INTEGRATION_EVENT_LABELS[t]).toBe('string');
      expect(INTEGRATION_EVENT_LABELS[t].length).toBeGreaterThan(0);
    }
  });
});
