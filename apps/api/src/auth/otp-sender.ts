import { Logger } from '@nestjs/common';

// SMS / WhatsApp delivery of one-time codes (P12 §3 OTP, M04 Q2, P04 YX-NTF-13: sent at once, no
// quiet hours, digests or grouping). A real provider (DLT-registered SMS template, WhatsApp
// authentication template) implements this interface and is bound to OTP_SMS_SENDER; its
// credentials come only from the environment / secret manager, never from code.
export type OtpMobileChannel = 'sms' | 'whatsapp';

export interface OtpSmsSender {
  // Channels this provider can deliver. A channel it lacks is refused before any account lookup.
  readonly channels: ReadonlySet<OtpMobileChannel>;
  send(to: string, channel: OtpMobileChannel, text: string): Promise<void>;
}

export const OTP_SMS_SENDER = 'OTP_SMS_SENDER';

export interface SentOtpMessage {
  to: string;
  channel: OtpMobileChannel;
  text: string;
  at: Date;
}

// Development / test provider: keeps messages in an in-memory sink (tests read `sent`) and never
// leaves the process. Never used in production.
export class InMemoryOtpSmsSender implements OtpSmsSender {
  private readonly logger = new Logger('InMemoryOtpSmsSender');
  readonly channels: ReadonlySet<OtpMobileChannel> = new Set<OtpMobileChannel>(['sms', 'whatsapp']);
  readonly sent: SentOtpMessage[] = [];

  async send(to: string, channel: OtpMobileChannel, text: string): Promise<void> {
    this.sent.push({ to, channel, text, at: new Date() });
    this.logger.log(`${channel} to ${to.slice(0, 4)}****${to.slice(-2)} kept in the in-memory sink`);
  }
}

// No provider configured: SMS / WhatsApp OTP is unavailable (email OTP still works).
export class NoOtpSmsSender implements OtpSmsSender {
  readonly channels: ReadonlySet<OtpMobileChannel> = new Set();
  async send(): Promise<void> {
    throw new Error('No SMS / WhatsApp provider is configured');
  }
}

// ponytail: in-memory in development and test, none in production until a real provider is
// wired here (select it by an env var such as OTP_SMS_PROVIDER, credentials from the environment).
export function createOtpSmsSender(): OtpSmsSender {
  return process.env.NODE_ENV === 'production' ? new NoOtpSmsSender() : new InMemoryOtpSmsSender();
}
