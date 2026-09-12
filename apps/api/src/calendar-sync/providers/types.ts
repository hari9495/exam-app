/**
 * Provider abstraction for calendar OAuth 2-way sync. The platform registers ONE OAuth app
 * per provider (env client id/secret); each user connects their own account. Each adapter
 * knows how to drive that provider's OAuth + Calendar REST API over plain `fetch` -- no SDK,
 * same as the SMS http-provider and the AI providers (a worktree can't `npm install`).
 */

export type CalendarProviderId = 'google' | 'microsoft';

/** The env-sourced OAuth app credentials for one provider. */
export interface CalendarOAuthClient {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Tokens as returned by a code exchange or refresh. `refreshToken` may be blank on refresh
 * (providers don't always re-issue one) -- callers keep the existing one when it comes back blank. */
export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope?: string;
  connectedEmail?: string;
}

export interface CalendarEventInput {
  summary: string;
  description: string;
  location: string;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  attendeeEmails: string[];
}

export interface CalendarEventResult {
  eventId: string;
  /** The auto-generated Meet/Teams join link, or null if the provider returned none. */
  meetingUrl: string | null;
}

/** Same shape as interviews' BusyInterval (ISO strings) so it feeds slot generation directly. */
export interface CalendarBusyInterval {
  startsAt: string;
  endsAt: string;
}

export interface CalendarProviderAdapter {
  id: CalendarProviderId;
  label: string; // 'Google Calendar' | 'Microsoft Outlook'
  scopes: string[];
  /** Build the provider's consent URL to redirect the user to. */
  authUrl(client: CalendarOAuthClient, state: string): string;
  /** Exchange an authorization code for tokens. Throws on a non-ok response. */
  exchangeCode(client: CalendarOAuthClient, code: string, fetchImpl?: typeof fetch): Promise<OAuthTokens>;
  /** Refresh an access token. Throws on a non-ok response. */
  refresh(client: CalendarOAuthClient, refreshToken: string, fetchImpl?: typeof fetch): Promise<OAuthTokens>;
  /** Create a calendar event with an online meeting; returns the event id + join link. */
  createEvent(accessToken: string, input: CalendarEventInput, fetchImpl?: typeof fetch): Promise<CalendarEventResult>;
  /** Delete a previously-created event. A 404/410 (already gone) resolves, not throws. */
  deleteEvent(accessToken: string, eventId: string, fetchImpl?: typeof fetch): Promise<void>;
  /** Busy intervals on the user's primary calendar within [windowStart, windowEnd]. */
  getBusy(accessToken: string, windowStart: Date, windowEnd: Date, fetchImpl?: typeof fetch): Promise<CalendarBusyInterval[]>;
}

/**
 * Decode the payload of a provider id_token WITHOUT verifying the signature. This is only used
 * to read the connected account's email for display -- the token came straight from the
 * provider's token endpoint over TLS, so it's trusted for that purpose (never for auth).
 */
export function emailFromIdToken(idToken: string | undefined): string | undefined {
  if (!idToken) return undefined;
  const parts = idToken.split('.');
  if (parts.length < 2) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
    const email = payload.email ?? payload.preferred_username ?? payload.upn;
    return typeof email === 'string' ? email : undefined;
  } catch {
    return undefined;
  }
}

/** UTC wall-clock without a trailing Z ("2026-01-02T10:00:00"), for APIs that want a local
 * dateTime paired with a separate timeZone field (Microsoft Graph rejects the Z). */
export function toUtcWallClock(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, '').replace(/Z$/, '');
}
