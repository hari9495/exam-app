import { CalendarSpec } from './business-time';
import { Clock, dueMilestones, elapsed, milestonePercents, nextMilestone, reachesAt, scopeMatches, segments, targetSeconds, TicketFacts } from './sla-engine';

// §15.2 SLA: scope AND / OR, targets by priority, pause and resume across business hours, holidays and half days,
// milestones that fire once and in order, and the timeline picture.
const H = 3600;
const ist: CalendarSpec = {
  zone: 'Asia/Kolkata',
  hours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 18 * 60, validFrom: '2020-01-01', validTo: null })),
  holidays: [{ on: '2026-10-20', halfDay: false }, { on: '2026-10-21', halfDay: true }],
};
const at = (iso: string) => new Date(iso);
const facts: TicketFacts = { priority: 2, categoryId: 'cat-net', typeId: 'type-inc', kind: 'incident', channel: 'portal', groupId: null, vip: false, tags: ['vpn'] };

describe('SLA engine (§8)', () => {
  it('matches scope rules with AND and OR, and no rules matches everything', () => {
    expect(scopeMatches(undefined, facts)).toBe(true);
    const p1or2 = { field: 'priority' as const, op: 'in' as const, values: ['1', '2'] };
    const vip = { field: 'vip' as const, op: 'in' as const, values: ['true'] };
    expect(scopeMatches({ match: 'all', rules: [p1or2, vip] }, facts)).toBe(false);
    expect(scopeMatches({ match: 'any', rules: [p1or2, vip] }, facts)).toBe(true);
    expect(scopeMatches({ match: 'all', rules: [{ field: 'tag', op: 'not_in', values: ['vpn'] }] }, facts)).toBe(false);
  });

  it('reads the target for the ticket priority', () => {
    expect(targetSeconds({ metric: 'resolution', minutes: [240, 480, null, 2400] }, 2)).toBe(8 * H);
    expect(targetSeconds({ metric: 'resolution', minutes: [240, 480, null, 2400] }, 3)).toBeNull();
  });

  it('counts only business time, pauses and resumes across the night, a holiday and a half day', () => {
    // Started Mon 19 Oct 16:00 IST, target 8 h. Running till 18:00 (2 h), paused (waiting on requester) overnight,
    // resumed Wed 21 Oct 09:00 (Tue is a holiday, Wed a half day 09:00-13:30).
    let c: Clock = { state: 'running', resumedAt: at('2026-10-19T16:00:00+05:30'), usedSeconds: 0, targetSeconds: 8 * H };
    expect(elapsed(ist, c, at('2026-10-19T18:00:00+05:30'))).toBe(2 * H);
    c = { ...c, state: 'paused', resumedAt: null, usedSeconds: 2 * H };
    expect(elapsed(ist, c, at('2026-10-21T12:00:00+05:30'))).toBe(2 * H);
    c = { ...c, state: 'running', resumedAt: at('2026-10-21T09:00:00+05:30') };
    // 4.5 h on the half day, then Thursday 09:00 + 1.5 h = 10:30 for the full 8 h.
    expect(reachesAt(ist, c, 100)).toEqual(at('2026-10-22T10:30:00+05:30'));
    expect(elapsed(ist, c, at('2026-10-21T17:00:00+05:30'))).toBe(6.5 * H);
  });

  it('fires each milestone once, in order, and always has the breach at 100 %', () => {
    const target = { milestones: [{ percent: 50, actions: [] }, { percent: 150, actions: [] }] };
    expect(milestonePercents(target)).toEqual([50, 100, 150]);
    expect(milestonePercents({})).toEqual([75, 100]);
    const c: Clock = { state: 'running', resumedAt: at('2026-10-05T09:00:00+05:30'), usedSeconds: 0, targetSeconds: 4 * H };
    // A job that wakes late at 14:00 (5 h in): 50 and 100 are both due, 150 is not (needs 6 h).
    expect(dueMilestones(ist, c, target, [], at('2026-10-05T14:00:00+05:30'))).toEqual([50, 100]);
    expect(dueMilestones(ist, c, target, [50, 100], at('2026-10-05T14:00:00+05:30'))).toEqual([]);
    expect(nextMilestone(ist, c, target, [50, 100])).toEqual({ percent: 150, at: at('2026-10-05T15:00:00+05:30') });
    expect(dueMilestones(ist, { ...c, state: 'paused', resumedAt: null }, target, [], at('2026-10-05T14:00:00+05:30'))).toEqual([]);
  });

  it('draws running, paused and breached stretches with the pause reason', () => {
    const s = segments(
      [
        { kind: 'start', at: at('2026-10-05T09:00:00Z') },
        { kind: 'pause', at: at('2026-10-05T10:00:00Z'), reason: 'Waiting on requester' },
        { kind: 'resume', at: at('2026-10-05T12:00:00Z') },
      ],
      at('2026-10-05T13:00:00Z'),
      at('2026-10-05T14:00:00Z'),
    );
    expect(s.map((x) => [x.state, x.from.toISOString().slice(11, 16), x.to.toISOString().slice(11, 16), x.reason ?? null])).toEqual([
      ['running', '09:00', '10:00', null],
      ['paused', '10:00', '12:00', 'Waiting on requester'],
      ['running', '12:00', '13:00', null],
      ['breached', '13:00', '14:00', null],
    ]);
  });
});
