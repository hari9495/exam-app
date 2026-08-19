import {
  parseRubric,
  validateRubricInput,
  computeCriteriaHash,
  buildFitToolSchema,
  buildFitPrompt,
  validateFitResult,
  RubricDimension,
} from './candidate-fit.core';

describe('candidate-fit.core', () => {
  const job = { title: 'Backend Engineer', description: 'Build APIs', fitCriteria: null, fitRubric: null };
  const profile = { parsedSummary: 'Senior dev', parsedSkills: ['Node', 'SQL'], parsedTitle: 'Engineer', parsedYearsExperience: 6 };

  describe('parseRubric', () => {
    it('returns [] for null / blank / malformed', () => {
      expect(parseRubric(null)).toEqual([]);
      expect(parseRubric('')).toEqual([]);
      expect(parseRubric('not json')).toEqual([]);
      expect(parseRubric('{}')).toEqual([]);
    });
    it('parses a valid rubric array', () => {
      expect(parseRubric('[{"label":"Python","weight":60},{"label":"AWS","weight":40}]')).toEqual([
        { label: 'Python', weight: 60 },
        { label: 'AWS', weight: 40 },
      ]);
    });
    it('drops entries with a non-string label or non-number weight', () => {
      expect(parseRubric('[{"label":"OK","weight":100},{"label":5,"weight":"x"}]')).toEqual([{ label: 'OK', weight: 100 }]);
    });
  });

  describe('validateRubricInput', () => {
    it('accepts an empty list (no rubric)', () => {
      expect(validateRubricInput([])).toEqual([]);
    });
    it('accepts weights summing to 100', () => {
      expect(validateRubricInput([{ label: 'A', weight: 70 }, { label: 'B', weight: 30 }])).toHaveLength(2);
    });
    it('rejects weights not summing to 100', () => {
      expect(() => validateRubricInput([{ label: 'A', weight: 50 }])).toThrow(/sum to 100/i);
    });
    it('rejects an empty label', () => {
      expect(() => validateRubricInput([{ label: '  ', weight: 100 }])).toThrow(/label/i);
    });
    it('rejects a non-integer / negative weight', () => {
      expect(() => validateRubricInput([{ label: 'A', weight: 33.3 }, { label: 'B', weight: 66.7 }])).toThrow(/integer/i);
      expect(() => validateRubricInput([{ label: 'A', weight: -5 }, { label: 'B', weight: 105 }])).toThrow();
    });
  });

  describe('computeCriteriaHash', () => {
    it('is stable for the same inputs and changes when title/description/criteria/rubric change', () => {
      const base = computeCriteriaHash(job);
      expect(computeCriteriaHash(job)).toBe(base);
      expect(computeCriteriaHash({ ...job, title: 'Frontend Engineer' })).not.toBe(base);
      expect(computeCriteriaHash({ ...job, description: 'Other' })).not.toBe(base);
      expect(computeCriteriaHash({ ...job, fitCriteria: 'Must know Rust' })).not.toBe(base);
      expect(computeCriteriaHash({ ...job, fitRubric: '[{"label":"A","weight":100}]' })).not.toBe(base);
    });
  });

  describe('buildFitToolSchema', () => {
    it('omits dimensionScores when there is no rubric', () => {
      const schema = buildFitToolSchema([]) as any;
      expect(schema.properties.dimensionScores).toBeUndefined();
      expect(schema.required).toContain('overallScore');
    });
    it('includes dimensionScores when a rubric exists', () => {
      const schema = buildFitToolSchema([{ label: 'Python', weight: 100 }]) as any;
      expect(schema.properties.dimensionScores).toBeDefined();
    });
  });

  describe('buildFitPrompt', () => {
    it('includes job + profile, and the rubric labels when present, but never an exam score', () => {
      const prompt = buildFitPrompt(
        { ...job, fitCriteria: 'Ship fast', fitRubric: '[{"label":"Python","weight":100}]' },
        profile,
        [{ label: 'Python', weight: 100 }],
      );
      expect(prompt).toContain('Backend Engineer');
      expect(prompt).toContain('Ship fast');
      expect(prompt).toContain('Python');
      expect(prompt).toContain('Senior dev');
      expect(prompt.toLowerCase()).toContain('do not');
      expect(prompt.toLowerCase()).not.toContain('exam score');
    });
  });

  describe('validateFitResult', () => {
    const good = { overallScore: 82, summary: 'Strong', strengths: ['a'], concerns: ['b'] };
    it('accepts a well-formed result with no rubric (dimensionScores null)', () => {
      const r = validateFitResult(good, []);
      expect(r).toEqual({ overallScore: 82, summary: 'Strong', strengths: ['a'], concerns: ['b'], dimensionScores: null });
    });
    it('clamps overallScore into 0..100', () => {
      expect(validateFitResult({ ...good, overallScore: 140 }, []).overallScore).toBe(100);
      expect(validateFitResult({ ...good, overallScore: -3 }, []).overallScore).toBe(0);
    });
    it('throws when summary is missing/not a string', () => {
      expect(() => validateFitResult({ ...good, summary: 5 }, [])).toThrow(/malformed/i);
    });
    it('merges rubric weights into dimensionScores and clamps each score', () => {
      const rubric: RubricDimension[] = [{ label: 'Python', weight: 70 }, { label: 'AWS', weight: 30 }];
      const raw = { ...good, dimensionScores: [{ label: 'Python', score: 90 }, { label: 'AWS', score: 250 }] };
      expect(validateFitResult(raw, rubric).dimensionScores).toEqual([
        { label: 'Python', weight: 70, score: 90 },
        { label: 'AWS', weight: 30, score: 100 },
      ]);
    });
    it('fills a missing dimension score with 0 rather than throwing', () => {
      const rubric: RubricDimension[] = [{ label: 'Python', weight: 100 }];
      const raw = { ...good, dimensionScores: [] };
      expect(validateFitResult(raw, rubric).dimensionScores).toEqual([{ label: 'Python', weight: 100, score: 0 }]);
    });
  });
});
