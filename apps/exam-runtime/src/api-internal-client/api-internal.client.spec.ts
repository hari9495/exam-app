import { ApiInternalClient } from './api-internal.client';

describe('ApiInternalClient', () => {
  const originalFetch = global.fetch;
  const originalApiInternalUrl = process.env.API_INTERNAL_URL;
  const originalSecret = process.env.INTERNAL_SERVICE_SECRET;
  let fetchMock: jest.Mock;
  let client: ApiInternalClient;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    process.env.API_INTERNAL_URL = 'http://localhost:3501/api/v1';
    process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret';
    client = new ApiInternalClient();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.API_INTERNAL_URL = originalApiInternalUrl;
    process.env.INTERNAL_SERVICE_SECRET = originalSecret;
  });

  it('posts the webhook payload with the internal secret header', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 });

    await client.dispatchWebhook('org-1', 'attempt.settled', { attemptId: 'attempt-1' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3501/api/v1/internal/webhooks/dispatch',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': 'test-internal-secret' },
        body: JSON.stringify({ organizationId: 'org-1', eventType: 'attempt.settled', data: { attemptId: 'attempt-1' } }),
      }),
    );
  });

  it('never throws when the fetch call itself rejects (network error)', async () => {
    fetchMock.mockRejectedValue(new Error('network unreachable'));

    await expect(client.dispatchWebhook('org-1', 'attempt.settled', { attemptId: 'attempt-1' })).resolves.toBeUndefined();
  });

  it('never throws when apps/api responds with a non-2xx status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(client.dispatchWebhook('org-1', 'attempt.settled', { attemptId: 'attempt-1' })).resolves.toBeUndefined();
  });
});
