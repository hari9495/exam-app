import { humanizeHttpError, NetworkError } from './http-error-message';

describe('humanizeHttpError', () => {
  it('passes hand-written server messages through untouched', () => {
    expect(humanizeHttpError(400, 'Logo must be a PNG, JPEG, or SVG image')).toBe(
      'Logo must be a PNG, JPEG, or SVG image',
    );
    expect(humanizeHttpError(401, 'Invalid credentials')).toBe('Invalid credentials');
    expect(humanizeHttpError(401, 'This account has been deactivated')).toBe('This account has been deactivated');
  });

  it('joins class-validator arrays into sentences instead of a comma run', () => {
    expect(humanizeHttpError(400, ['name should not be empty', 'primaryColor must be a hex color'])).toBe(
      'name should not be empty. primaryColor must be a hex color.',
    );
  });

  it('replaces NestJS defaults with a sentence for people', () => {
    expect(humanizeHttpError(403, 'Forbidden resource')).toMatch(/don't have permission/);
    expect(humanizeHttpError(500, 'Internal server error')).toMatch(/on our side/);
    expect(humanizeHttpError(429, 'ThrottlerException: Too Many Requests')).toMatch(/wait a minute/);
  });

  it('handles the empty body from a non-JSON gateway error page', () => {
    // nginx 502/504 pages are HTML; the client parses {} and message is undefined.
    expect(humanizeHttpError(502, undefined)).toMatch(/on our side/);
    expect(humanizeHttpError(504, undefined)).toMatch(/on our side/);
  });

  it('maps bare 401s to a session-expiry hint (every login failure has a custom message)', () => {
    expect(humanizeHttpError(401, 'Unauthorized')).toMatch(/log in again/);
  });

  it('falls back to a generic sentence with the code for unmapped statuses', () => {
    expect(humanizeHttpError(418, undefined)).toContain('418');
  });
});

describe('NetworkError', () => {
  it('remains a TypeError so lib/retry.ts still treats it as retryable', () => {
    const err = new NetworkError();
    expect(err instanceof TypeError).toBe(true);
    expect(err.message).toMatch(/internet connection/);
  });
});
