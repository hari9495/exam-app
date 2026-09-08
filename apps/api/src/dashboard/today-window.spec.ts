import { dayWindow, isValidTimeZone } from './today-window';

describe('dayWindow', () => {
  it('uses UTC midnight when the zone is UTC', () => {
    const w = dayWindow(new Date('2026-09-08T10:00:00Z'), 'UTC');
    expect(w.iso).toBe('2026-09-08');
    expect(w.start.toISOString()).toBe('2026-09-08T00:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-09-09T00:00:00.000Z');
  });
  it('places a late-UTC instant in the NEXT local day for Asia/Kolkata (+05:30)', () => {
    const w = dayWindow(new Date('2026-09-08T18:31:00Z'), 'Asia/Kolkata'); // 00:01 local on the 9th
    expect(w.iso).toBe('2026-09-09');
    expect(w.start.toISOString()).toBe('2026-09-08T18:30:00.000Z');
    expect(w.end.toISOString()).toBe('2026-09-09T18:30:00.000Z');
  });
  it('keeps an instant before local midnight in the current local day', () => {
    const w = dayWindow(new Date('2026-09-08T18:00:00Z'), 'Asia/Kolkata'); // 23:30 local on the 8th
    expect(w.iso).toBe('2026-09-08');
    expect(w.start.toISOString()).toBe('2026-09-07T18:30:00.000Z');
  });
  it('falls back to UTC for an invalid or missing zone', () => {
    expect(dayWindow(new Date('2026-09-08T10:00:00Z'), 'Mars/Olympus').timeZone).toBe('UTC');
    expect(dayWindow(new Date('2026-09-08T10:00:00Z'), null).timeZone).toBe('UTC');
    expect(isValidTimeZone('Europe/Berlin')).toBe(true);
    expect(isValidTimeZone('nope')).toBe(false);
  });
});
