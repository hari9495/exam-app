import { createHash } from 'crypto';
import { sign } from 'jsonwebtoken';
import { candidateThrottleKey } from './candidate-throttle-key';

const SECRET = 'test-candidate-access-secret';
const hash = (v: string) => createHash('sha256').update(v).digest('hex').slice(0, 32);

describe('candidateThrottleKey', () => {
  const original = process.env.CANDIDATE_JWT_ACCESS_SECRET;
  beforeEach(() => {
    process.env.CANDIDATE_JWT_ACCESS_SECRET = SECRET;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CANDIDATE_JWT_ACCESS_SECRET;
    else process.env.CANDIDATE_JWT_ACCESS_SECRET = original;
  });

  it('keys an authenticated candidate on their invitation id', () => {
    const token = sign({ sub: 'inv-123', subjectType: 'candidate', familyId: 'f1' }, SECRET);
    expect(candidateThrottleKey({ headers: { authorization: `Bearer ${token}` } })).toBe('cand:inv-123');
  });

  it('gives two candidates behind the same IP different keys -- the whole point', () => {
    const a = sign({ sub: 'inv-A', subjectType: 'candidate', familyId: 'f' }, SECRET);
    const b = sign({ sub: 'inv-B', subjectType: 'candidate', familyId: 'f' }, SECRET);
    const keyA = candidateThrottleKey({ headers: { authorization: `Bearer ${a}` } });
    const keyB = candidateThrottleKey({ headers: { authorization: `Bearer ${b}` } });
    expect(keyA).not.toBe(keyB);
  });

  it('falls back to IP (null) for a forged token, rather than minting a fresh bucket', () => {
    const forged = sign({ sub: 'attacker', subjectType: 'candidate', familyId: 'f' }, 'WRONG-SECRET');
    expect(candidateThrottleKey({ headers: { authorization: `Bearer ${forged}` } })).toBeNull();
  });

  it('falls back to IP for an expired token', () => {
    const expired = sign({ sub: 'inv-1', subjectType: 'candidate', familyId: 'f' }, SECRET, { expiresIn: -10 });
    expect(candidateThrottleKey({ headers: { authorization: `Bearer ${expired}` } })).toBeNull();
  });

  it('falls back to IP when the token subject is not a candidate', () => {
    const staff = sign({ sub: 'user-1', subjectType: 'staff', familyId: 'f' }, SECRET);
    expect(candidateThrottleKey({ headers: { authorization: `Bearer ${staff}` } })).toBeNull();
  });

  it('keys redeem on a hash of the invite token, never the raw token', () => {
    const key = candidateThrottleKey({ body: { token: 'super-secret-invite-token' } });
    expect(key).toBe(`invtok:${hash('super-secret-invite-token')}`);
    expect(key).not.toContain('super-secret-invite-token');
  });

  it('keys refresh on a hash of the refresh cookie', () => {
    const key = candidateThrottleKey({ cookies: { candidate_refresh_token: 'rt-value' } });
    expect(key).toBe(`crt:${hash('rt-value')}`);
    expect(key).not.toContain('rt-value');
  });

  it('prefers the verified session over a token in the body', () => {
    const token = sign({ sub: 'inv-9', subjectType: 'candidate', familyId: 'f' }, SECRET);
    const key = candidateThrottleKey({ headers: { authorization: `Bearer ${token}` }, body: { token: 'x' } });
    expect(key).toBe('cand:inv-9');
  });

  it('returns null for an anonymous request, so the caller keys on IP', () => {
    expect(candidateThrottleKey({})).toBeNull();
    expect(candidateThrottleKey({ headers: {} })).toBeNull();
  });

  it('does not throw or key when the access secret is unset', () => {
    delete process.env.CANDIDATE_JWT_ACCESS_SECRET;
    const token = sign({ sub: 'inv-1', subjectType: 'candidate', familyId: 'f' }, SECRET);
    expect(candidateThrottleKey({ headers: { authorization: `Bearer ${token}` } })).toBeNull();
  });
});
