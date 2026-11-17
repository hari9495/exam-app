import { MarkSuggestionClient } from './mark-suggestion.client';

// Answer 2286: with a rubric the suggestion is per criterion, each within its own maximum; without one it is one mark.
const ai = (out: unknown) => ({ generateStructured: jest.fn(async () => out) }) as never;
const base = { question: 'Why did the line stop?', max: 10, answer: 'The belt slipped.' };

describe('MarkSuggestionClient', () => {
  it('a rubric gives one mark per criterion in order; the total is their sum', async () => {
    const r = await new MarkSuggestionClient().suggest({ ...base, rubric: [{ criterion: 'Cause', marks: 4 }, { criterion: 'Owner', marks: 6 }] }, ai({ criteria: [{ marks: 3, reason: 'a' }, { marks: 5, reason: 'b' }], reason: 'ok' }));
    expect(r).toEqual({ marks: 8, reason: 'ok', criteria: [{ marks: 3, reason: 'a' }, { marks: 5, reason: 'b' }] });
  });

  it('negative: a mark above a criterion, below zero, or missing is held to 0..its maximum', async () => {
    const r = await new MarkSuggestionClient().suggest({ ...base, rubric: [{ criterion: 'Cause', marks: 4 }, { criterion: 'Owner', marks: 6 }, { criterion: 'Fix', marks: 0 }] }, ai({ criteria: [{ marks: 40, reason: 'x' }, { marks: -2 }], reason: 7 }));
    expect(r.criteria).toEqual([{ marks: 4, reason: 'x' }, { marks: 0, reason: '' }, { marks: 0, reason: '' }]);
    expect(r.marks).toBe(4);
  });

  it('without a rubric it stays one mark (no criteria)', async () => {
    const r = await new MarkSuggestionClient().suggest(base, ai({ marks: 12, reason: 'fine' }));
    expect(r).toEqual({ marks: 10, reason: 'fine', criteria: null });
  });
});
