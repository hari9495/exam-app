import {
  CalendarBusyInterval,
  CalendarEventInput,
  CalendarEventResult,
  CalendarOAuthClient,
  CalendarProviderAdapter,
  OAuthTokens,
  emailFromIdToken,
  toUtcWallClock,
} from './types';

// 'common' tenant: works for both work/school (O365) and personal Microsoft accounts.
const AUTH_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const EVENTS_ENDPOINT = 'https://graph.microsoft.com/v1.0/me/events';
const CALENDAR_VIEW_ENDPOINT = 'https://graph.microsoft.com/v1.0/me/calendarView';

const SCOPES = ['offline_access', 'openid', 'email', 'Calendars.ReadWrite'];

function tokensFromResponse(json: Record<string, unknown>): OAuthTokens {
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600;
  return {
    accessToken: String(json.access_token ?? ''),
    refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : '',
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    scope: typeof json.scope === 'string' ? json.scope : undefined,
    connectedEmail: emailFromIdToken(json.id_token as string | undefined),
  };
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  return `Microsoft Graph ${res.status}: ${text.slice(0, 300)}`;
}

export const microsoftProvider: CalendarProviderAdapter = {
  id: 'microsoft',
  label: 'Microsoft Outlook',
  scopes: SCOPES,

  authUrl(client: CalendarOAuthClient, state: string): string {
    const params = new URLSearchParams({
      client_id: client.clientId,
      response_type: 'code',
      redirect_uri: client.redirectUri,
      response_mode: 'query',
      scope: SCOPES.join(' '),
      state,
    });
    return `${AUTH_ENDPOINT}?${params.toString()}`;
  },

  async exchangeCode(client, code, fetchImpl = fetch): Promise<OAuthTokens> {
    const res = await fetchImpl(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        redirect_uri: client.redirectUri,
        grant_type: 'authorization_code',
        scope: SCOPES.join(' '),
      }).toString(),
    });
    if (!res.ok) throw new Error(await readError(res));
    return tokensFromResponse((await res.json()) as Record<string, unknown>);
  },

  async refresh(client, refreshToken, fetchImpl = fetch): Promise<OAuthTokens> {
    const res = await fetchImpl(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        grant_type: 'refresh_token',
        scope: SCOPES.join(' '),
      }).toString(),
    });
    if (!res.ok) throw new Error(await readError(res));
    return tokensFromResponse((await res.json()) as Record<string, unknown>);
  },

  async createEvent(accessToken, input: CalendarEventInput, fetchImpl = fetch): Promise<CalendarEventResult> {
    const body = {
      subject: input.summary,
      body: { contentType: 'text', content: input.description || '' },
      location: input.location ? { displayName: input.location } : undefined,
      // Graph wants a local wall-clock (no Z) paired with a timeZone. We send the UTC instant
      // as UTC wall-clock + timeZone:'UTC' -- the absolute time is exact; only the label is UTC.
      start: { dateTime: toUtcWallClock(input.startsAt), timeZone: 'UTC' },
      end: { dateTime: toUtcWallClock(input.endsAt), timeZone: 'UTC' },
      attendees: input.attendeeEmails.map((address) => ({ emailAddress: { address }, type: 'required' })),
      isOnlineMeeting: true,
      onlineMeetingProvider: 'teamsForBusiness',
    };
    const res = await fetchImpl(EVENTS_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await readError(res));
    const json = (await res.json()) as Record<string, unknown>;
    const online = json.onlineMeeting as { joinUrl?: string } | undefined;
    return { eventId: String(json.id ?? ''), meetingUrl: online?.joinUrl ?? null };
  },

  async deleteEvent(accessToken, eventId, fetchImpl = fetch): Promise<void> {
    const res = await fetchImpl(`${EVENTS_ENDPOINT}/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(await readError(res));
  },

  async getBusy(accessToken, windowStart, windowEnd, fetchImpl = fetch): Promise<CalendarBusyInterval[]> {
    const params = new URLSearchParams({
      startDateTime: windowStart.toISOString(),
      endDateTime: windowEnd.toISOString(),
      $select: 'start,end,showAs',
      $top: '100',
    });
    const res = await fetchImpl(`${CALENDAR_VIEW_ENDPOINT}?${params.toString()}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
    });
    if (!res.ok) throw new Error(await readError(res));
    const json = (await res.json()) as {
      value?: { start?: { dateTime?: string }; end?: { dateTime?: string }; showAs?: string }[];
    };
    const events = json.value ?? [];
    // 'free'/'workingElsewhere' don't block a slot; busy/tentative/oof do.
    const blocking = new Set(['busy', 'tentative', 'oof']);
    return events
      .filter((e) => e.start?.dateTime && e.end?.dateTime && blocking.has((e.showAs ?? 'busy').toLowerCase()))
      .map((e) => ({
        // calendarView dateTimes are UTC (Prefer header) but carry no offset -- append Z.
        startsAt: new Date(`${e.start!.dateTime}Z`).toISOString(),
        endsAt: new Date(`${e.end!.dateTime}Z`).toISOString(),
      }));
  },
};
