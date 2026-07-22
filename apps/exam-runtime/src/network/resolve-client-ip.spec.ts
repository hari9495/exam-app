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
  const originalTrustProxy = process.env.TRUST_PROXY;
  afterEach(() => {
    process.env.TRUST_PROXY = originalTrustProxy;
  });

  it('returns req.ip by default', () => {
    delete process.env.TRUST_PROXY;
    expect(resolveClientIp(fakeReq({ ip: '203.0.113.4', xff: '198.51.100.1' }))).toBe('203.0.113.4');
  });

  it('falls back to socket.remoteAddress when req.ip is missing', () => {
    delete process.env.TRUST_PROXY;
    expect(resolveClientIp(fakeReq({ remoteAddress: '203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('uses the first X-Forwarded-For hop only when TRUST_PROXY=true', () => {
    process.env.TRUST_PROXY = 'true';
    expect(resolveClientIp(fakeReq({ ip: '10.0.0.1', xff: '198.51.100.1, 10.0.0.1' }))).toBe('198.51.100.1');
  });

  it('ignores an absent X-Forwarded-For even with TRUST_PROXY=true', () => {
    process.env.TRUST_PROXY = 'true';
    expect(resolveClientIp(fakeReq({ ip: '203.0.113.4' }))).toBe('203.0.113.4');
  });
});
