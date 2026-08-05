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
  // A single 100%-weighted section covering every question makes the weighted formula
  // arithmetically identical to the old flat one -- which is what keeps the pre-weighting
  // expectations below (and every historical Result row) unchanged.
  const oneSection = (questionIds: string[], weightPercent = 100) => [{ sectionId: 's1', weightPercent, questionIds }];

  it('computes score, maxScore, percentage, and pass when meeting the pass criteria', () => {
    const summary = computeResult(
      [{ questionId: 'q1', marksAwarded: 5 }, { questionId: 'q2', marksAwarded: 0 }],
      [{ id: 'q1', marks: 5 }, { id: 'q2', marks: 5 }],
      50,
      oneSection(['q1', 'q2']),
    );
    expect(summary).toEqual({ score: 5, maxScore: 10, percentage: 50, passFail: 'pass' });
  });

  it('returns fail when below the pass criteria', () => {
    const summary = computeResult(
      [{ questionId: 'q1', marksAwarded: 2 }],
      [{ id: 'q1', marks: 10 }],
      50,
      oneSection(['q1']),
    );
    expect(summary).toEqual({ score: 2, maxScore: 10, percentage: 20, passFail: 'fail' });
  });

  it('counts an unanswered question toward maxScore but contributes nothing to score', () => {
    const summary = computeResult(
      [{ questionId: 'q1', marksAwarded: 3 }],
      [{ id: 'q1', marks: 3 }, { id: 'q2', marks: 7 }],
      40,
      oneSection(['q1', 'q2']),
    );
    expect(summary).toEqual({ score: 3, maxScore: 10, percentage: 30, passFail: 'fail' });
  });

  it('returns a zero percentage instead of dividing by zero when there are no questions', () => {
    const summary = computeResult([], [], 40, []);
    expect(summary).toEqual({ score: 0, maxScore: 0, percentage: 0, passFail: 'fail' });
  });

  it('floors a negative raw score at zero instead of returning a negative score or percentage', () => {
    const summary = computeResult(
      [{ questionId: 'q1', marksAwarded: 3 }, { questionId: 'q2', marksAwarded: -5 }],
      [{ id: 'q1', marks: 3 }, { id: 'q2', marks: 3 }],
      50,
      oneSection(['q1', 'q2']),
    );
    expect(summary).toEqual({ score: 0, maxScore: 6, percentage: 0, passFail: 'fail' });
  });

  it('does not floor a positive score that is merely reduced by a deduction', () => {
    const summary = computeResult(
      [{ questionId: 'q1', marksAwarded: 5 }, { questionId: 'q2', marksAwarded: -2 }],
      [{ id: 'q1', marks: 5 }, { id: 'q2', marks: 5 }],
      20,
      oneSection(['q1', 'q2']),
    );
    expect(summary).toEqual({ score: 3, maxScore: 10, percentage: 30, passFail: 'pass' });
  });

  it('weights two sections independently of their raw marks -- a heavier-weighted section with a lower score pulls the overall percentage down', () => {
    // Section A: 1/1 marks (100% raw) but only worth 30% of the grade.
    // Section B: 0/1 marks (0% raw) but worth 70% of the grade.
    // Flat (unweighted) would be 1/2 = 50%; weighted must be 0.3*100 + 0.7*0 = 30%.
    const summary = computeResult(
      [{ questionId: 'a1', marksAwarded: 1 }, { questionId: 'b1', marksAwarded: 0 }],
      [{ id: 'a1', marks: 1 }, { id: 'b1', marks: 1 }],
      50,
      [
        { sectionId: 'A', weightPercent: 30, questionIds: ['a1'] },
        { sectionId: 'B', weightPercent: 70, questionIds: ['b1'] },
      ],
    );
    expect(summary.score).toBe(1);
    expect(summary.maxScore).toBe(2);
    expect(summary.percentage).toBe(30);
    expect(summary.passFail).toBe('fail');
  });

  it('floors a negative section score at zero before weighting, so one section cannot drag another negative', () => {
    // Section A: -3 raw (negative marks exceed correct marks) but weighted 50% -- contributes 0, not negative.
    // Section B: full marks, weighted 50% -- contributes 50.
    const summary = computeResult(
      [{ questionId: 'a1', marksAwarded: -3 }, { questionId: 'b1', marksAwarded: 5 }],
      [{ id: 'a1', marks: 2 }, { id: 'b1', marks: 5 }],
      40,
      [
        { sectionId: 'A', weightPercent: 50, questionIds: ['a1'] },
        { sectionId: 'B', weightPercent: 50, questionIds: ['b1'] },
      ],
    );
    expect(summary.percentage).toBe(50);
    expect(summary.passFail).toBe('pass');
  });

  it('contributes zero for a section with no marks available, without dividing by zero', () => {
    const summary = computeResult(
      [{ questionId: 'a1', marksAwarded: 5 }],
      [{ id: 'a1', marks: 5 }],
      40,
      [
        { sectionId: 'A', weightPercent: 50, questionIds: ['a1'] },
        { sectionId: 'B', weightPercent: 50, questionIds: [] }, // empty section, e.g. all-code section pre-manual-grading
      ],
    );
    expect(summary.percentage).toBe(50); // only A's 50% contributes; B's 50% share earns 0
  });

  it('scores only the best N of a section, out of N', () => {
    // 5 questions worth 10 each, answer any 3. Awarded 10/10/7/0/0.
    // Best 3 = 27 out of 30 = 90% of a 100%-weighted section.
    const summary = computeResult(
      [
        { questionId: 'q1', marksAwarded: 10 },
        { questionId: 'q2', marksAwarded: 10 },
        { questionId: 'q3', marksAwarded: 7 },
        { questionId: 'q4', marksAwarded: 0 },
        { questionId: 'q5', marksAwarded: 0 },
      ],
      [
        { id: 'q1', marks: 10 }, { id: 'q2', marks: 10 }, { id: 'q3', marks: 10 },
        { id: 'q4', marks: 10 }, { id: 'q5', marks: 10 },
      ],
      50,
      [{ sectionId: 's1', weightPercent: 100, requiredCount: 3, questionIds: ['q1', 'q2', 'q3', 'q4', 'q5'] }],
    );
    expect(summary.percentage).toBe(90);
    expect(summary.score).toBe(27);
    expect(summary.maxScore).toBe(30);
  });

  it('reports score/maxScore as the counted totals, not the raw totals over every question', () => {
    // Raw would be 27/50. Counted must be 27/30 -- otherwise the headline numbers contradict
    // the percentage printed beside them in the recruiter report.
    const summary = computeResult(
      [{ questionId: 'q1', marksAwarded: 27 }],
      [
        { id: 'q1', marks: 10 }, { id: 'q2', marks: 10 }, { id: 'q3', marks: 10 },
        { id: 'q4', marks: 10 }, { id: 'q5', marks: 10 },
      ],
      50,
      [{ sectionId: 's1', weightPercent: 100, requiredCount: 3, questionIds: ['q1', 'q2', 'q3', 'q4', 'q5'] }],
    );
    expect(summary.maxScore).toBe(30);
  });

  it('leaves a section with no requiredCount scoring every question, exactly as before', () => {
    const summary = computeResult(
      [{ questionId: 'q1', marksAwarded: 5 }, { questionId: 'q2', marksAwarded: 0 }],
      [{ id: 'q1', marks: 5 }, { id: 'q2', marks: 5 }],
      50,
      [{ sectionId: 's1', weightPercent: 100, requiredCount: null, questionIds: ['q1', 'q2'] }],
    );
    expect(summary).toEqual({ score: 5, maxScore: 10, percentage: 50, passFail: 'pass' });
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
