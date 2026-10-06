import { ForbiddenException, Logger } from '@nestjs/common';
import { assertHuman } from './bot-challenge';

describe('assertHuman (Turnstile bot challenge, ASVS V2.2.1)', () => {
  const saved = process.env.TURNSTILE_SECRET_KEY;
  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    fetchMock = jest.spyOn(globalThis, 'fetch');
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (saved === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = saved;
  });

  it('is inert until configured', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    await expect(assertHuman(undefined, null)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a missing token without calling out, and a token the service rejects', async () => {
    await expect(assertHuman(undefined, '203.0.113.1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] })));
    await expect(assertHuman('forged', '203.0.113.1')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'BOT_CHALLENGE_FAILED' }) });
  });

  it('accepts a token the service vouches for, sending the secret and client IP server-side only', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true })));
    await expect(assertHuman('good-token', '203.0.113.1')).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({ secret: 'test-secret', response: 'good-token', remoteip: '203.0.113.1' });
  });

  it('fails open (logged) when the service cannot be reached: the lockout still applies', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(assertHuman('token', null)).resolves.toBeUndefined();
    expect(Logger.prototype.error).toHaveBeenCalled();
  });
});
