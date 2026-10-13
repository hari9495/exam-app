import { interviewResult, missingForSubmit, visibleScorecards, weightedScore } from './scorecard-rules';

describe('scorecard rules (YX-ATS-51, D7)', () => {
  const items = [{ id: 'a', weight: 2, label: 'Accounting' }, { id: 'b', weight: 1, label: 'Communication' }];

  it('weights the ratings and waits for every item', () => {
    expect(weightedScore(items, [{ itemId: 'a', rating: 4 }, { itemId: 'b', rating: 1 }])).toBe(3);
    expect(weightedScore(items, [{ itemId: 'a', rating: 4 }])).toBeNull();
  });

  it('lists what is missing before submit', () => {
    expect(missingForSubmit(items, [{ itemId: 'a', rating: 5 }], null, 4)).toEqual(['"Accounting" must be rated 1 to 4.', 'Rate "Communication".', 'Choose an overall recommendation.']);
    expect(missingForSubmit(items, [{ itemId: 'a', rating: 3 }, { itemId: 'b', rating: 2 }], 'yes', 4)).toEqual([]);
  });

  it('D7: a panellist sees colleagues only after submitting; overseers see submitted ones only', () => {
    const cards = [
      { panelistUserId: 'A', status: 'submitted' },
      { panelistUserId: 'B', status: 'draft' },
      { panelistUserId: 'C', status: 'submitted' },
    ];
    expect(visibleScorecards(cards, { userId: 'B', isPanelist: true, isOverseer: false }).map((c) => c.panelistUserId)).toEqual(['B']);
    expect(visibleScorecards(cards, { userId: 'A', isPanelist: true, isOverseer: false }).map((c) => c.panelistUserId)).toEqual(['A', 'C']);
    expect(visibleScorecards(cards, { userId: 'R', isPanelist: false, isOverseer: true }).map((c) => c.panelistUserId)).toEqual(['A', 'C']);
    expect(visibleScorecards(cards, { userId: 'X', isPanelist: false, isOverseer: false })).toEqual([]);
  });

  it('the interview result needs every panellist, then compares the mean with the bar', () => {
    expect(interviewResult(2, [{ weightedScore: 3 }], 2.5)).toMatchObject({ complete: false, passes: null, submitted: 1, expected: 2 });
    expect(interviewResult(2, [{ weightedScore: 3 }, { weightedScore: 2 }], 2.5)).toMatchObject({ complete: true, score: 2.5, passes: true });
    expect(interviewResult(2, [{ weightedScore: 2 }, { weightedScore: 2.5 }], 2.5)).toMatchObject({ passes: false });
  });
});
