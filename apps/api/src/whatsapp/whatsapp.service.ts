import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, OrgSecretsCryptoService } from '@exam-platform/shared';
import { getWhatsappProvider } from './providers';

export interface SendWhatsappInput {
  to: string;
  body: string;
  organizationId: string;
}

export interface SendWhatsappResult {
  success: boolean;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: OrgSecretsCryptoService,
  ) {}

  async send(input: SendWhatsappInput): Promise<SendWhatsappResult> {
    try {
      const org = await this.prisma.organization.findUnique({
        where: { id: input.organizationId },
        select: { whatsappEnabled: true, whatsappProvider: true, whatsappConfigEncrypted: true },
      });
      const adapter = getWhatsappProvider(org?.whatsappProvider ?? '');

      // Deliverable gate: never fabricate a send. Missing config, disabled channel, or an
      // unrecognized provider id must all refuse rather than silently drop or guess.
      if (!org?.whatsappEnabled || !org.whatsappConfigEncrypted || !adapter) {
        this.logger.error(
          `WHATSAPP_NOT_SENT: no WhatsApp provider configured for organization ${input.organizationId} -- "${input.body.slice(0, 40)}" to ${input.to} was NOT sent`,
        );
        return { success: false };
      }

      let config: Record<string, unknown>;
      try {
        config = JSON.parse(this.cryptoService.decrypt(org.whatsappConfigEncrypted));
      } catch {
        this.logger.error(`WHATSAPP_NOT_SENT: unreadable WhatsApp config for organization ${input.organizationId}`);
        return { success: false };
      }

      try {
        adapter.validateConfig(config);
      } catch {
        this.logger.error(
          `WHATSAPP_NOT_SENT: invalid ${org.whatsappProvider} WhatsApp config for organization ${input.organizationId}`,
        );
        return { success: false };
      }

      const result = await adapter.send(config, { to: input.to, body: input.body });
      if (!result.ok) {
        this.logger.error(
          `WHATSAPP_SEND_FAILED: ${org.whatsappProvider} rejected message to ${input.to} for organization ${input.organizationId} (status ${result.status ?? 'network error'})`,
        );
      }
      return { success: result.ok };
    } catch (error) {
      this.logger.error(`Failed to send WhatsApp message to ${input.to}`, error as Error);
      return { success: false };
    }
  }
}
