import { networkOf } from './attendance.service';
import type { Fence } from './time-maths';

// Extra · My attendance today, OutsideNetwork: what the clock card knows before any punch.
const office: Fence = { locationId: 'l1', name: 'Chennai office', lat: null, lng: null, radiusM: null, ipRanges: ['10.20.4.0/24'] };
const fenced: Fence = { ...office, lat: 12.98, lng: 80.24, radiusM: 200 };

describe('networkOf', () => {
  it('on an office network: inside', () => expect(networkOf([office], '10.20.4.17', 'restricted')).toBe('inside'));
  it('networks only and this IP is not one: outside', () => expect(networkOf([office], '203.0.113.9', 'restricted')).toBe('outside'));
  it('no IP at all: outside', () => expect(networkOf([office], null, 'restricted')).toBe('outside'));
  it('a geofence can still let them in at the punch: unknown', () => expect(networkOf([fenced], '203.0.113.9', 'restricted')).toBe('unknown'));
  it('field check-in or no networks: unknown', () => {
    expect(networkOf([office], '203.0.113.9', 'field')).toBe('unknown');
    expect(networkOf([{ ...office, ipRanges: [] }], '203.0.113.9', 'restricted')).toBe('unknown');
  });
});
