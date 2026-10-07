import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OtpMobileChannel, OtpSmsRequest, OtpSmsResult, OtpSmsSender } from '../auth/otp-sender';
import { devSmsSink } from '../sms/providers';
import { SmsChannelService } from './sms-channel.service';

// One-time codes by SMS through the P04 SMS channel (YX-NTF-13). WhatsApp authentication templates
// arrive with the WhatsApp channel; until then WhatsApp codes exist only in development (dev sink).
@Injectable()
export class ChannelOtpSender implements OtpSmsSender {
  readonly channels: ReadonlySet<OtpMobileChannel> = new Set<OtpMobileChannel>(process.env.NODE_ENV === 'production' ? ['sms'] : ['sms', 'whatsapp']);

  constructor(private readonly channel: SmsChannelService) {}

  async routable(channel: OtpMobileChannel, organizationId: string | null): Promise<boolean> {
    if (!this.channels.has(channel)) return false;
    return channel === 'whatsapp' || this.channel.hasRoute(organizationId);
  }

  async send(req: OtpSmsRequest): Promise<OtpSmsResult> {
    if (req.channel === 'whatsapp') {
      if (!this.channels.has('whatsapp')) return { delivered: false, reason: 'whatsapp_unavailable' };
      devSmsSink.keep({ to: req.to, channel: 'whatsapp', text: `${req.code} is your YukthiX ${req.purpose}. It expires in ${req.minutes} minutes.`, sender: null, dltTemplateId: null, providerMsgId: `dev-${randomUUID()}`, at: new Date() });
      return { delivered: true };
    }
    const outcome = await this.channel.sendOtp({
      organizationId: req.organizationId,
      to: req.to,
      code: req.code,
      purpose: req.purpose,
      minutes: req.minutes,
      idempotencyKey: req.idempotencyKey,
      recipientUserId: req.recipientUserId,
      requestedOnChannel: true,
    });
    if (outcome.status === 'sent') return { delivered: true };
    // Already handled by an earlier run of this send, or it may have arrived: nothing more to do.
    if (outcome.status === 'duplicate') return { delivered: false, reason: 'duplicate', mayHaveArrived: true };
    if (outcome.status === 'unknown') return { delivered: false, reason: 'outcome_unknown', mayHaveArrived: true };
    return { delivered: false, reason: outcome.reason };
  }
}
