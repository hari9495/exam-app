import { gradeAnswer, computeResult } from './grading';

describe('gradeAnswer', () => {
  it('awards full marks for an exact single-option match', () => {
    const result = gradeAnswer({ marks: 5, correctOptionIds: ['opt-a'] }, ['opt-a']);
    expect(result).toEqual({ isCorrect: true, marksAwarded: 5 });
  });

  it('awards zero marks for a wrong single-option selection', () => {
    const result = gradeAnswer({ marks: 5, correctOptionIds: ['opt-a'] }, ['opt-b']);
    expect(result).toEqual({ isCorrect: false, marksAwarded: 0 });
  });

  it('awards full marks for an exact multi-option match regardless of order', () => {
    const result = gradeAnswer({ marks: 4, correctOptionIds: ['opt-a', 'opt-b'] }, ['opt-b', 'opt-a']);
    expect(result).toEqual({ isCorrect: true, marksAwarded: 4 });
  });

  it('awards zero marks for a partial multi-option match (all-or-nothing)', () => {
    const result = gradeAnswer({ marks: 4, correctOptionIds: ['opt-a', 'opt-b'] }, ['opt-a']);
    expect(result).toEqual({ isCorrect: false, marksAwarded: 0 });
  });

  it('awards zero marks when an extra incorrect option is included alongside the correct ones', () => {
    const result = gradeAnswer({ marks: 4, correctOptionIds: ['opt-a', 'opt-b'] }, ['opt-a', 'opt-b', 'opt-c']);
    expect(result).toEqual({ isCorrect: false, marksAwarded: 0 });
  });

  it('awards zero marks for an empty selection', () => {
    const result = gradeAnswer({ marks: 5, correctOptionIds: ['opt-a'] }, []);
    expect(result).toEqual({ isCorrect: false, marksAwarded: 0 });
  });
});

describe('computeResult', () => {
  it('computes score, maxScore, percentage, and pass when meeting the pass criteria', () => {
    const summary = computeResult([{ marksAwarded: 5 }, { marksAwarded: 0 }], [{ marks: 5 }, { marks: 5 }], 50);
    expect(summary).toEqual({ score: 5, maxScore: 10, percentage: 50, passFail: 'pass' });
  });

  it('returns fail when below the pass criteria', () => {
    const summary = computeResult([{ marksAwarded: 2 }], [{ marks: 10 }], 50);
    expect(summary).toEqual({ score: 2, maxScore: 10, percentage: 20, passFail: 'fail' });
  });

  it('counts an unanswered question toward maxScore but contributes nothing to score', () => {
    const summary = computeResult([{ marksAwarded: 3 }], [{ marks: 3 }, { marks: 7 }], 40);
    expect(summary).toEqual({ score: 3, maxScore: 10, percentage: 30, passFail: 'fail' });
  });

  it('returns a zero percentage instead of dividing by zero when there are no questions', () => {
    const summary = computeResult([], [], 40);
    expect(summary).toEqual({ score: 0, maxScore: 0, percentage: 0, passFail: 'fail' });
  });
});
