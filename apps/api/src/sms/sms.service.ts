import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, OrgSecretsCryptoService } from '@exam-platform/shared';
import { sendTwilioSms } from './twilio-transport';

export interface SendSmsInput {
  to: string;
  body: string;
  organizationId: string;
}

export interface SendSmsResult {
  success: boolean;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: OrgSecretsCryptoService,
  ) {}

  async send(input: SendSmsInput): Promise<SendSmsResult> {
    try {
      const org = await this.prisma.organization.findUnique({
        where: { id: input.organizationId },
        select: { smsEnabled: true, smsAccountSid: true, smsAuthTokenEncrypted: true, smsFromNumber: true },
      });

      // Refuse rather than send -- mirrors EmailService's deliverable gate. An org with no
      // Twilio configured (or SMS turned off) must never have the transport called: there is
      // no undeliverable-fallback channel for SMS to quietly relay through, so the only safe
      // behavior is to log and report failure.
      if (!org?.smsEnabled || !org.smsAccountSid || !org.smsAuthTokenEncrypted || !org.smsFromNumber) {
        this.logger.error(
          `SMS_NOT_SENT: no Twilio configured for organization ${input.organizationId} -- "${input.body.slice(
            0,
            40,
          )}" to ${input.to} was NOT sent`,
        );
        return { success: false };
      }

      const authToken = this.cryptoService.decrypt(org.smsAuthTokenEncrypted);
      const result = await sendTwilioSms({
        accountSid: org.smsAccountSid,
        authToken,
        from: org.smsFromNumber,
        to: input.to,
        body: input.body,
      });
      return { success: result.ok };
    } catch (error) {
      this.logger.error(`Failed to send SMS to ${input.to}`, error as Error);
      return { success: false };
    }
  }
}
