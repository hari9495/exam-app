import { gradeAnswer, computeResult, computeRemainingSeconds, effectiveDurationMinutes } from './grading';

describe('gradeAnswer', () => {
  it('awards full marks for an exact single-option match', () => {
    const result = gradeAnswer({ marks: 5, negativeMarks: 0, correctOptionIds: ['opt-a'] }, ['opt-a']);
    expect(result).toEqual({ isCorrect: true, marksAwarded: 5 });
  });

  it('awards zero marks for a wrong single-option selection when negativeMarks is 0', () => {
    const result = gradeAnswer({ marks: 5, negativeMarks: 0, correctOptionIds: ['opt-a'] }, ['opt-b']);
    expect(result).toEqual({ isCorrect: false, marksAwarded: 0 });
  });

  it('awards full marks for an exact multi-option match regardless of order', () => {
    const result = gradeAnswer({ marks: 4, negativeMarks: 0, correctOptionIds: ['opt-a', 'opt-b'] }, ['opt-b', 'opt-a']);
    expect(result).toEqual({ isCorrect: true, marksAwarded: 4 });
  });

  it('awards zero marks for a partial multi-option match (all-or-nothing)', () => {
    const result = gradeAnswer({ marks: 4, negativeMarks: 0, correctOptionIds: ['opt-a', 'opt-b'] }, ['opt-a']);
    expect(result).toEqual({ isCorrect: false, marksAwarded: 0 });
  });

  it('awards zero marks when an extra incorrect option is included alongside the correct ones', () => {
    const result = gradeAnswer({ marks: 4, negativeMarks: 0, correctOptionIds: ['opt-a', 'opt-b'] }, ['opt-a', 'opt-b', 'opt-c']);
    expect(result).toEqual({ isCorrect: false, marksAwarded: 0 });
  });

  it('awards zero marks for an empty selection even when negativeMarks is set (no penalty for skipping)', () => {
    const result = gradeAnswer({ marks: 5, negativeMarks: 2, correctOptionIds: ['opt-a'] }, []);
    expect(result).toEqual({ isCorrect: false, marksAwarded: 0 });
  });

  it('deducts negativeMarks for a wrong selected answer', () => {
    const result = gradeAnswer({ marks: 5, negativeMarks: 2, correctOptionIds: ['opt-a'] }, ['opt-b']);
    expect(result).toEqual({ isCorrect: false, marksAwarded: -2 });
  });

  it('deducts negativeMarks for a partial multi-option selection (still wrong, still attempted)', () => {
    const result = gradeAnswer({ marks: 4, negativeMarks: 1, correctOptionIds: ['opt-a', 'opt-b'] }, ['opt-a']);
    expect(result).toEqual({ isCorrect: false, marksAwarded: -1 });
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

  it('floors a negative raw score at zero instead of returning a negative score or percentage', () => {
    const summary = computeResult([{ marksAwarded: 3 }, { marksAwarded: -5 }], [{ marks: 3 }, { marks: 3 }], 50);
    expect(summary).toEqual({ score: 0, maxScore: 6, percentage: 0, passFail: 'fail' });
  });

  it('does not floor a positive score that is merely reduced by a deduction', () => {
    const summary = computeResult([{ marksAwarded: 5 }, { marksAwarded: -2 }], [{ marks: 5 }, { marks: 5 }], 20);
    expect(summary).toEqual({ score: 3, maxScore: 10, percentage: 30, passFail: 'pass' });
  });
});

describe('computeRemainingSeconds', () => {
  it('returns a positive value before the exam duration has elapsed', () => {
    const startedAt = new Date(Date.now() - 5 * 60_000);
    const seconds = computeRemainingSeconds(30, startedAt);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(25 * 60);
  });

  it('returns zero (not negative) once the duration has elapsed', () => {
    const startedAt = new Date(Date.now() - 60 * 60_000);
    expect(computeRemainingSeconds(30, startedAt)).toBe(0);
  });

  it('extends the deadline by pausedDurationMs', () => {
    const startedAt = new Date(Date.now() - 40 * 60_000); // 40 min ago, on a 30-min exam — would be expired
    const seconds = computeRemainingSeconds(30, startedAt, 15 * 60_000); // but 15 min of pause time is credited back
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(5 * 60);
  });

  it('freezes at the value computed at frozenAt, ignoring the real current time', () => {
    const startedAt = new Date(Date.now() - 10 * 60_000);
    const frozenAt = new Date(Date.now() - 5 * 60_000); // pause began 5 min ago
    const seconds = computeRemainingSeconds(30, startedAt, 0, frozenAt);
    // Same call a moment "later" (real Date.now() has advanced) must return the identical value.
    const secondsAgain = computeRemainingSeconds(30, startedAt, 0, frozenAt);
    expect(seconds).toBe(secondsAgain);
    expect(seconds).toBe(25 * 60); // 30 min duration - 5 min elapsed at the moment it froze
  });
});

describe('effectiveDurationMinutes', () => {
  it('returns the raw duration when extraTimePercent is 0', () => {
    expect(effectiveDurationMinutes(60, 0)).toBe(60);
  });

  it('applies a percentage bonus', () => {
    expect(effectiveDurationMinutes(60, 50)).toBe(90);
  });

  it('rounds to the nearest whole minute', () => {
    expect(effectiveDurationMinutes(45, 33)).toBe(60);
  });
});
