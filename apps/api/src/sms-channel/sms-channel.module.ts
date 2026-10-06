import { Module } from '@nestjs/common';
import { AuditModule, CryptoModule } from '@exam-platform/shared';
import { EmailModule } from '../email/email.module';
import { OTP_SMS_SENDER } from '../auth/otp-sender';
import { ChannelOtpSender } from './channel-otp-sender';
import { SmsAccountsService } from './sms-accounts.service';
import { PUBLIC_GATEWAY_NET, SMS_GATEWAY_NET, SmsChannelService } from './sms-channel.service';
import { SmsCallbacksController, SmsSettingsController } from './sms-channel.controller';

// P04 SMS channel: gateway accounts, sending with failover, consents, metering, callbacks and the admin API.
// Exports OTP_SMS_SENDER for one-time codes (AuthModule).
@Module({
  imports: [AuditModule, CryptoModule, EmailModule],
  providers: [
    SmsChannelService,
    SmsAccountsService,
    { provide: SMS_GATEWAY_NET, useValue: PUBLIC_GATEWAY_NET },
    { provide: OTP_SMS_SENDER, useClass: ChannelOtpSender },
  ],
  controllers: [SmsSettingsController, SmsCallbacksController],
  exports: [SmsChannelService, OTP_SMS_SENDER],
})
export class SmsChannelModule {}
