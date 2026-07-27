import { resolveClientIp } from './resolve-client-ip';
import type { Request } from 'express';

function fakeReq(overrides: { ip?: string; remoteAddress?: string; xff?: string }): Request {
  return {
    ip: overrides.ip,
    socket: { remoteAddress: overrides.remoteAddress },
    headers: overrides.xff !== undefined ? { 'x-forwarded-for': overrides.xff } : {},
  } as unknown as Request;
}

describe('resolveClientIp', () => {
  it('returns req.ip, which Express derives per the trust proxy setting', () => {
    expect(resolveClientIp(fakeReq({ ip: '203.0.113.4' }))).toBe('203.0.113.4');
  });

  it('falls back to the socket address when req.ip is missing', () => {
    expect(resolveClientIp(fakeReq({ remoteAddress: '203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('returns empty string when neither is available', () => {
    expect(resolveClientIp(fakeReq({}))).toBe('');
  });

  // The regression this file exists for. It used to parse X-Forwarded-For by
  // hand and take the FIRST entry. nginx appends the real peer via
  // proxy_add_x_forwarded_for, so for a client sending its own header the chain
  // reads "<forged>, <real peer>" and the first entry is whatever the attacker
  // chose -- enough to defeat an exam's IP allowlist and the rate limiter.
  // Express's trust-proxy hop counting decides req.ip now, so a forged header
  // must not change the answer here. See ADO #6820.
  it('ignores a forged X-Forwarded-For and never prefers it over req.ip', () => {
    const forged = fakeReq({ ip: '203.0.113.4', xff: '1.2.3.4, 203.0.113.4' });
    expect(resolveClientIp(forged)).toBe('203.0.113.4');
    expect(resolveClientIp(forged)).not.toBe('1.2.3.4');
  });

  it('does not consult the header even when req.ip is absent', () => {
    expect(resolveClientIp(fakeReq({ remoteAddress: '10.0.0.7', xff: '1.2.3.4' }))).toBe('10.0.0.7');
  });
});
