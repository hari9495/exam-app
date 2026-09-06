import { BadRequestException } from '@nestjs/common';
import {
  BlueprintContext,
  BlueprintRule,
  evaluateBlueprint,
  parseChecklist,
  parseRules,
  validateBlueprintRules,
} from './blueprint-rules';

describe('parseRules', () => {
  it('parses a valid JSON array into rules', () => {
    const json = JSON.stringify([{ id: 'r1', type: 'feedback', minCount: 2 }]);
    expect(parseRules(json)).toEqual([{ id: 'r1', type: 'feedback', minCount: 2 }]);
  });

  it('returns [] for null', () => {
    expect(parseRules(null)).toEqual([]);
  });

  it('returns [] for undefined', () => {
    expect(parseRules(undefined)).toEqual([]);
  });

  it('returns [] for empty string', () => {
    expect(parseRules('')).toEqual([]);
  });

  it('returns [] for invalid JSON', () => {
    expect(parseRules('{not json')).toEqual([]);
  });

  it('returns [] for valid JSON that is not an array', () => {
    expect(parseRules(JSON.stringify({ id: 'r1' }))).toEqual([]);
  });
});

describe('parseChecklist', () => {
  it('parses a valid JSON object into a map', () => {
    const json = JSON.stringify({ a: true, b: false });
    expect(parseChecklist(json)).toEqual({ a: true, b: false });
  });

  it('returns {} for null', () => {
    expect(parseChecklist(null)).toEqual({});
  });

  it('returns {} for undefined', () => {
    expect(parseChecklist(undefined)).toEqual({});
  });

  it('returns {} for empty string', () => {
    expect(parseChecklist('')).toEqual({});
  });

  it('returns {} for invalid JSON', () => {
    expect(parseChecklist('{not json')).toEqual({});
  });

  it('returns {} for a JSON array (not an object map)', () => {
    expect(parseChecklist(JSON.stringify([1, 2, 3]))).toEqual({});
  });
});

describe('validateBlueprintRules', () => {
  it('accepts a valid mixed array of rules', () => {
    const rules = [
      { id: 'r1', type: 'feedback', minCount: 1, minAvgRating: 3, requireNote: true },
      { id: 'r2', type: 'exam_passed', examId: 'exam-1', minScore: 70 },
      { id: 'r3', type: 'checklist', items: [{ id: 'i1', label: 'Do thing' }] },
    ];
    expect(validateBlueprintRules(rules)).toEqual(rules);
  });

  it('rejects a non-array input', () => {
    expect(() => validateBlueprintRules({ id: 'r1' })).toThrow(BadRequestException);
  });

  it('rejects a rule with an unknown type', () => {
    expect(() => validateBlueprintRules([{ id: 'r1', type: 'bogus' }])).toThrow(BadRequestException);
  });

  it('rejects a rule missing an id', () => {
    expect(() => validateBlueprintRules([{ type: 'feedback' }])).toThrow(BadRequestException);
  });

  it('rejects a checklist rule without items', () => {
    expect(() => validateBlueprintRules([{ id: 'r1', type: 'checklist' }])).toThrow(BadRequestException);
  });

  it('rejects a checklist rule with an empty items array', () => {
    expect(() => validateBlueprintRules([{ id: 'r1', type: 'checklist', items: [] }])).toThrow(BadRequestException);
  });

  it('rejects a feedback rule with a non-number minCount', () => {
    expect(() => validateBlueprintRules([{ id: 'r1', type: 'feedback', minCount: '2' }])).toThrow(BadRequestException);
  });

  it('rejects a feedback rule with a non-number minAvgRating', () => {
    expect(() => validateBlueprintRules([{ id: 'r1', type: 'feedback', minAvgRating: 'high' }])).toThrow(BadRequestException);
  });

  it('rejects an exam_passed rule with a non-string examId', () => {
    expect(() => validateBlueprintRules([{ id: 'r1', type: 'exam_passed', examId: 123 }])).toThrow(BadRequestException);
  });

  it('rejects an exam_passed rule with a non-number minScore', () => {
    expect(() => validateBlueprintRules([{ id: 'r1', type: 'exam_passed', minScore: '80' }])).toThrow(BadRequestException);
  });

  it('rejects a checklist rule whose item has a non-string id', () => {
    expect(() =>
      validateBlueprintRules([{ id: 'r1', type: 'checklist', items: [{ id: 1, label: 'Do thing' }] }]),
    ).toThrow(BadRequestException);
  });

  it('rejects a checklist rule whose item has a non-string label', () => {
    expect(() =>
      validateBlueprintRules([{ id: 'r1', type: 'checklist', items: [{ id: 'i1', label: 42 }] }]),
    ).toThrow(BadRequestException);
  });
});

describe('evaluateBlueprint', () => {
  const baseCtx: BlueprintContext = {
    feedback: [],
    examResults: [],
    checklistTicks: {},
  };

  it('returns [] for empty rules', () => {
    expect(evaluateBlueprint([], baseCtx)).toEqual([]);
  });

  describe('feedback rules', () => {
    it('minCount unmet returns a message', () => {
      const rules: BlueprintRule[] = [{ id: 'r1', type: 'feedback', minCount: 2 }];
      const ctx: BlueprintContext = { ...baseCtx, feedback: [{ rating: 4, note: null }] };
      const result = evaluateBlueprint(rules, ctx);
      expect(result).toHaveLength(1);
      expect(result[0]).toContain('2');
    });

    it('minCount met returns []', () => {
      const rules: BlueprintRule[] = [{ id: 'r1', type: 'feedback', minCount: 2 }];
      const ctx: BlueprintContext = {
        ...baseCtx,
        feedback: [
          { rating: 4, note: null },
          { rating: 5, note: null },
        ],
      };
      expect(evaluateBlueprint(rules, ctx)).toEqual([]);
    });

    it('minAvgRating unmet (average of non-null ratings below threshold) returns a message', () => {
      const rules: BlueprintRule[] = [{ id: 'r1', type: 'feedback', minAvgRating: 4 }];
      const ctx: BlueprintContext = {
        ...baseCtx,
        feedback: [
          { rating: 2, note: null },
          { rating: null, note: null },
        ],
      };
      const result = evaluateBlueprint(rules, ctx);
      expect(result).toHaveLength(1);
      expect(result[0]).toContain('4');
    });

    it('minAvgRating met returns []', () => {
      const rules: BlueprintRule[] = [{ id: 'r1', type: 'feedback', minAvgRating: 4 }];
      const ctx: BlueprintContext = {
        ...baseCtx,
        feedback: [
          { rating: 4, note: null },
          { rating: 5, note: null },
        ],
      };
      expect(evaluateBlueprint(rules, ctx)).toEqual([]);
    });

    it('minAvgRating with no ratings at all (all null) is unmet', () => {
      const rules: BlueprintRule[] = [{ id: 'r1', type: 'feedback', minAvgRating: 1 }];
      const ctx: BlueprintContext = { ...baseCtx, feedback: [{ rating: null, note: null }] };
      expect(evaluateBlueprint(rules, ctx)).toHaveLength(1);
    });

    it('requireNote with no non-empty note returns a message', () => {
      const rules: BlueprintRule[] = [{ id: 'r1', type: 'feedback', requireNote: true }];
      const ctx: BlueprintContext = {
        ...baseCtx,
        feedback: [
          { rating: 5, note: null },
          { rating: 5, note: '   ' },
        ],
      };
      const result = evaluateBlueprint(rules, ctx);
      expect(result).toHaveLength(1);
      expect(result[0]).toContain('note');
    });

    it('requireNote satisfied by a non-empty note returns []', () => {
      const rules: BlueprintRule[] = [{ id: 'r1', type: 'feedback', requireNote: true }];
      const ctx: BlueprintContext = { ...baseCtx, feedback: [{ rating: 5, note: 'great candidate' }] };
      expect(evaluateBlueprint(rules, ctx)).toEqual([]);
    });
  });

  describe('exam_passed rules', () => {
    it('with examId: exam not passed returns a message', () => {
      const rules: BlueprintRule[] = [{ id: 'r1', type: 'exam_passed', examId: 'exam-1' }];
      const ctx: BlueprintContext = {
        ...baseCtx,
        examResults: [{ examId: 'exam-1', passFail: 'fail', score: 40 }],
      };
      expect(evaluateBlueprint(rules, ctx)).toHaveLength(1);
    });

    it('with examId: exam passed returns []', () => {
      const rules: BlueprintRule[] = [{ id: 'r1', type: 'exam_passed', examId: 'exam-1' }];
      const ctx: BlueprintContext = {
        ...baseCtx,
        examResults: [{ examId: 'exam-1', passFail: 'pass', score: 90 }],
      };
      expect(evaluateBlueprint(rules, ctx)).toEqual([]);
    });

    it('with examId + minScore: passed but below minScore returns a message', () => {
      const rules: BlueprintRule[] = [{ id: 'r1', type: 'exam_passed', examId: 'exam-1', minScore: 80 }];
      const ctx: BlueprintContext = {
        ...baseCtx,
        examResults: [{ examId: 'exam-1', passFail: 'pass', score: 60 }],
      };
      expect(evaluateBlueprint(rules, ctx)).toHaveLength(1);
    });

    it('with examId + minScore: passed and above minScore returns []', () => {
      const rules: BlueprintRule[] = [{ id: 'r1', type: 'exam_passed', examId: 'exam-1', minScore: 80 }];
      const ctx: BlueprintContext = {
        ...baseCtx,
        examResults: [{ examId: 'exam-1', passFail: 'pass', score: 90 }],
      };
      expect(evaluateBlueprint(rules, ctx)).toEqual([]);
    });

    it('without examId: no linked exam passed returns a message', () => {
      const rules: BlueprintRule[] = [{ id: 'r1', type: 'exam_passed' }];
      const ctx: BlueprintContext = {
        ...baseCtx,
        examResults: [{ examId: 'exam-1', passFail: 'fail', score: 40 }],
      };
      expect(evaluateBlueprint(rules, ctx)).toHaveLength(1);
    });

    it('without examId: at least one passed returns []', () => {
      const rules: BlueprintRule[] = [{ id: 'r1', type: 'exam_passed' }];
      const ctx: BlueprintContext = {
        ...baseCtx,
        examResults: [
          { examId: 'exam-1', passFail: 'fail', score: 40 },
          { examId: 'exam-2', passFail: 'pass', score: 90 },
        ],
      };
      expect(evaluateBlueprint(rules, ctx)).toEqual([]);
    });
  });

  describe('checklist rules', () => {
    it('a missing item (absent from ticks) returns a message listing its label', () => {
      const rules: BlueprintRule[] = [
        {
          id: 'r1',
          type: 'checklist',
          items: [
            { id: 'i1', label: 'Verify ID' },
            { id: 'i2', label: 'Sign NDA' },
          ],
        },
      ];
      const ctx: BlueprintContext = { ...baseCtx, checklistTicks: { i1: true } };
      const result = evaluateBlueprint(rules, ctx);
      expect(result).toHaveLength(1);
      expect(result[0]).toContain('Sign NDA');
      expect(result[0]).not.toContain('Verify ID');
    });

    it('a false item returns a message listing its label', () => {
      const rules: BlueprintRule[] = [
        { id: 'r1', type: 'checklist', items: [{ id: 'i1', label: 'Verify ID' }] },
      ];
      const ctx: BlueprintContext = { ...baseCtx, checklistTicks: { i1: false } };
      const result = evaluateBlueprint(rules, ctx);
      expect(result).toHaveLength(1);
      expect(result[0]).toContain('Verify ID');
    });

    it('all items true returns []', () => {
      const rules: BlueprintRule[] = [
        {
          id: 'r1',
          type: 'checklist',
          items: [
            { id: 'i1', label: 'Verify ID' },
            { id: 'i2', label: 'Sign NDA' },
          ],
        },
      ];
      const ctx: BlueprintContext = { ...baseCtx, checklistTicks: { i1: true, i2: true } };
      expect(evaluateBlueprint(rules, ctx)).toEqual([]);
    });
  });

  it('treats a malformed rule (unknown type, past parse) as satisfied — never a false block', () => {
    const rules = [{ id: 'r1', type: 'not_a_real_type' }] as unknown as BlueprintRule[];
    expect(evaluateBlueprint(rules, baseCtx)).toEqual([]);
  });

  it('returns all messages when multiple rules are unmet', () => {
    const rules: BlueprintRule[] = [
      { id: 'r1', type: 'feedback', minCount: 3 },
      { id: 'r2', type: 'exam_passed', examId: 'exam-1' },
      { id: 'r3', type: 'checklist', items: [{ id: 'i1', label: 'Verify ID' }] },
    ];
    const ctx: BlueprintContext = {
      feedback: [],
      examResults: [{ examId: 'exam-1', passFail: 'fail', score: 10 }],
      checklistTicks: {},
    };
    const result = evaluateBlueprint(rules, ctx);
    expect(result).toHaveLength(3);
    expect(result).toContain('at least 3 feedback entries');
    expect(result).toContain('the required exam passed');
    expect(result).toContain('checklist: Verify ID');
  });
});
