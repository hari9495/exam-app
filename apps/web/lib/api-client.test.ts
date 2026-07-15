import { apiFetch, apiFetchBlob, setUnauthorizedHandler } from './api-client';

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

  it('attaches the HTTP status code to the thrown error', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ message: 'Not found' }), { status: 404 })) as unknown as typeof fetch;

    try {
      await apiFetch('/exams/missing');
      throw new Error('expected apiFetch to throw');
    } catch (error) {
      expect((error as Error & { status?: number }).status).toBe(404);
    }
  });
});

describe('apiFetchBlob', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns the response body as a blob along with the filename from Content-Disposition', async () => {
    global.fetch = jest.fn(async () =>
      new Response(new Blob(['a,b,c'], { type: 'text/csv' }), {
        status: 200,
        headers: { 'Content-Disposition': 'attachment; filename="exam-123-results.csv"' },
      }),
    ) as unknown as typeof fetch;

    const result = await apiFetchBlob('/exams/123/results/export?format=csv', {}, 'tok');
    expect(result.filename).toBe('exam-123-results.csv');
    expect(result.blob).toBeInstanceOf(Blob);
  });

  it('throws with the server message and attaches status on a non-ok response', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 })) as unknown as typeof fetch;

    await expect(apiFetchBlob('/exams/123/results/export?format=csv')).rejects.toThrow('Forbidden');
  });
});
