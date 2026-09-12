import { microsoftProvider } from './microsoft-provider';
import { toUtcWallClock } from './types';

const client = { clientId: 'mid', clientSecret: 'msec', redirectUri: 'https://api.test/api/v1/calendar/microsoft/callback' };

describe('microsoftProvider', () => {
  it('builds a consent url with offline_access + Calendars.ReadWrite', () => {
    const url = new URL(microsoftProvider.authUrl(client, 'state-9'));
    expect(url.origin + url.pathname).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    expect(url.searchParams.get('scope')).toContain('offline_access');
    expect(url.searchParams.get('scope')).toContain('Calendars.ReadWrite');
    expect(url.searchParams.get('state')).toBe('state-9');
  });

  it('exchangeCode parses tokens and reads email from preferred_username', async () => {
    const idToken = `x.${Buffer.from(JSON.stringify({ preferred_username: 'me@contoso.com' })).toString('base64url')}.y`;
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_in: 3600, id_token: idToken }), { status: 200 }),
    );
    const tokens = await microsoftProvider.exchangeCode(client, 'code', fetchImpl as any);
    expect(tokens).toMatchObject({ accessToken: 'at', refreshToken: 'rt', connectedEmail: 'me@contoso.com' });
  });

  it('createEvent requests a Teams meeting and returns onlineMeeting.joinUrl', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'evt-9', onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/xyz' } }), { status: 200 }),
    );
    const start = new Date('2026-01-02T10:00:00Z');
    const result = await microsoftProvider.createEvent(
      'at',
      { summary: 'S', description: 'D', location: 'L', startsAt: start, endsAt: new Date('2026-01-02T11:00:00Z'), timeZone: 'UTC', attendeeEmails: ['a@x.com'] },
      fetchImpl as any,
    );
    expect(result).toEqual({ eventId: 'evt-9', meetingUrl: 'https://teams.microsoft.com/l/xyz' });
    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(sent.isOnlineMeeting).toBe(true);
    expect(sent.onlineMeetingProvider).toBe('teamsForBusiness');
    // Graph wants a local wall-clock with NO trailing Z, paired with timeZone.
    expect(sent.start.dateTime).toBe(toUtcWallClock(start));
    expect(sent.start.dateTime).not.toMatch(/Z$/);
    expect(sent.start.timeZone).toBe('UTC');
    expect(sent.attendees[0].emailAddress.address).toBe('a@x.com');
  });

  it('getBusy keeps only blocking events and appends Z to the naive UTC datetimes', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          value: [
            { start: { dateTime: '2026-01-02T10:00:00.0000000' }, end: { dateTime: '2026-01-02T11:00:00.0000000' }, showAs: 'busy' },
            { start: { dateTime: '2026-01-02T12:00:00.0000000' }, end: { dateTime: '2026-01-02T13:00:00.0000000' }, showAs: 'free' },
          ],
        }),
        { status: 200 },
      ),
    );
    const busy = await microsoftProvider.getBusy('at', new Date('2026-01-02T00:00:00Z'), new Date('2026-01-03T00:00:00Z'), fetchImpl as any);
    expect(busy).toEqual([{ startsAt: '2026-01-02T10:00:00.000Z', endsAt: '2026-01-02T11:00:00.000Z' }]);
  });

  it('deleteEvent treats 404 as success', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response('', { status: 404 }));
    await expect(microsoftProvider.deleteEvent('at', 'evt', fetchImpl as any)).resolves.toBeUndefined();
  });
});
