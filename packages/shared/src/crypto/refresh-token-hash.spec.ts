import { createHash } from 'crypto';
import { hashRefreshToken, isLegacyArgon2Hash, refreshTokenMatches } from './refresh-token-hash';

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmMiLCJmYW1pbHlJZCI6IjEyMyJ9.sig';

describe('hashRefreshToken', () => {
  it('produces a hex sha256 digest', () => {
    expect(hashRefreshToken(TOKEN)).toBe(createHash('sha256').update(TOKEN).digest('hex'));
    expect(hashRefreshToken(TOKEN)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never stores the token itself', () => {
    expect(hashRefreshToken(TOKEN)).not.toContain(TOKEN);
  });
});

describe('refreshTokenMatches', () => {
  it('accepts the token that produced the hash', () => {
    expect(refreshTokenMatches(hashRefreshToken(TOKEN), TOKEN)).toBe(true);
  });

  it('rejects any other token', () => {
    expect(refreshTokenMatches(hashRefreshToken(TOKEN), TOKEN + 'x')).toBe(false);
    expect(refreshTokenMatches(hashRefreshToken(TOKEN), '')).toBe(false);
  });

  it('rejects a legacy argon2 hash without throwing', () => {
    // Not valid hex, so it decodes to a buffer of the wrong length. This must
    // return false rather than throw inside timingSafeEqual, which would turn a
    // stale session into a 500.
    const argon2Hash = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$aGFzaHZhbHVl';
    expect(() => refreshTokenMatches(argon2Hash, TOKEN)).not.toThrow();
    expect(refreshTokenMatches(argon2Hash, TOKEN)).toBe(false);
  });

  it('rejects malformed stored values without throwing', () => {
    for (const bad of ['', 'zzzz', 'abc', 'not-hex-at-all']) {
      expect(() => refreshTokenMatches(bad, TOKEN)).not.toThrow();
      expect(refreshTokenMatches(bad, TOKEN)).toBe(false);
    }
  });
});

describe('isLegacyArgon2Hash', () => {
  it('recognises pre-cutover rows so they are retired, not flagged as reuse', () => {
    expect(isLegacyArgon2Hash('$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA')).toBe(true);
    expect(isLegacyArgon2Hash('$argon2i$v=19$m=4096,t=3,p=1$c2FsdA$aGFzaA')).toBe(true);
  });

  it('does not misclassify a current sha256 hash', () => {
    expect(isLegacyArgon2Hash(hashRefreshToken(TOKEN))).toBe(false);
  });
});
