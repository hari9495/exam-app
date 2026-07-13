import { apiFetch, setUnauthorizedHandler } from './api-client';

describe('apiFetch', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    setUnauthorizedHandler(null);
  });

  it('retries once with a fresh token after a 401, using the registered unauthorized handler', async () => {
    const calls: (string | undefined)[] = [];
    global.fetch = jest.fn(async (_url, options) => {
      const auth = (options?.headers as Record<string, string>)?.Authorization;
      calls.push(auth);
      const status = auth === 'Bearer old' ? 401 : 200;
      return new Response(JSON.stringify({ ok: true }), { status });
    }) as unknown as typeof fetch;

    setUnauthorizedHandler(async () => 'new');

    const result = await apiFetch('/exams', {}, 'old');
    expect(calls).toEqual(['Bearer old', 'Bearer new']);
    expect(result).toEqual({ ok: true });
  });

  it('throws with the server-provided message when a request fails and is not a retryable 401', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ message: 'Not found' }), { status: 404 })) as unknown as typeof fetch;

    await expect(apiFetch('/exams/missing')).rejects.toThrow('Not found');
  });
});
