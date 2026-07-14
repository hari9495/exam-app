import { candidateApiFetch, setCandidateUnauthorizedHandler } from './candidate-api-client';

describe('candidateApiFetch', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    setCandidateUnauthorizedHandler(null);
  });

  it('calls the exam-runtime API base with an Authorization header when a token is given', async () => {
    global.fetch = jest.fn(async (url, options) => {
      expect(String(url)).toBe('http://localhost:3002/api/v1/attempt/current');
      expect((options as RequestInit).headers).toMatchObject({ Authorization: 'Bearer abc123' });
      return new Response(JSON.stringify({ exam: { title: 'T', instructions: null, durationMinutes: 30 } }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await candidateApiFetch('/attempt/current', {}, 'abc123');
    expect(result.exam.title).toBe('T');
  });

  it('retries once via the unauthorized handler on a 401, excluding the refresh endpoint itself', async () => {
    let callCount = 0;
    global.fetch = jest.fn(async () => {
      callCount += 1;
      if (callCount === 1) return new Response(JSON.stringify({ message: 'expired' }), { status: 401 });
      return new Response(JSON.stringify({ exam: { title: 'T', instructions: null, durationMinutes: 30 } }), { status: 200 });
    }) as unknown as typeof fetch;
    setCandidateUnauthorizedHandler(async () => 'fresh-token');

    const result = await candidateApiFetch('/attempt/current', {});
    expect(result.exam.title).toBe('T');
    expect(callCount).toBe(2);
  });

  it('throws with the server message on a non-ok, non-retried response', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ message: 'This invitation was revoked' }), { status: 400 })) as unknown as typeof fetch;

    await expect(candidateApiFetch('/candidate-auth/redeem', { method: 'POST', body: JSON.stringify({ token: 'x' }) })).rejects.toThrow(
      'This invitation was revoked',
    );
  });
});
