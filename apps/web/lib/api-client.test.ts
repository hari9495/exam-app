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

  it('retries once with a fresh token after a 403, since a stale token reads as permission-denied rather than unauthenticated', async () => {
    const calls: (string | undefined)[] = [];
    global.fetch = jest.fn(async (_url, options) => {
      const auth = (options?.headers as Record<string, string>)?.Authorization;
      calls.push(auth);
      const status = auth === 'Bearer stale-role' ? 403 : 200;
      return new Response(JSON.stringify({ ok: true }), { status });
    }) as unknown as typeof fetch;

    setUnauthorizedHandler(async () => 'fresh-role');

    const result = await apiFetch('/users', {}, 'stale-role');
    expect(calls).toEqual(['Bearer stale-role', 'Bearer fresh-role']);
    expect(result).toEqual({ ok: true });
  });

  it('throws with a hand-written server message untouched when a request fails', async () => {
    global.fetch = jest.fn(
      async () => new Response(JSON.stringify({ message: 'This exam was deleted by a recruiter' }), { status: 404 }),
    ) as unknown as typeof fetch;

    await expect(apiFetch('/exams/missing')).rejects.toThrow('This exam was deleted by a recruiter');
  });

  it('replaces framework-default messages with a sentence for people', async () => {
    // "Not Found" is NestJS's default -- normal people should never see it.
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 })) as unknown as typeof fetch;

    await expect(apiFetch('/exams/missing')).rejects.toThrow(/couldn't find that/);
  });

  it('handles a non-JSON error body (nginx gateway page) without leaking a status code sentence', async () => {
    global.fetch = jest.fn(async () => new Response('<html>502 Bad Gateway</html>', { status: 502 })) as unknown as typeof fetch;

    await expect(apiFetch('/exams')).rejects.toThrow(/on our side/);
  });

  it('turns a fetch rejection into a readable message while staying a TypeError for the retry policy', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    try {
      await apiFetch('/exams');
      throw new Error('expected apiFetch to throw');
    } catch (error) {
      expect((error as Error).message).toMatch(/internet connection/);
      expect(error instanceof TypeError).toBe(true);
    }
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

  it('humanizes the default Forbidden and attaches status on a non-ok response', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 })) as unknown as typeof fetch;

    await expect(apiFetchBlob('/exams/123/results/export?format=csv')).rejects.toThrow(/don't have permission/);
  });
});
