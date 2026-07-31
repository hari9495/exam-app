import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { buildSmtpTransportOptions } from './smtp-transport';
import type { Transporter } from 'nodemailer';
import { PrismaService, OrgSecretsCryptoService } from '@exam-platform/shared';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  organizationId?: string;
}

export interface SendEmailResult {
  success: boolean;
  previewUrl?: string;
}

// Last-resort fallback only. `.test` is a reserved TLD, so this address can
// never actually deliver -- it exists so local/dev runs against the Ethereal
// test account have something to put in the From header.
const PLATFORM_FROM_FALLBACK = 'no-reply@exam-platform.test';

/**
 * Office365 (and most providers) reject a From address that is not the
 * authenticated mailbox or one of its allowed aliases -- `550 5.7.60
 * SendAsDenied`. Sending as the hardcoded `.test` address while authenticated
 * as a real mailbox therefore fails every time, so default From to the
 * authenticated user unless an explicit address is configured.
 *
 * Read at call time, not at module load: ConfigModule populates process.env
 * during bootstrap, after this module is first imported.
 */
function platformFromAddress(): string {
  return process.env.SMTP_FROM_ADDRESS || process.env.SMTP_USER || PLATFORM_FROM_FALLBACK;
}
const PLATFORM_CACHE_KEY = '__platform__';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporterPromises = new Map<string, Promise<Transporter>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: OrgSecretsCryptoService,
  ) {}

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    try {
      const { transporter, fromAddress } = await this.resolveTransporter(input.organizationId);
      const info = await transporter.sendMail({
        from: fromAddress,
        to: input.to,
        subject: input.subject,
        html: input.html,
      });
      const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
      if (previewUrl) {
        this.logger.log(`Email sent, preview: ${previewUrl}`);
      }
      return { success: true, previewUrl };
    } catch (error) {
      this.logger.error(`Failed to send email to ${input.to}`, error as Error);
      return { success: false };
    }
  }

  private async resolveTransporter(organizationId: string | undefined): Promise<{ transporter: Transporter; fromAddress: string }> {
    if (organizationId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { smtpHost: true, smtpPort: true, smtpUser: true, smtpPasswordEncrypted: true, emailFromAddress: true },
      });
      if (org?.smtpHost && org.smtpUser && org.smtpPasswordEncrypted) {
        const transporter = await this.getOrBuildTransporter(organizationId, () =>
          Promise.resolve(
            nodemailer.createTransport(
              buildSmtpTransportOptions({
                host: org.smtpHost as string,
                port: org.smtpPort ?? 587,
                user: org.smtpUser as string,
                password: this.cryptoService.decrypt(org.smtpPasswordEncrypted as string),
              }),
            ),
          ),
        );
        return { transporter, fromAddress: org.emailFromAddress ?? platformFromAddress() };
      }
    }
    const transporter = await this.getOrBuildTransporter(PLATFORM_CACHE_KEY, () => this.createPlatformTransporter());
    return { transporter, fromAddress: platformFromAddress() };
  }

  private async getOrBuildTransporter(cacheKey: string, build: () => Promise<Transporter>): Promise<Transporter> {
    let promise = this.transporterPromises.get(cacheKey);
    if (!promise) {
      promise = build().catch((error) => {
        this.transporterPromises.delete(cacheKey);
        throw error;
      });
      this.transporterPromises.set(cacheKey, promise);
    }
    return promise;
  }

  private async createPlatformTransporter(): Promise<Transporter> {
    if (process.env.SMTP_HOST) {
      return nodemailer.createTransport(
        buildSmtpTransportOptions({
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
          user: process.env.SMTP_USER,
          password: process.env.SMTP_PASS,
        }),
      );
    }
    const testAccount = await nodemailer.createTestAccount();
    this.logger.log(`No SMTP_HOST configured - using Ethereal test account: ${testAccount.user}`);
    return nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
  }
}
