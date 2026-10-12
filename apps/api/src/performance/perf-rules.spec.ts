import { bandFor, bandsProblem, krProblem, krProgress, scaleProblem, templateProblem, weightedProgress, wouldCycle, type SectionIn } from './perf-rules';

const L = (...labels: string[]) => labels.map((label, i) => ({ value: i + 1, label }));

describe('performance PM1: rating scales (PM-1.02)', () => {
  it('a 1–5 scale needs a label for every whole point, on its step, inside its range', () => {
    expect(scaleProblem(1, 5, 1, L('a', 'b', 'c', 'd', 'e'))).toBeNull();
    expect(scaleProblem(1, 5, 1, L('a', 'b', 'c', 'd'))).toBe('Add a label for the rating 5.');
    expect(scaleProblem(1, 5, 1, [...L('a', 'b', 'c', 'd', 'e'), { value: 3.5, label: 'x' }])).toBe("The rating 3.5 is not on the scale's whole points.");
    expect(scaleProblem(1, 5, 0.5, [...L('a', 'b', 'c', 'd', 'e'), { value: 3.5, label: 'x' }])).toBeNull();
    expect(scaleProblem(1, 5, 1, [...L('a', 'b', 'c', 'd', 'e'), { value: 6, label: 'x' }])).toBe('The rating 6 is outside 1–5.');
    expect(scaleProblem(5, 1, 1, [])).toBe('The highest rating must be above the lowest.');
  });

  it('bands run from the lowest to the highest rating with no gap and no overlap', () => {
    const ok = [
      { fromScore: 1, toScore: 2.49, label: 'Needs improvement' },
      { fromScore: 2.5, toScore: 3.49, label: 'Meets' },
      { fromScore: 3.5, toScore: 5, label: 'Exceeds' },
    ];
    expect(bandsProblem(1, 5, ok)).toBeNull();
    expect(bandsProblem(1, 5, [ok[0], { ...ok[1], fromScore: 2.6 }, ok[2]])).toBe('There is a gap between Needs improvement and Meets.');
    expect(bandsProblem(1, 5, [ok[0], { ...ok[1], fromScore: 2.4 }, ok[2]])).toBe('The bands Needs improvement and Meets overlap.');
    expect(bandsProblem(1, 5, [ok[0], ok[1]])).toBe('The last band must end at 5.');
    expect(bandFor(ok, 3.495)?.label).toBe('Exceeds');
    expect(bandFor(ok, 2.5)?.label).toBe('Meets');
  });
});

describe('performance PM1: templates (PM-1.03, PF-D7)', () => {
  const s = (o: Partial<SectionIn>): SectionIn => ({ kind: 'goals', title: 'Goals', weight: 0, rated: true, whoAnswers: ['self', 'manager'], questions: [], ...o });

  it('weighted scoring: rated weights must add up to exactly 100', () => {
    expect(templateProblem('weighted', [s({ weight: 60 }), s({ kind: 'competencies', title: 'Competencies', weight: 40 })])).toBeNull();
    expect(templateProblem('weighted', [s({ weight: 60 }), s({ kind: 'competencies', title: 'Competencies', weight: 30 })])).toBe('The weights of rated sections add up to 90, not 100.');
    expect(templateProblem('weighted', [s({ weight: 33.33 }), s({ title: 'B', weight: 33.33 }), s({ title: 'C', weight: 33.34 })])).toBeNull();
  });

  it('an unrated section has no weight; question sections need questions', () => {
    expect(templateProblem('weighted', [s({ weight: 100 }), s({ kind: 'questions', title: 'Comments', rated: false, weight: 10, questions: [{ text: 'Anything else?', answer: 'text' }] })])).toBe('Comments is not rated, so it has no weight.');
    expect(templateProblem('weighted', [s({ weight: 100 }), s({ kind: 'questions', title: 'Comments', rated: false })])).toBe('Comments needs at least one question.');
  });

  it('manager-overall scoring needs a rated overall section the manager answers', () => {
    expect(templateProblem('manager_overall', [s({ rated: false }), s({ kind: 'overall', title: 'Overall', whoAnswers: ['manager'] })])).toBeNull();
    expect(templateProblem('manager_overall', [s({})])).toBe('Manager-overall scoring needs a rated overall section the manager answers.');
  });
});

describe('performance PM2: goal progress (PM-2.01, YX-PERF-01)', () => {
  it('a key result counts the share of the way from start to target, capped at 0–100', () => {
    expect(krProgress({ direction: 'up', start: 0, target: 3, current: 2 })).toBe(66.67);
    expect(krProgress({ direction: 'up', start: 0, target: 3, current: 5 })).toBe(100);
    expect(krProgress({ direction: 'down', start: 40, target: 10, current: 25 })).toBe(50);
    expect(krProgress({ direction: 'down', start: 40, target: 10, current: 50 })).toBe(0);
    expect(krProgress({ direction: 'hit', start: 0, target: 1, current: 1 })).toBe(100);
    expect(krProblem({ direction: 'up', start: 5, target: 5 })).toMatch(/above its start/);
    expect(krProblem({ direction: 'down', start: 5, target: 9 })).toMatch(/below its start/);
  });

  it('a goal is the weighted average of its key results or children; zero weights count equally', () => {
    expect(weightedProgress([{ progress: 100, weight: 3 }, { progress: 0, weight: 1 }])).toBe(75);
    expect(weightedProgress([{ progress: 100, weight: 0 }, { progress: 50, weight: 0 }])).toBe(75);
    expect(weightedProgress([])).toBe(0);
  });

  it('a parent chain that comes back to the goal is a loop', () => {
    const parentOf = new Map<string, string | null>([['a', 'b'], ['b', 'c'], ['c', null]]);
    expect(wouldCycle('c', 'a', parentOf)).toBe(true);
    expect(wouldCycle('x', 'a', parentOf)).toBe(false);
  });
});
