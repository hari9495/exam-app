import { portalFetch } from './yx-portal';

describe('portalFetch', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends the portal session header and no cookies', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ name: 'Kiran' }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(portalFetch('kaveri', 'help', '/me', { token: 'sess-1' })).resolves.toEqual({ name: 'Kiran' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/desk\/portal\/kaveri\/help\/me$/);
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', headers: { 'X-Portal-Session': 'sess-1' } });
  });

  it('says how long to wait on 429 and keeps the status', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429, headers: new Headers(), json: async () => ({ retryAfterSeconds: 42 }) }) as unknown as typeof fetch;
    await expect(portalFetch('kaveri', 'help', '/sign-in', { method: 'POST', body: { email: 'a@b.c' } })).rejects.toMatchObject({ status: 429, retryAfterSeconds: 42, message: 'Too many tries. Wait 42 seconds and try again.' });
  });
});
