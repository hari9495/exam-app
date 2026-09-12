import { randomUUID } from 'crypto';
import {
  CalendarBusyInterval,
  CalendarEventInput,
  CalendarEventResult,
  CalendarOAuthClient,
  CalendarProviderAdapter,
  OAuthTokens,
  emailFromIdToken,
} from './types';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const EVENTS_ENDPOINT = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const FREEBUSY_ENDPOINT = 'https://www.googleapis.com/calendar/v3/freeBusy';

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
];

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
  return `Google API ${res.status}: ${text.slice(0, 300)}`;
}

export const googleProvider: CalendarProviderAdapter = {
  id: 'google',
  label: 'Google Calendar',
  scopes: SCOPES,

  authUrl(client: CalendarOAuthClient, state: string): string {
    const params = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: client.redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline', // required to receive a refresh_token
      prompt: 'consent', // force a refresh_token even on re-consent
      include_granted_scopes: 'true',
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
      }).toString(),
    });
    if (!res.ok) throw new Error(await readError(res));
    return tokensFromResponse((await res.json()) as Record<string, unknown>);
  },

  async createEvent(accessToken, input: CalendarEventInput, fetchImpl = fetch): Promise<CalendarEventResult> {
    const body = {
      summary: input.summary,
      description: input.description || undefined,
      location: input.location || undefined,
      start: { dateTime: input.startsAt.toISOString(), timeZone: input.timeZone || 'UTC' },
      end: { dateTime: input.endsAt.toISOString(), timeZone: input.timeZone || 'UTC' },
      attendees: input.attendeeEmails.map((email) => ({ email })),
      conferenceData: {
        createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
      },
    };
    const res = await fetchImpl(`${EVENTS_ENDPOINT}?conferenceDataVersion=1&sendUpdates=none`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await readError(res));
    const json = (await res.json()) as Record<string, unknown>;
    const conf = json.conferenceData as { entryPoints?: { entryPointType?: string; uri?: string }[] } | undefined;
    const videoEntry = conf?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri;
    return {
      eventId: String(json.id ?? ''),
      meetingUrl: (typeof json.hangoutLink === 'string' ? json.hangoutLink : undefined) ?? videoEntry ?? null,
    };
  },

  async deleteEvent(accessToken, eventId, fetchImpl = fetch): Promise<void> {
    const res = await fetchImpl(`${EVENTS_ENDPOINT}/${encodeURIComponent(eventId)}?sendUpdates=none`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    // Already gone is success -- the goal state (no event) is reached.
    if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(await readError(res));
  },

  async getBusy(accessToken, windowStart, windowEnd, fetchImpl = fetch): Promise<CalendarBusyInterval[]> {
    const res = await fetchImpl(FREEBUSY_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeMin: windowStart.toISOString(),
        timeMax: windowEnd.toISOString(),
        items: [{ id: 'primary' }],
      }),
    });
    if (!res.ok) throw new Error(await readError(res));
    const json = (await res.json()) as { calendars?: { primary?: { busy?: { start: string; end: string }[] } } };
    const busy = json.calendars?.primary?.busy ?? [];
    return busy.map((b) => ({ startsAt: new Date(b.start).toISOString(), endsAt: new Date(b.end).toISOString() }));
  },
};
