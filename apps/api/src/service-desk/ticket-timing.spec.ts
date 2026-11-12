import type { CalendarSpec } from './business-time';
import { moveCount, onHoldSeconds, replyGaps } from './ticket-timing';

// Answer 1648: fuller per-ticket timing, on the SLA engine's business time.
const H24: CalendarSpec = { zone: 'UTC', hours: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 0, endMinute: 1440, validFrom: '2000-01-01', validTo: null })), holidays: [] };
// Monday to Friday, 09:00 to 18:00 UTC.
const OFFICE: CalendarSpec = { zone: 'UTC', hours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 540, endMinute: 1080, validFrom: '2000-01-01', validTo: null })), holidays: [] };
const at = (s: string) => new Date(`2026-11-${s}Z`);

describe('ticket timing (1648)', () => {
  it('the average wait for an agent reply: from the opening or a requester message to the next agent reply', () => {
    // Opened 09:00; agent 10:00 (1 h); requester 11:00, requester 11:30, agent 13:00 (2 h from 11:00); agent 14:00 (no wait).
    const msgs = [
      { side: 'agent', at: at('09T10:00:00') },
      { side: 'requester', at: at('09T11:00:00') },
      { side: 'requester', at: at('09T11:30:00') },
      { side: 'agent', at: at('09T13:00:00') },
      { side: 'agent', at: at('09T14:00:00') },
      { side: 'system', at: at('09T15:00:00') },
    ];
    expect(replyGaps(H24, at('09T09:00:00'), msgs)).toEqual({ average: 5400, count: 2 }); // (3600 + 7200) / 2
    expect(replyGaps(H24, at('09T09:00:00'), [])).toEqual({ average: null, count: 0 });
  });

  it('counts business time only (the desk calendar)', () => {
    // Opened Friday 17:00, answered Monday 10:00: 1 h on Friday + 1 h on Monday.
    expect(replyGaps(OFFICE, at('13T17:00:00'), [{ side: 'agent', at: at('16T10:00:00') }]).average).toBe(7200);
  });

  it('time on hold: each stretch from going on hold to the next change, or now', () => {
    const spans = [
      { at: at('09T09:00:00'), onHold: false },
      { at: at('09T10:00:00'), onHold: true },
      { at: at('09T12:00:00'), onHold: false },
      { at: at('09T13:00:00'), onHold: true },
    ];
    expect(onHoldSeconds(H24, spans, at('09T13:30:00'))).toBe(2 * 3600 + 1800);
    expect(onHoldSeconds(H24, [{ at: at('09T09:00:00'), onHold: false }], at('09T13:30:00'))).toBe(0);
  });

  it('moves: queue changes and hand-overs, never the first assignment', () => {
    expect(
      moveCount([
        { kind: 'assigned', fromValue: null, toValue: 'u1' },
        { kind: 'group_changed', fromValue: 'g1', toValue: 'g2' },
        { kind: 'assigned', fromValue: 'u1', toValue: 'u2' },
        { kind: 'assigned', fromValue: 'u2', toValue: null },
        { kind: 'priority_changed', fromValue: '3', toValue: '2' },
      ]),
    ).toBe(3);
  });
});
