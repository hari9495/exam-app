import { observedDifficulty, calibrateDifficulty } from './difficulty-calibration';

describe('observedDifficulty', () => {
  it('bands proportion-correct: high p = easy, low p = hard, middle = medium', () => {
    expect(observedDifficulty(0.95)).toBe('easy');
    expect(observedDifficulty(0.8)).toBe('easy');
    expect(observedDifficulty(0.65)).toBe('medium');
    expect(observedDifficulty(0.5)).toBe('hard');
    expect(observedDifficulty(0.2)).toBe('hard');
  });
});

describe('calibrateDifficulty', () => {
  it('is aligned when declared matches observed', () => {
    expect(calibrateDifficulty('easy', 0.9)).toEqual({ observed: 'easy', verdict: 'aligned', gap: 0 });
    expect(calibrateDifficulty('hard', 0.3)).toEqual({ observed: 'hard', verdict: 'aligned', gap: 0 });
  });

  it('flags a labeled-hard item everyone gets right as easier than labeled (gap 2)', () => {
    expect(calibrateDifficulty('hard', 0.92)).toEqual({ observed: 'easy', verdict: 'easier_than_labeled', gap: 2 });
  });

  it('flags a labeled-easy item most people miss as harder than labeled (gap 2)', () => {
    expect(calibrateDifficulty('easy', 0.3)).toEqual({ observed: 'hard', verdict: 'harder_than_labeled', gap: 2 });
  });

  it('reports one-band drift', () => {
    expect(calibrateDifficulty('easy', 0.65)).toEqual({ observed: 'medium', verdict: 'harder_than_labeled', gap: 1 });
  });

  it('treats an unknown declared label as medium (never throws)', () => {
    expect(calibrateDifficulty('impossible', 0.9)).toEqual({ observed: 'easy', verdict: 'easier_than_labeled', gap: 1 });
  });
});
