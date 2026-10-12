import { groupFeedback, nominationProblem, type PeerEntry } from './peer-rules';

// PM-5.02 (§10.2, YX-PERF-05).
const e = (id: string, relationship: PeerEntry['relationship'], rating: number, text: string | null = null): PeerEntry => ({ id, relationship, answers: { q1: { rating, text } }, comment: null });

describe('anonymous feedback groups (§10.2)', () => {
  it('2 peers and 1 report merge into "Others" with 3', () => {
    const g = groupFeedback([e('a', 'peer', 4), e('b', 'peer', 2), e('c', 'report', 3)], 3);
    expect(g.heldBack).toBe(0);
    expect(g.shown).toEqual([{ group: 'others', responses: 3, ratings: { q1: { average: 3, low: 2, high: 4, count: 3 } }, texts: [] }]);
  });

  it('2 alone are held back', () => {
    expect(groupFeedback([e('a', 'peer', 4), e('b', 'peer', 5)], 3)).toEqual({ shown: [], heldBack: 2 });
  });

  it('a full group shows by itself; the rest pool or are held back', () => {
    const g = groupFeedback([e('a', 'peer', 4), e('b', 'peer', 5), e('c', 'peer', 3), e('d', 'report', 2)], 3);
    expect(g.shown.map((x) => [x.group, x.responses])).toEqual([['peer', 3]]);
    expect(g.heldBack).toBe(1);
  });

  it('never goes below 3, whatever the setting', () => {
    expect(groupFeedback([e('a', 'peer', 4), e('b', 'peer', 5)], 2)).toEqual({ shown: [], heldBack: 2 });
  });

  it('shows texts in an order unrelated to who wrote them', () => {
    const a = groupFeedback([e('a', 'peer', 4, 'zeta'), e('b', 'peer', 5, 'alpha'), e('c', 'peer', 3, 'mid')], 3).shown[0].texts;
    const b = groupFeedback([e('c', 'peer', 3, 'mid'), e('a', 'peer', 4, 'zeta'), e('b', 'peer', 5, 'alpha')], 3).shown[0].texts;
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
  });
});

describe('nomination limits', () => {
  it('stop the employee at the maximum and the manager past it', () => {
    expect(nominationProblem({ approved: 2, proposed: 3, max: 5, adding: 'propose' })).toMatch(/Up to 5/);
    expect(nominationProblem({ approved: 4, proposed: 0, max: 5, adding: 'propose' })).toBeNull();
    expect(nominationProblem({ approved: 5, proposed: 0, max: 5, adding: 'approve' })).toMatch(/already approved/);
  });
});
