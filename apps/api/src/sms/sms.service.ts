import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, OrgSecretsCryptoService } from '@exam-platform/shared';
import { getSmsProvider } from './providers';

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
        select: { smsEnabled: true, smsProvider: true, smsConfigEncrypted: true },
      });

      const adapter = getSmsProvider(org?.smsProvider ?? '');

      // Refuse rather than send -- mirrors EmailService's deliverable gate. An org with no
      // SMS provider configured (or SMS turned off, or an unrecognized provider id) must never
      // have the transport called: there is no undeliverable-fallback channel for SMS to
      // quietly relay through, so the only safe behavior is to log and report failure.
      if (!org?.smsEnabled || !org.smsConfigEncrypted || !adapter) {
        this.logger.error(
          `SMS_NOT_SENT: no SMS provider configured for organization ${input.organizationId} -- "${input.body.slice(
            0,
            40,
          )}" to ${input.to} was NOT sent`,
        );
        return { success: false };
      }

      let config: Record<string, unknown>;
      try {
        config = JSON.parse(this.cryptoService.decrypt(org.smsConfigEncrypted));
      } catch {
        this.logger.error(`SMS_NOT_SENT: unreadable SMS config for organization ${input.organizationId}`);
        return { success: false };
      }

      try {
        adapter.validateConfig(config);
      } catch {
        this.logger.error(
          `SMS_NOT_SENT: invalid ${org.smsProvider} SMS config for organization ${input.organizationId}`,
        );
        return { success: false };
      }

      const result = await adapter.send(config, { to: input.to, body: input.body });
      if (!result.ok) {
        this.logger.error(
          `SMS_SEND_FAILED: ${org.smsProvider} rejected message to ${input.to} for organization ${
            input.organizationId
          } (status ${result.status ?? 'network error'})`,
        );
      }
      return { success: result.ok };
    } catch (error) {
      this.logger.error(`Failed to send SMS to ${input.to}`, error as Error);
      return { success: false };
    }
  }
}
