// SMS / WhatsApp delivery of one-time codes (P12 §3 OTP, M04 Q2, P04 YX-NTF-13: sent at once, no
// quiet hours, digests or grouping). Bound to OTP_SMS_SENDER by SmsChannelModule: SMS goes through the
// company's / the YukthiX shared gateway accounts (P04 SMS channel, any provider by configuration);
// WhatsApp authentication templates come with the WhatsApp channel (development sink until then).
export type OtpMobileChannel = 'sms' | 'whatsapp';

export interface OtpSmsRequest {
  organizationId: string | null;
  to: string;
  channel: OtpMobileChannel;
  code: string;
  /** Short label for the template, e.g. "sign-in code" (at most 30 characters). */
  purpose: string;
  minutes: number;
  /** Same for every retry of this send: a retried job never sends twice (YX-NTF-02). */
  idempotencyKey: string;
  recipientUserId: string;
}

/** delivered=false: nothing went (reason says why) -- unless mayHaveArrived, when it must not be resent anywhere. */
export type OtpSmsResult = { delivered: true } | { delivered: false; reason: string; mayHaveArrived?: boolean };

export interface OtpSmsSender {
  // Channels this provider can deliver. A channel it lacks is refused before any account lookup.
  readonly channels: ReadonlySet<OtpMobileChannel>;
  send(request: OtpSmsRequest): Promise<OtpSmsResult>;
}

export const OTP_SMS_SENDER = 'OTP_SMS_SENDER';
