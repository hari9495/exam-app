import { assignDay, freeCells, memberOnTwoPanels, slotProblem } from './interview-day-rules';

describe('HIR-27 interview day rules', () => {
  const panels = ['A', 'B'];
  const slots = [645, 600];

  it('by_slot fills the earliest slot across every panel first (as drawn)', () => {
    expect(freeCells(panels, slots, 'by_slot', [])).toEqual([{ panelId: 'A', start: 600 }, { panelId: 'B', start: 600 }, { panelId: 'A', start: 645 }, { panelId: 'B', start: 645 }]);
  });

  it('by_panel fills one panel before the next', () => {
    expect(freeCells(panels, slots, 'by_panel', [])).toEqual([{ panelId: 'A', start: 600 }, { panelId: 'A', start: 645 }, { panelId: 'B', start: 600 }, { panelId: 'B', start: 645 }]);
  });

  it('skips cells already taken by sent rows', () => {
    expect(freeCells(panels, slots, 'by_slot', [{ panelId: 'B', start: 600 }])).toEqual([{ panelId: 'A', start: 600 }, { panelId: 'A', start: 645 }, { panelId: 'B', start: 645 }]);
  });

  it('over capacity: the rest do not fit; under capacity: free cells stay free; none: all wait', () => {
    const cells = freeCells(panels, slots, 'by_slot', []);
    expect(assignDay(['p1', 'p2', 'p3', 'p4', 'p5'], cells)).toEqual({ assigned: expect.arrayContaining([expect.objectContaining({ candidate: 'p4', panelId: 'B', start: 645 })]), unassigned: ['p5'] });
    expect(assignDay(['p1'], cells)).toEqual({ assigned: [{ candidate: 'p1', panelId: 'A', start: 600 }], unassigned: [] });
    expect(assignDay(['p1'], [])).toEqual({ assigned: [], unassigned: ['p1'] });
  });

  it('slots: 1 to 20, a time of day, distinct, not overlapping, ending by midnight', () => {
    expect(slotProblem([600, 645], 45)).toBeNull();
    expect(slotProblem([], 45)).toMatch(/1 to 20/);
    expect(slotProblem(Array.from({ length: 21 }, (_, i) => i * 60), 30)).toMatch(/1 to 20/);
    expect(slotProblem([1440], 45)).toMatch(/time of day/);
    expect(slotProblem([600.5], 45)).toMatch(/time of day/);
    expect(slotProblem([600, 600], 45)).toMatch(/same time/);
    expect(slotProblem([600, 644], 45)).toMatch(/overlap/);
    expect(slotProblem([1395], 45)).toBeNull(); // 23:15 + 45 = midnight exactly
    expect(slotProblem([1396], 45)).toMatch(/midnight/);
  });

  it('a member on two panels is refused; the same member twice in one panel is fine', () => {
    expect(memberOnTwoPanels([{ memberUserIds: ['u1', 'u1'] }, { memberUserIds: ['u2'] }])).toBeNull();
    expect(memberOnTwoPanels([{ memberUserIds: ['u1'] }, { memberUserIds: ['u2', 'u1'] }])).toBe('u1');
  });
});
