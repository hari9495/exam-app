import { CandidateApiError } from './candidate-api-client';
import { RETRY_ATTEMPTS, isRetryableError, retryDelayMs, withRetry } from './retry';

describe('isRetryableError', () => {
  it('retries 5xx, which is what a retry can actually fix', () => {
    expect(isRetryableError(new CandidateApiError('busy', 503))).toBe(true);
    expect(isRetryableError(new CandidateApiError('boom', 500))).toBe(true);
  });

  it('does not retry 4xx -- the server has given its considered answer', () => {
    // A spent invitation is the case that matters: /candidate-auth/redeem
    // allows 5 requests per minute per IP, so retrying this would spend the
    // candidate's budget on a request that can never succeed.
    expect(isRetryableError(new CandidateApiError('This invitation has already been used.', 410))).toBe(false);
    expect(isRetryableError(new CandidateApiError('nope', 403))).toBe(false);
    expect(isRetryableError(new CandidateApiError('bad', 400))).toBe(false);
  });

  it('does not retry 429 -- being throttled is the signal to stop', () => {
    expect(isRetryableError(new CandidateApiError('Too many requests', 429))).toBe(false);
  });

  it('retries a fetch rejection, where no response arrived at all', () => {
    expect(isRetryableError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('does not retry an arbitrary error', () => {
    expect(isRetryableError(new Error('some bug'))).toBe(false);
  });
});

describe('retryDelayMs', () => {
  it("honours the server's Retry-After hint over its own backoff", () => {
    const withHint = new CandidateApiError('busy', 503, 3);
    // 3s +/- 25% jitter.
    for (let i = 0; i < 50; i++) {
      const delay = retryDelayMs(1, withHint);
      expect(delay).toBeGreaterThanOrEqual(2250);
      expect(delay).toBeLessThanOrEqual(3750);
    }
  });

  it('backs off exponentially when the server gives no hint', () => {
    const noHint = new CandidateApiError('busy', 503);
    // 500ms then 1000ms, each +/- 25%.
    expect(retryDelayMs(1, noHint)).toBeGreaterThanOrEqual(375);
    expect(retryDelayMs(1, noHint)).toBeLessThanOrEqual(625);
    expect(retryDelayMs(2, noHint)).toBeGreaterThanOrEqual(750);
    expect(retryDelayMs(2, noHint)).toBeLessThanOrEqual(1250);
  });

  it('jitters, so a shared Retry-After does not resynchronise every client', () => {
    const error = new CandidateApiError('busy', 503, 3);
    const delays = new Set(Array.from({ length: 25 }, () => retryDelayMs(1, error)));
    expect(delays.size).toBeGreaterThan(1);
  });
});

describe('withRetry', () => {
  beforeEach(() => jest.useFakeTimers({ advanceTimers: true }));
  afterEach(() => jest.useRealTimers());

  it('retries a 5xx and returns the eventual success', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new CandidateApiError('busy', 503))
      .mockResolvedValueOnce({ ok: true });

    await expect(withRetry(fn)).resolves.toEqual({ ok: true });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('gives up after RETRY_ATTEMPTS and surfaces the last error', async () => {
    const fn = jest.fn().mockRejectedValue(new CandidateApiError('busy', 503));

    await expect(withRetry(fn)).rejects.toThrow('busy');
    expect(fn).toHaveBeenCalledTimes(RETRY_ATTEMPTS);
  });

  it('does not retry a 4xx -- one call, budget intact', async () => {
    const fn = jest.fn().mockRejectedValue(new CandidateApiError('already used', 410));

    await expect(withRetry(fn)).rejects.toThrow('already used');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
