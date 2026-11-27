import { doneTaskGrowth, parseExtraStages, stageOf, taskStages } from './task-stages';

describe('T2-D 56 task stages (answer 2865)', () => {
  it('orders the board To do, In progress, the company stages, Done', () => {
    expect(taskStages('Review, QA').map((s) => s.label)).toEqual(['To do', 'In progress', 'Review', 'QA', 'Done']);
    expect(taskStages('').map((s) => s.id)).toEqual(['todo', 'in_progress', 'done']);
  });

  it('negative: more than 3, a long name or a repeat is refused', () => {
    expect(() => parseExtraStages('A, B, C, D')).toThrow('At most 3');
    expect(() => parseExtraStages('x'.repeat(21))).toThrow('longer than 20');
    expect(() => parseExtraStages('Review, review')).toThrow('already a stage');
    expect(() => parseExtraStages('Done')).toThrow('already a stage');
    // A bad stored value never breaks the board: only the fixed stages.
    expect(taskStages('A, B, C, D').length).toBe(3);
  });

  it('a stage the company removed shows as To do', () => {
    const s = taskStages('Review');
    expect(stageOf('Review', s)).toBe('Review');
    expect(stageOf('Old', s)).toBe('todo');
  });

  it('a Done task: only days whose hours grew are refused', () => {
    expect(doneTaskGrowth([60, 0, 0, 0, 0, 0, 0], [60, 0, 0, 0, 0, 0, 0])).toEqual([]);
    expect(doneTaskGrowth([60, 0, 0, 0, 0, 0, 0], [30, 0, 0, 0, 0, 0, 0])).toEqual([]);
    expect(doneTaskGrowth([60, 0, 0, 0, 0, 0, 0], [60, 30, 0, 0, 0, 0, 0])).toEqual([1]);
  });
});
