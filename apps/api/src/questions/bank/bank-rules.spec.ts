import { changedFields, closestDuplicate, isMajorChange, missingAltText, normalized, rubricProblem, similarity, type QuestionContent } from './bank-rules';

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

describe('rubrics (answer 2271)', () => {
  const essay: QuestionContent = { type: 'essay', text: 'Why?', difficulty: 'easy', marks: 10, options: [], rubric: [{ criterion: 'Cause', marks: 4 }, { criterion: 'Owner', marks: 6 }] };
  it('a rubric adding up to the marks is fine; none is fine; a change to it is a reviewed change', () => {
    expect(rubricProblem(essay)).toBeNull();
    expect(rubricProblem({ ...essay, rubric: [] })).toBeNull();
    expect(changedFields(normalized(essay), normalized({ ...essay, rubric: [{ criterion: 'Cause', marks: 5 }, { criterion: 'Owner', marks: 5 }] }))).toEqual(['rubric']);
  });
  it('negative: wrong type, unnamed or repeated criteria, part marks, a total that does not add up, more than 10', () => {
    expect(rubricProblem({ ...essay, type: 'single_mcq' })).toMatch(/Only written/);
    expect(rubricProblem({ ...essay, rubric: [{ criterion: ' ', marks: 10 }] })).toBe('Name every criterion.');
    expect(rubricProblem({ ...essay, rubric: [{ criterion: 'Cause', marks: 5 }, { criterion: 'cause', marks: 5 }] })).toBe('Each criterion is named once.');
    expect(rubricProblem({ ...essay, rubric: [{ criterion: 'Cause', marks: 9.5 }, { criterion: 'Owner', marks: 0.5 }] })).toMatch(/whole mark/);
    expect(rubricProblem({ ...essay, rubric: [{ criterion: 'Cause', marks: 4 }] })).toBe('The criteria add up to 4 marks; the question is worth 10.');
    expect(rubricProblem({ ...essay, marks: 11, rubric: Array.from({ length: 11 }, (_, i) => ({ criterion: `C${i}`, marks: 1 })) })).toMatch(/at most 10/);
  });
});
