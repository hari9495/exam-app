import { CalendarOAuthClient, CalendarProviderId } from './providers';

/**
 * Thrown when a provider's OAuth app credentials aren't configured. A distinct class, not a
 * message, so callers can tell "this provider isn't set up on this deployment" apart from a
 * real OAuth error -- the same inert-when-unset precedent as AiNotConfiguredError. Prod has no
 * calendar OAuth apps configured, so the whole feature is silently inert there until it does.
 */
export class CalendarNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalendarNotConfiguredError';
  }
}

const ENV_KEYS: Record<CalendarProviderId, { id: string; secret: string }> = {
  google: { id: 'GOOGLE_OAUTH_CLIENT_ID', secret: 'GOOGLE_OAUTH_CLIENT_SECRET' },
  microsoft: { id: 'MICROSOFT_OAUTH_CLIENT_ID', secret: 'MICROSOFT_OAUTH_CLIENT_SECRET' },
};

/** True when this deployment has an OAuth app configured for the provider. */
export function isCalendarProviderConfigured(provider: CalendarProviderId): boolean {
  const keys = ENV_KEYS[provider];
  return Boolean(keys && process.env[keys.id] && process.env[keys.secret]);
}

/**
 * Resolve a provider's env OAuth-app credentials + the redirect URI. The redirect URI is derived
 * from API_ORIGIN the same way SAML derives its SP URLs, so one registered callback covers every
 * org. Throws CalendarNotConfiguredError when the client id/secret aren't set.
 */
export function resolveCalendarOAuthClient(provider: CalendarProviderId): CalendarOAuthClient {
  const keys = ENV_KEYS[provider];
  const clientId = keys && process.env[keys.id];
  const clientSecret = keys && process.env[keys.secret];
  if (!clientId || !clientSecret) {
    throw new CalendarNotConfiguredError(`Calendar sync is not configured for ${provider} on this deployment`);
  }
  const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:3001';
  return {
    clientId,
    clientSecret,
    redirectUri: `${apiOrigin}/api/v1/calendar/${provider}/callback`,
  };
}
