import { changedFields, closestDuplicate, isMajorChange, missingAltText, normalized, similarity, type QuestionContent } from './bank-rules';

const Q: QuestionContent = {
  type: 'single_mcq',
  text: 'Which Java Stream operation is lazy?',
  difficulty: 'medium',
  marks: 2,
  options: [
    { text: 'filter() is terminal', isCorrect: false },
    { text: 'map() is lazy', isCorrect: true },
  ],
};

describe('question bank rules (answers 2009, 2010)', () => {
  it('a new text, a changed key, an option added or reordered is a big change (a new version)', () => {
    expect(isMajorChange(Q, { ...Q, text: 'Which Stream operation is lazy?' })).toBe(true);
    expect(isMajorChange(Q, { ...Q, options: [{ ...Q.options[0]!, isCorrect: true }, { ...Q.options[1]!, isCorrect: false }] })).toBe(true);
    expect(isMajorChange(Q, { ...Q, options: [...Q.options, { text: 'collect() is lazy', isCorrect: false }] })).toBe(true);
    expect(isMajorChange(Q, { ...Q, options: [Q.options[1]!, Q.options[0]!] })).toBe(true);
  });

  it('negative: marks, difficulty, tags, alt text or spacing are small changes (the same version)', () => {
    expect(isMajorChange(Q, { ...Q, marks: 3, difficulty: 'hard', tags: ['java'], imageAlt: 'x' })).toBe(false);
    expect(isMajorChange(Q, { ...Q, text: '  Which Java  Stream operation is lazy? ' })).toBe(false);
  });

  it('lists what changed for the review', () => {
    expect(changedFields(Q, { ...Q, marks: 3, options: [Q.options[0]!, { text: 'map() is lazy', isCorrect: false }] })).toEqual(['options', 'marks']);
  });

  it('every image needs alt text before approval', () => {
    expect(missingAltText({ ...Q, imageUrl: 'q.png', options: [{ text: 'a', isCorrect: true, imageUrl: 'a.png' }, { text: 'b', isCorrect: false }] })).toEqual(['the question image', "option A's image"]);
    expect(missingAltText({ ...Q, imageUrl: 'q.png', imageAlt: 'A packing line', options: [{ text: 'a', isCorrect: true, imageUrl: 'a.png' }], optionAlts: ['A carton'] })).toEqual([]);
  });

  it('duplicates: the same words count as alike whatever the case and punctuation; different questions do not', () => {
    expect(similarity('Which Java Stream operation is lazy?', 'which java stream operation is LAZY')).toBe(100);
    expect(similarity('Which Java Stream operation is lazy?', 'A van covers 180 km in 3 hours.')).toBeLessThan(20);
    expect(closestDuplicate('Which Java Stream operation is lazy and returns a stream?', [{ id: 'a', text: 'A van covers 180 km.' }, { id: 'b', text: 'Which Java Stream operation is lazy and returns a new stream?' }], 80)).toEqual({ id: 'b', percent: expect.any(Number) });
    expect(closestDuplicate('Totally unrelated', [{ id: 'b', text: 'Which Java Stream operation is lazy?' }], 80)).toBeNull();
  });

  it('negative: a field left out (negative marks, collection, empty alt text) is not a change against the stored defaults', () => {
    const stored = normalized({ ...Q, negativeMarks: 0, category: null, tags: [], optionAlts: [] });
    expect(changedFields(stored, normalized({ ...Q, category: '  ', optionAlts: ['', ''] }))).toEqual([]);
    expect(changedFields(stored, normalized({ ...Q, negativeMarks: 0.5 }))).toEqual(['negativeMarks']);
  });
});
