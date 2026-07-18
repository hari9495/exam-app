import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
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

const PLATFORM_FROM_ADDRESS = 'no-reply@exam-platform.test';
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
            nodemailer.createTransport({
              host: org.smtpHost as string,
              port: org.smtpPort ?? 587,
              auth: { user: org.smtpUser as string, pass: this.cryptoService.decrypt(org.smtpPasswordEncrypted as string) },
            }),
          ),
        );
        return { transporter, fromAddress: org.emailFromAddress ?? PLATFORM_FROM_ADDRESS };
      }
    }
    const transporter = await this.getOrBuildTransporter(PLATFORM_CACHE_KEY, () => this.createPlatformTransporter());
    return { transporter, fromAddress: PLATFORM_FROM_ADDRESS };
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
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      });
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
