import { isValidIpRange, isIpAllowed } from './ip-range';

describe('isValidIpRange', () => {
  it.each(['203.0.113.4', '2001:db8::1', '203.0.113.0/24', '203.0.113.0/0', '203.0.113.0/32', '2001:db8::/32'])(
    'accepts %s',
    (range) => expect(isValidIpRange(range)).toBe(true),
  );

  it.each(['', 'not-an-ip', '203.0.113.0/33', '203.0.113.0/-1', '203.0.113.0/', '/24', '203.0.113.4 extra', '999.0.0.1'])(
    'rejects %s',
    (range) => expect(isValidIpRange(range)).toBe(false),
  );
});

describe('isIpAllowed', () => {
  it('matches an exact bare IPv4', () => {
    expect(isIpAllowed('203.0.113.4', '203.0.113.4')).toBe(true);
    expect(isIpAllowed('203.0.113.5', '203.0.113.4')).toBe(false);
  });

  it('matches inside/outside an IPv4 CIDR', () => {
    expect(isIpAllowed('203.0.113.200', '203.0.113.0/24')).toBe(true);
    expect(isIpAllowed('203.0.114.1', '203.0.113.0/24')).toBe(false);
  });

  it('normalizes IPv4-mapped IPv6 client addresses', () => {
    expect(isIpAllowed('::ffff:203.0.113.4', '203.0.113.0/24')).toBe(true);
    expect(isIpAllowed('::ffff:203.0.114.1', '203.0.113.0/24')).toBe(false);
  });

  it('matches IPv6 CIDR', () => {
    expect(isIpAllowed('2001:db8::abcd', '2001:db8::/32')).toBe(true);
    expect(isIpAllowed('2001:db9::1', '2001:db8::/32')).toBe(false);
  });

  it('fails closed on a malformed range', () => {
    expect(isIpAllowed('203.0.113.4', 'garbage')).toBe(false);
    expect(isIpAllowed('203.0.113.4', '203.0.113.0/99')).toBe(false);
  });

  it('fails closed on an unparseable client ip', () => {
    expect(isIpAllowed('not-an-ip', '203.0.113.0/24')).toBe(false);
  });
});
