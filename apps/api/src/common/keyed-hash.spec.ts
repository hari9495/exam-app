import { keyedHash } from './keyed-hash';

describe('keyedHash (security review F10)', () => {
  const env = { JWT_ACCESS_SECRET: 'a-test-secret-of-good-length-0123456789' };
  it('is stable per purpose and value, and different per purpose and per secret (positive)', () => {
    expect(keyedHash('visitor-person', 'x', env)).toMatch(/^[0-9a-f]{64}$/);
    expect(keyedHash('visitor-person', 'x', env)).toBe(keyedHash('visitor-person', 'x', env));
    expect(keyedHash('visitor-person', 'x', env)).not.toBe(keyedHash('consent-ip', 'x', env));
    expect(keyedHash('visitor-person', 'x', env)).not.toBe(keyedHash('visitor-person', 'x', { JWT_ACCESS_SECRET: 'another-secret-entirely-0123456789' }));
  });
  it('never falls back to a key in the code: no secret, no hash (negative)', () => {
    expect(() => keyedHash('visitor-person', 'x', {})).toThrow('JWT_ACCESS_SECRET is required');
  });
});
