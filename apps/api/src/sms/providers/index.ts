import { devProvider } from './dev-provider';
import { httpProvider } from './http-provider';
import { twilioProvider } from './twilio-provider';
import { SmsProviderAdapter } from './types';

export * from './types';
export { DevSmsSink, devSmsSink, type DevSms } from './dev-provider';

// Org-level candidate SMS (Settings › SMS): real gateways only.
export const SMS_PROVIDERS: Record<string, SmsProviderAdapter> = {
  twilio: twilioProvider,
  http: httpProvider,
};

export function getSmsProvider(id: string): SmsProviderAdapter | undefined {
  return Object.prototype.hasOwnProperty.call(SMS_PROVIDERS, id) ? SMS_PROVIDERS[id] : undefined;
}

export function listSmsProviders(): SmsProviderAdapter[] {
  return Object.values(SMS_PROVIDERS);
}

export const SMS_PROVIDER_IDS = Object.keys(SMS_PROVIDERS);

// P04 SMS channel accounts: the same adapters plus the local development sink.
export const CHANNEL_PROVIDER_IDS = ['http', 'twilio', 'dev'] as const;
export type ChannelProviderId = (typeof CHANNEL_PROVIDER_IDS)[number];
const CHANNEL_PROVIDERS: Record<ChannelProviderId, SmsProviderAdapter> = { ...SMS_PROVIDERS, dev: devProvider } as Record<ChannelProviderId, SmsProviderAdapter>;

export function getChannelProvider(id: string): SmsProviderAdapter | undefined {
  return (CHANNEL_PROVIDER_IDS as readonly string[]).includes(id) ? CHANNEL_PROVIDERS[id as ChannelProviderId] : undefined;
}
