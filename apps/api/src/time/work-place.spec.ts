import { dayPlace, placeOf } from './time-rules';

// Batch A A9 (answer 2312): office, remote or unknown per punch, and a day's place by the company's rule.
describe('the place of a punch', () => {
  it('office network, inside a geofence, a kiosk or a biometric reader is office', () => {
    expect(placeOf({ source: 'web', verdict: 'inside', accepted: true })).toBe('office');
    expect(placeOf({ source: 'web', verdict: 'network', accepted: true })).toBe('office');
    expect(placeOf({ source: 'kiosk', verdict: 'inside', accepted: true })).toBe('office');
    expect(placeOf({ source: 'biometric', verdict: 'no_fence', accepted: true })).toBe('office');
  });
  it('a location recorded outside every office (work from home, field) is remote', () => {
    expect(placeOf({ source: 'web', verdict: 'field', accepted: true })).toBe('remote');
    expect(placeOf({ source: 'mobile', verdict: 'field', accepted: true })).toBe('remote');
  });
  it('nothing restricting the place, or a refused punch, is unknown', () => {
    expect(placeOf({ source: 'web', verdict: 'no_fence', accepted: true })).toBe('unknown');
    expect(placeOf({ source: 'web', verdict: 'inside', accepted: false })).toBe('unknown');
    expect(placeOf({ source: 'web', verdict: 'outside', accepted: false })).toBe('unknown');
  });
});

describe('the place of a day', () => {
  it('a day of one kind is that kind whatever the rule; no known punch is unknown', () => {
    for (const rule of ['office_wins', 'remote_wins', 'first_punch'] as const) {
      expect(dayPlace(['office', 'office'], rule)).toBe('office');
      expect(dayPlace(['remote', 'unknown'], rule)).toBe('remote');
      expect(dayPlace([], rule)).toBe('unknown');
      expect(dayPlace(['unknown'], rule)).toBe('unknown');
    }
  });
  it('a day with both follows the rule: office wins (default), remote wins, or the first known punch', () => {
    expect(dayPlace(['remote', 'office'], 'office_wins')).toBe('office');
    expect(dayPlace(['office', 'remote'], 'remote_wins')).toBe('remote');
    expect(dayPlace(['unknown', 'remote', 'office'], 'first_punch')).toBe('remote');
    expect(dayPlace(['office', 'remote'], 'first_punch')).toBe('office');
  });
});
