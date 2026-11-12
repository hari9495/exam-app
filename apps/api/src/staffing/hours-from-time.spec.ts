import { minutesForClient } from './hours-from-time';

// Parked item 914 (answer 1408): a placement counts only its client's project lines.
describe('minutesForClient', () => {
  const line = (projectClientId: string | null, minutes: number[], status: string | null = 'approved', approvedMinutes: number[] = []) => ({ projectClientId, minutes, status, approvedMinutes });

  it("counts only the client's own project lines, as approved (reduced lines at their approved minutes)", () => {
    const lines = [line('A', [480, 0, 0, 0, 0, 0, 0]), line('B', [0, 480, 0, 0, 0, 0, 0]), line('A', [0, 0, 240, 0, 0, 0, 0], 'reduced', [0, 0, 120, 0, 0, 0, 0]), line(null, [0, 0, 0, 60, 0, 0, 0])];
    expect(minutesForClient('A', 1260, lines)).toBe(600);
    expect(minutesForClient('B', 1260, lines)).toBe(480);
  });

  it('nothing for a client with no lines of its own, or only rejected ones', () => {
    expect(minutesForClient('C', 960, [line('A', [480, 0, 0, 0, 0, 0, 0]), line(null, [480, 0, 0, 0, 0, 0, 0])])).toBeNull();
    expect(minutesForClient('A', 480, [line('A', [480, 0, 0, 0, 0, 0, 0], 'rejected'), line('B', [60, 0, 0, 0, 0, 0, 0])])).toBeNull();
  });

  it('a week with no client-linked lines (or no lines) still counts whole, as before', () => {
    expect(minutesForClient('A', 2430, [])).toBe(2430);
    expect(minutesForClient('A', 600, [line(null, [600, 0, 0, 0, 0, 0, 0])])).toBe(600);
    expect(minutesForClient('A', 0, [])).toBeNull();
  });
});
