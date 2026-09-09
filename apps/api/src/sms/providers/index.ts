import { httpProvider } from './http-provider';
import { twilioProvider } from './twilio-provider';
import { SmsProviderAdapter } from './types';

export * from './types';

export const SMS_PROVIDERS: Record<string, SmsProviderAdapter> = {
  twilio: twilioProvider,
  http: httpProvider,
};

export function getSmsProvider(id: string): SmsProviderAdapter | undefined {
  return SMS_PROVIDERS[id];
}

export function listSmsProviders(): SmsProviderAdapter[] {
  return Object.values(SMS_PROVIDERS);
}

export const SMS_PROVIDER_IDS = Object.keys(SMS_PROVIDERS);
