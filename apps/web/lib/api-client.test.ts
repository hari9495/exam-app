import { goTo } from './navigate';
import { apiFetch, apiFetchBlob, resetSessionState, setStepUpHandler, setUnauthorizedHandler, YX_SESSION_KEY } from './api-client';

jest.mock('./navigate', () => ({ goTo: jest.fn() }));

describe('apiFetch', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    setUnauthorizedHandler(null);
    resetSessionState();
    jest.mocked(goTo).mockClear();
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

  it('does not refresh on a 403: a permission refusal is an answer, not an expired token', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 })) as unknown as typeof fetch;
    const refresh = jest.fn(async () => 'fresh');
    setUnauthorizedHandler(refresh);

    await expect(apiFetch('/exams?pageSize=100', {}, 'tok')).rejects.toMatchObject({ status: 403 });
    expect(refresh).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not refresh on a 429', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ message: 'Too Many Requests' }), { status: 429 })) as unknown as typeof fetch;
    const refresh = jest.fn(async () => 'fresh');
    setUnauthorizedHandler(refresh);

    await expect(apiFetch('/exams', {}, 'tok')).rejects.toMatchObject({ status: 429 });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shares one refresh between concurrent 401s (single-flight)', async () => {
    global.fetch = jest.fn(async (_url, options) => {
      const auth = (options?.headers as Record<string, string>)?.Authorization;
      return new Response(JSON.stringify({ ok: true }), { status: auth === 'Bearer old' ? 401 : 200 });
    }) as unknown as typeof fetch;
    let release!: (t: string) => void;
    const refresh = jest.fn(() => new Promise<string>((r) => (release = r)));
    setUnauthorizedHandler(refresh);

    const all = Promise.all([apiFetch('/a', {}, 'old'), apiFetch('/b', {}, 'old'), apiFetch('/c', {}, 'old')]);
    await new Promise((r) => setTimeout(r, 0));
    release('new');
    await expect(all).resolves.toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['refused (null)', async () => null],
    ['rate-limited (same token back)', async () => 'old'],
    ['thrown', async () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('a failed refresh (%s) is not retried: one refresh, no retry of the request, and the person is sent to sign in', async (_label, handler) => {
    window.history.pushState({}, '', '/v2/panel/reports');
    try {
      global.fetch = jest.fn(async () => new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 })) as unknown as typeof fetch;
      const refresh = jest.fn(handler as () => Promise<string | null>);
      setUnauthorizedHandler(refresh);

      await expect(apiFetch('/exams', {}, 'old')).rejects.toMatchObject({ status: 401 });
      await expect(apiFetch('/exams', {}, 'old')).rejects.toMatchObject({ status: 401 });
      expect(refresh).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(goTo).toHaveBeenCalledTimes(1);
      expect(goTo).toHaveBeenCalledWith('/login');
    } finally {
    }
  });

  it('sends a YukthiX session to /yx/sign-in', async () => {
    window.history.pushState({}, '', '/v2/panel/reports');
    window.sessionStorage.setItem(YX_SESSION_KEY, '1');
    try {
      global.fetch = jest.fn(async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
      setUnauthorizedHandler(async () => null);
      await expect(apiFetch('/exams', {}, 'old')).rejects.toMatchObject({ status: 401 });
      expect(goTo).toHaveBeenCalledWith('/yx/sign-in');
    } finally {
      window.sessionStorage.removeItem(YX_SESSION_KEY);
    }
  });

  it('throws with a hand-written server message untouched when a request fails', async () => {
    global.fetch = jest.fn(
      async () => new Response(JSON.stringify({ message: 'This exam was deleted by a recruiter' }), { status: 404 }),
    ) as unknown as typeof fetch;

    await expect(apiFetch('/exams/missing')).rejects.toThrow('This exam was deleted by a recruiter');
  });

  it('carries allowlisted refusal details (POSSIBLE_SAME_PERSON personIds), never other body fields', async () => {
    global.fetch = jest.fn(
      async () => new Response(JSON.stringify({ code: 'POSSIBLE_SAME_PERSON', message: 'Check it is the same person', personIds: ['p1'], resetToken: 'a'.repeat(64) }), { status: 409 }),
    ) as unknown as typeof fetch;
    const error = (await apiFetch('/people/employees', { method: 'POST' }).catch((e) => e)) as { code?: string; body?: Record<string, unknown> };
    expect(error.code).toBe('POSSIBLE_SAME_PERSON');
    expect(error.body).toEqual({ personIds: ['p1'] });
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

describe('apiFetch and the MFA floor (P12 YX-IAM-01/02)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    setUnauthorizedHandler(null);
    setStepUpHandler(null);
  });

  it('does not refresh the token for MFA_REQUIRED (a token refresh cannot fix it) and exposes the code', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ code: 'MFA_REQUIRED', message: 'Set up two-step verification to continue.' }), { status: 403 })) as unknown as typeof fetch;
    const refresh = jest.fn(async () => 'new');
    setUnauthorizedHandler(refresh);
    await expect(apiFetch('/security/sessions', {}, 'tok')).rejects.toMatchObject({ status: 403, code: 'MFA_REQUIRED', message: 'Set up two-step verification to continue.' });
    expect(refresh).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('a wrong second-factor code is not treated as an expired session', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ message: 'That verification did not work. Try again.' }), { status: 401 })) as unknown as typeof fetch;
    const refresh = jest.fn(async () => 'new');
    setUnauthorizedHandler(refresh);
    await expect(apiFetch('/auth/mfa/verify', { method: 'POST' })).rejects.toThrow('That verification did not work');
    await expect(apiFetch('/auth/mfa/step-up', { method: 'POST' }, 'tok')).rejects.toThrow('That verification did not work');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('retries a STEP_UP_REQUIRED action once the step-up handler confirms, with the same token', async () => {
    let stepped = false;
    const auth: (string | undefined)[] = [];
    global.fetch = jest.fn(async (_url, options) => {
      auth.push((options?.headers as Record<string, string>)?.Authorization);
      return stepped ? new Response(JSON.stringify({ ok: true }), { status: 200 }) : new Response(JSON.stringify({ code: 'STEP_UP_REQUIRED' }), { status: 403 });
    }) as unknown as typeof fetch;
    setStepUpHandler(async () => (stepped = true));
    await expect(apiFetch('/security/policy', { method: 'PATCH' }, 'tok')).resolves.toEqual({ ok: true });
    expect(auth).toEqual(['Bearer tok', 'Bearer tok']);
  });

  it('returns null for 204 No Content instead of failing to parse it', async () => {
    global.fetch = jest.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    await expect(apiFetch('/auth/sessions/x', { method: 'DELETE' }, 'tok')).resolves.toBeNull();
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
