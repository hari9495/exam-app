import { TestingModuleBuilder } from '@nestjs/testing';
import { OTP_SMS_SENDER, OtpSmsRequest, OtpSmsSender } from '../../src/auth/otp-sender';
import { ChannelOtpSender } from '../../src/sms-channel/channel-otp-sender';
import { SmsChannelService } from '../../src/sms-channel/sms-channel.service';

// One-time codes are sent fire-and-forget (the response never waits on delivery). Tests that read the
// texted code wrap the real sender so they can wait for sends already started: `await sms.settle()`.
export function trackOtpSends(builder: TestingModuleBuilder): { builder: TestingModuleBuilder; settle: () => Promise<void> } {
  const inflight = new Set<Promise<unknown>>();
  const tracked = builder.overrideProvider(OTP_SMS_SENDER).useFactory({
    inject: [SmsChannelService],
    factory: (channel: SmsChannelService): OtpSmsSender => {
      const inner = new ChannelOtpSender(channel);
      return {
        channels: inner.channels,
        routable: (channel, organizationId) => inner.routable(channel, organizationId),
        send: (req: OtpSmsRequest) => {
          const sending = inner.send(req);
          inflight.add(sending);
          void sending.finally(() => inflight.delete(sending)).catch(() => undefined);
          return sending;
        },
      };
    },
  });
  return {
    builder: tracked,
    settle: async () => {
      while (inflight.size) await Promise.allSettled([...inflight]);
      await new Promise((r) => setImmediate(r));
    },
  };
}

// Emailed codes are rendered before they are sent (also fire-and-forget): wrap OtpService's email
// path the same way, so `settle()` covers them too.
export function trackEmailCodes(otp: object): () => Promise<void> {
  const inflight = new Set<Promise<unknown>>();
  const target = otp as { emailCode: (...args: unknown[]) => Promise<unknown> };
  const inner = target.emailCode.bind(otp);
  target.emailCode = (...args: unknown[]) => {
    const sending = inner(...args);
    inflight.add(sending);
    void sending.finally(() => inflight.delete(sending)).catch(() => undefined);
    return sending;
  };
  return async () => {
    while (inflight.size) await Promise.allSettled([...inflight]);
    await new Promise((r) => setImmediate(r));
  };
}

// Security notices are rendered and sent fire-and-forget: wait (up to 5 s) until one matches.
export async function emailArrives(send: jest.Mock, match: (m: { to: string; subject: string }) => boolean): Promise<void> {
  for (let i = 0; i < 250 && !send.mock.calls.some(([m]) => match(m)); i++) await new Promise((r) => setTimeout(r, 20));
}
