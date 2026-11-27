import { downForMaintenance } from './yx-availability';

const w = { phase: 'now' as const, title: 'Upgrade', startsAt: '2026-11-27T17:30:00Z', endsAt: '2026-11-27T19:30:00Z' };
const during = new Date('2026-11-27T18:00:00Z');

describe('downForMaintenance', () => {
  it('is down only during the window while the API does not answer', () => {
    expect(downForMaintenance(w, true, during)).toBe(true);
  });
  it('is not down when the API answers, without a window, or outside it', () => {
    expect(downForMaintenance(w, false, during)).toBe(false);
    expect(downForMaintenance(null, true, during)).toBe(false);
    expect(downForMaintenance(w, true, new Date('2026-11-27T17:00:00Z'))).toBe(false);
    expect(downForMaintenance(w, true, new Date('2026-11-27T19:30:00Z'))).toBe(false);
  });
});
