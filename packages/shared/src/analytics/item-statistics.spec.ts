import { pointBiserial, classifyFlags, MIN_RESPONSES, ItemAggregate, OptionCount } from './item-statistics';

function agg(overrides: Partial<ItemAggregate> = {}): ItemAggregate {
  return { questionId: 'q1', n: 40, p: 0.5, m1: 60, m0: 40, sdRest: 10, ...overrides };
}

describe('pointBiserial', () => {
  // Worked by hand: r = (60 - 40) / 10 * sqrt(0.5 * 0.5) = 2 * 0.5 = 1.0
  it('computes the standard formula', () => {
    expect(pointBiserial(agg())).toBeCloseTo(1.0, 5);
  });

  // r = (55 - 45) / 20 * sqrt(0.6 * 0.4) = 0.5 * 0.4898979 = 0.2449490
  it('computes a realistic mid-range value', () => {
    expect(pointBiserial(agg({ p: 0.6, m1: 55, m0: 45, sdRest: 20 }))).toBeCloseTo(0.244949, 5);
  });

  // The miskeyed detector. If the sign convention ever flips, this is what catches it.
  it('goes negative when weaker candidates outperform stronger ones on the item', () => {
    const r = pointBiserial(agg({ m1: 40, m0: 60 }));
    expect(r).not.toBeNull();
    expect(r as number).toBeLessThan(0);
  });

  // Undefined, NOT zero -- zero would file it under "weak discrimination".
  it.each([
    ['everyone correct', { p: 1, m0: null }],
    ['everyone wrong', { p: 0, m1: null }],
    ['no spread in rest-scores', { sdRest: 0 }],
  ])('returns null when discrimination is undefined (%s)', (_label, overrides) => {
    expect(pointBiserial(agg(overrides as Partial<ItemAggregate>))).toBeNull();
  });

  // A mismapped SQL column (Number(undefined)) produces NaN, not undefined. Every guard
  // above is a comparison against NaN, which is always false, so NaN alone would sail
  // through them all and come out as a NaN "correlation" -- worse than null, because
  // downstream comparisons against NaN are also always false, and the item would show no
  // flags at all instead of being reported as unmeasurable.
  it.each([
    ['p', { p: NaN }],
    ['m1', { m1: NaN }],
    ['m0', { m0: NaN }],
    ['sdRest', { sdRest: NaN }],
  ])('returns null (not NaN) when %s is NaN', (_label, overrides) => {
    expect(pointBiserial(agg(overrides as Partial<ItemAggregate>))).toBeNull();
  });

  // A standard deviation can never be negative. Upstream corruption that produces one would
  // flip the sign of the correlation rather than merely being ignored like sdRest === 0.
  it('returns null when sdRest is negative', () => {
    expect(pointBiserial(agg({ sdRest: -10 }))).toBeNull();
  });

  // Ties the regression together end to end: a corrupted field (sdRest) makes the
  // discrimination unmeasurable, but the item must not come back reported as flag-free just
  // because one input was garbage. The independent p-based check still catches it.
  it('an item with a NaN-corrupted field is not silently reported flag-free', () => {
    const corruptAgg = agg({ p: 0.15, sdRest: NaN });
    const discrimination = pointBiserial(corruptAgg);
    expect(discrimination).toBeNull();

    const goodOptions: OptionCount[] = [
      { optionId: 'a', isCorrect: true, selections: 6 },
      { optionId: 'b', isCorrect: false, selections: 17 },
      { optionId: 'c', isCorrect: false, selections: 17 },
    ];
    const flags = classifyFlags(corruptAgg, discrimination, goodOptions).map((f) => f.code);
    expect(flags).not.toEqual([]);
    expect(flags).toContain('very_hard');
  });
});

describe('classifyFlags', () => {
  const goodOptions: OptionCount[] = [
    { optionId: 'a', isCorrect: true, selections: 20 },
    { optionId: 'b', isCorrect: false, selections: 10 },
    { optionId: 'c', isCorrect: false, selections: 10 },
  ];

  it('flags negative discrimination as critical', () => {
    const flags = classifyFlags(agg(), -0.15, goodOptions);
    const flag = flags.find((f) => f.code === 'miskeyed_suspect');
    expect(flag).toBeDefined();
    expect(flag?.severity).toBe('critical');
  });

  it('flags weak discrimination as a warning', () => {
    expect(classifyFlags(agg(), 0.1, goodOptions).map((f) => f.code)).toContain('weak_discrimination');
  });

  it('does not flag discrimination at or above 0.20', () => {
    const codes = classifyFlags(agg(), 0.2, goodOptions).map((f) => f.code);
    expect(codes).not.toContain('weak_discrimination');
    expect(codes).not.toContain('miskeyed_suspect');
  });

  it('flags a too-easy item', () => {
    expect(classifyFlags(agg({ p: 0.97 }), null, goodOptions).map((f) => f.code)).toContain('too_easy');
  });

  // Boundary: the rule is `p > 0.95`, strict. Exactly 0.95 must not flag.
  it('does not flag too-easy at exactly p = 0.95', () => {
    expect(classifyFlags(agg({ p: 0.95 }), null, goodOptions).map((f) => f.code)).not.toContain('too_easy');
  });

  it('flags a very hard item', () => {
    expect(classifyFlags(agg({ p: 0.15 }), 0.3, goodOptions).map((f) => f.code)).toContain('very_hard');
  });

  // Boundary: the rule is `p < 0.20`, strict. Exactly 0.20 must not flag.
  it('does not flag very-hard at exactly p = 0.20', () => {
    expect(classifyFlags(agg({ p: 0.2 }), 0.3, goodOptions).map((f) => f.code)).not.toContain('very_hard');
  });

  // Boundary between "critical, tell someone now" and "warning": the rule is `r < 0` for
  // critical. Exactly 0 must land as weak_discrimination, not miskeyed_suspect.
  it('classifies discrimination = 0 exactly as weak, not miskeyed', () => {
    const codes = classifyFlags(agg(), 0, goodOptions).map((f) => f.code);
    expect(codes).toContain('weak_discrimination');
    expect(codes).not.toContain('miskeyed_suspect');
  });

  it('flags a distractor chosen more often than the correct answer', () => {
    const options: OptionCount[] = [
      { optionId: 'a', isCorrect: true, selections: 8 },
      { optionId: 'b', isCorrect: false, selections: 25 },
    ];
    expect(classifyFlags(agg({ p: 0.24 }), 0.3, options).map((f) => f.code)).toContain('ambiguous_option');
  });

  it('flags a distractor nobody chose', () => {
    const options: OptionCount[] = [
      { optionId: 'a', isCorrect: true, selections: 30 },
      { optionId: 'b', isCorrect: false, selections: 10 },
      { optionId: 'c', isCorrect: false, selections: 0 },
    ];
    expect(classifyFlags(agg(), 0.3, options).map((f) => f.code)).toContain('dead_distractor');
  });

  it('never flags a dead distractor against the correct option', () => {
    const options: OptionCount[] = [
      { optionId: 'a', isCorrect: true, selections: 0 },
      { optionId: 'b', isCorrect: false, selections: 40 },
    ];
    expect(classifyFlags(agg({ p: 0 }), null, options).map((f) => f.code)).not.toContain('dead_distractor');
  });

  it('returns no flags for a healthy item', () => {
    expect(classifyFlags(agg({ p: 0.6 }), 0.45, goodOptions)).toEqual([]);
  });
});

describe('MIN_RESPONSES', () => {
  it('is 20', () => {
    expect(MIN_RESPONSES).toBe(20);
  });
});
