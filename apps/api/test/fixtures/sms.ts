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
