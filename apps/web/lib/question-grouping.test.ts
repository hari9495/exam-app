import { groupQuestions } from './question-grouping';
import { Question } from './types';

function makeQuestion(overrides: Partial<Question> & { id: string }): Question {
  return {
    type: 'single_mcq',
    text: 'Sample question',
    topic: null,
    category: null,
    difficulty: 'easy',
    marks: 1,
    negativeMarks: 0,
    status: 'active',
    aiGenerated: false,
    languageMode: 'any',
    allowedLanguages: [],
    starterCode: null,
    allowStdin: false,
    snippetCode: null,
    snippetLanguage: null,
    imageUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    options: [],
    ...overrides,
  } as Question;
}

describe('groupQuestions', () => {
  it('groups by topic alphabetically, pinning the no-topic bucket last', () => {
    const groups = groupQuestions(
      [
        makeQuestion({ id: 'q1', topic: 'Ratios' }),
        makeQuestion({ id: 'q2', topic: null }),
        makeQuestion({ id: 'q3', topic: 'Averages' }),
        makeQuestion({ id: 'q4', topic: 'Ratios' }),
      ],
      'topic',
    );

    expect(groups.map((group) => group.label)).toEqual(['Averages', 'Ratios', 'No topic']);
    expect(groups[1].questions.map((question) => question.id)).toEqual(['q1', 'q4']);
  });

  it('treats a blank-but-present topic as unset rather than as its own group', () => {
    const groups = groupQuestions([makeQuestion({ id: 'q1', topic: '   ' })], 'topic');

    expect(groups.map((group) => group.label)).toEqual(['No topic']);
  });

  it('groups by category with its own placeholder label', () => {
    const groups = groupQuestions(
      [makeQuestion({ id: 'q1', category: 'Aptitude' }), makeQuestion({ id: 'q2', category: null })],
      'category',
    );

    expect(groups.map((group) => group.label)).toEqual(['Aptitude', 'No category']);
  });

  it('orders difficulty groups easy to hard, not alphabetically', () => {
    const groups = groupQuestions(
      [
        makeQuestion({ id: 'q1', difficulty: 'hard' }),
        makeQuestion({ id: 'q2', difficulty: 'easy' }),
        makeQuestion({ id: 'q3', difficulty: 'medium' }),
      ],
      'difficulty',
    );

    // Alphabetical would give Easy, Hard, Medium -- the point of the custom rank.
    expect(groups.map((group) => group.label)).toEqual(['Easy', 'Medium', 'Hard']);
  });

  it('lists a multi-tagged question under every one of its tags', () => {
    const groups = groupQuestions(
      [
        makeQuestion({ id: 'q1', tags: [{ id: 't1', name: 'SQL' }, { id: 't2', name: 'Joins' }] }),
        makeQuestion({ id: 'q2', tags: [{ id: 't1', name: 'SQL' }] }),
      ],
      'tag',
    );

    expect(groups.map((group) => group.label)).toEqual(['Joins', 'SQL']);
    expect(groups[0].questions.map((question) => question.id)).toEqual(['q1']);
    expect(groups[1].questions.map((question) => question.id)).toEqual(['q1', 'q2']);
  });

  it('puts questions with no tags in a trailing no-tags group', () => {
    const groups = groupQuestions(
      [makeQuestion({ id: 'q1', tags: [] }), makeQuestion({ id: 'q2', tags: [{ id: 't1', name: 'SQL' }] })],
      'tag',
    );

    expect(groups.map((group) => group.label)).toEqual(['SQL', 'No tags']);
  });

  it('treats a missing tags field the same as an empty one', () => {
    const question = makeQuestion({ id: 'q1' });
    delete (question as Partial<Question>).tags;

    const groups = groupQuestions([question], 'tag');

    expect(groups.map((group) => group.label)).toEqual(['No tags']);
  });

  it('returns no groups for an empty question list', () => {
    expect(groupQuestions([], 'topic')).toEqual([]);
  });
});
