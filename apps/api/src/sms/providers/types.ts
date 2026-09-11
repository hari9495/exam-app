/**
 * Provider abstraction for outbound SMS. Each org picks one adapter (by id)
 * and stores an encrypted config blob shaped by that adapter's configFields.
 */

export interface SmsConfigField {
  key: string;
  label: string;
  secret: boolean; // secret fields are never returned by GET; blank-on-PUT keeps existing
  required: boolean;
  placeholder?: string;
}

export interface SmsSendArgs {
  to: string;
  body: string;
}

export interface SmsSendResult {
  ok: boolean;
  status?: number;
}

export interface SmsProviderAdapter {
  id: string; // 'twilio' | 'http'
  label: string; // 'Twilio' | 'Generic HTTP'
  configFields: SmsConfigField[];
  validateConfig(config: Record<string, unknown>): void; // throw BadRequestException on invalid
  send(config: Record<string, unknown>, args: SmsSendArgs, fetchImpl?: typeof fetch): Promise<SmsSendResult>;
}
