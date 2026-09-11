import { httpProvider } from './http-provider';
import { twilioWhatsappProvider } from './twilio-whatsapp-provider';
import { WhatsappProviderAdapter } from './types';

export * from './types';

export const WHATSAPP_PROVIDERS: Record<string, WhatsappProviderAdapter> = {
  twilio: twilioWhatsappProvider,
  http: httpProvider,
};

export function getWhatsappProvider(id: string): WhatsappProviderAdapter | undefined {
  return WHATSAPP_PROVIDERS[id];
}

export function listWhatsappProviders(): WhatsappProviderAdapter[] {
  return Object.values(WHATSAPP_PROVIDERS);
}

export const WHATSAPP_PROVIDER_IDS = Object.keys(WHATSAPP_PROVIDERS);
