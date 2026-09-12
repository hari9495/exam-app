import { googleProvider } from './google-provider';
import { microsoftProvider } from './microsoft-provider';
import { CalendarProviderAdapter, CalendarProviderId } from './types';

export * from './types';

export const CALENDAR_PROVIDERS: Record<CalendarProviderId, CalendarProviderAdapter> = {
  google: googleProvider,
  microsoft: microsoftProvider,
};

export function getCalendarProvider(id: string): CalendarProviderAdapter | undefined {
  return CALENDAR_PROVIDERS[id as CalendarProviderId];
}

export function listCalendarProviders(): CalendarProviderAdapter[] {
  return Object.values(CALENDAR_PROVIDERS);
}

export const CALENDAR_PROVIDER_IDS = Object.keys(CALENDAR_PROVIDERS) as CalendarProviderId[];
