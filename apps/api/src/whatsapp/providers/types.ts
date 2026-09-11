/**
 * Provider abstraction for outbound WhatsApp messages. Each org picks one
 * adapter (by id) and stores an encrypted config blob shaped by that
 * adapter's configFields.
 *
 * Same shape as the SMS provider adapter; kept as a separate type since
 * this is an independent registry (see design spec's "Out of scope" note
 * on not sharing the provider abstraction with the SMS channel yet).
 */

export interface WhatsappConfigField {
  key: string;
  label: string;
  secret: boolean; // secret fields are never returned by GET; blank-on-PUT keeps existing
  required: boolean;
  placeholder?: string;
}

export interface WhatsappSendArgs {
  to: string;
  body: string;
}

export interface WhatsappSendResult {
  ok: boolean;
  status?: number;
}

export interface WhatsappProviderAdapter {
  id: string; // 'twilio' | 'http'
  label: string; // 'Twilio WhatsApp' | 'Generic HTTP'
  configFields: WhatsappConfigField[];
  validateConfig(config: Record<string, unknown>): void; // throw BadRequestException on invalid
  send(config: Record<string, unknown>, args: WhatsappSendArgs, fetchImpl?: typeof fetch): Promise<WhatsappSendResult>;
}
