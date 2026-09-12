import { googleProvider } from './google-provider';

const client = { clientId: 'gid', clientSecret: 'gsec', redirectUri: 'https://api.test/api/v1/calendar/google/callback' };

describe('googleProvider', () => {
  it('builds a consent url requesting offline access + forced consent (for a refresh token)', () => {
    const url = new URL(googleProvider.authUrl(client, 'state-123'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('gid');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('scope')).toContain('calendar.events');
  });

  it('exchangeCode parses tokens and derives the email from the id_token', async () => {
    const idToken = `x.${Buffer.from(JSON.stringify({ email: 'me@gmail.com' })).toString('base64url')}.y`;
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: 's', id_token: idToken }), { status: 200 }),
    );
    const tokens = await googleProvider.exchangeCode(client, 'code', fetchImpl as any);
    expect(tokens).toMatchObject({ accessToken: 'at', refreshToken: 'rt', connectedEmail: 'me@gmail.com' });
    expect(tokens.expiresAt.getTime()).toBeGreaterThan(Date.now());
    // token endpoint called with the auth code grant
    const body = String(fetchImpl.mock.calls[0][1].body);
    expect(body).toContain('grant_type=authorization_code');
  });

  it('exchangeCode throws on a non-ok response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response('nope', { status: 400 }));
    await expect(googleProvider.exchangeCode(client, 'code', fetchImpl as any)).rejects.toThrow(/Google API 400/);
  });

  it('createEvent requests a Meet link and returns hangoutLink as meetingUrl', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'evt-1', hangoutLink: 'https://meet.google.com/abc' }), { status: 200 }),
    );
    const result = await googleProvider.createEvent(
      'at',
      { summary: 'S', description: 'D', location: 'L', startsAt: new Date('2026-01-02T10:00:00Z'), endsAt: new Date('2026-01-02T11:00:00Z'), timeZone: 'UTC', attendeeEmails: ['a@x.com'] },
      fetchImpl as any,
    );
    expect(result).toEqual({ eventId: 'evt-1', meetingUrl: 'https://meet.google.com/abc' });
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain('conferenceDataVersion=1');
    const sent = JSON.parse(opts.body);
    expect(sent.conferenceData.createRequest.conferenceSolutionKey.type).toBe('hangoutsMeet');
    expect(sent.attendees).toEqual([{ email: 'a@x.com' }]);
    expect(opts.headers.Authorization).toBe('Bearer at');
  });

  it('createEvent falls back to a video entryPoint when hangoutLink is absent', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'e', conferenceData: { entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/z' }] } }), { status: 200 }),
    );
    const result = await googleProvider.createEvent(
      'at',
      { summary: 'S', description: '', location: '', startsAt: new Date(), endsAt: new Date(), timeZone: 'UTC', attendeeEmails: [] },
      fetchImpl as any,
    );
    expect(result.meetingUrl).toBe('https://meet.google.com/z');
  });

  it('deleteEvent treats 404/410 as success', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response('', { status: 410 }));
    await expect(googleProvider.deleteEvent('at', 'evt', fetchImpl as any)).resolves.toBeUndefined();
  });

  it('getBusy maps freeBusy intervals to iso start/end', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ calendars: { primary: { busy: [{ start: '2026-01-02T10:00:00Z', end: '2026-01-02T11:00:00Z' }] } } }), { status: 200 }),
    );
    const busy = await googleProvider.getBusy('at', new Date('2026-01-02T00:00:00Z'), new Date('2026-01-03T00:00:00Z'), fetchImpl as any);
    expect(busy).toEqual([{ startsAt: '2026-01-02T10:00:00.000Z', endsAt: '2026-01-02T11:00:00.000Z' }]);
  });
});
