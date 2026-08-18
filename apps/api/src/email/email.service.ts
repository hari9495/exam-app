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
  attachments?: { filename: string; content: Buffer }[];
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

/**
 * A transporter plus whether mail sent through it can actually reach a human.
 *
 * `deliverable: false` means the Ethereal test-account fallback -- a throwaway inbox nobody
 * reads. Treating that as a successful send is what let 24 production emails vanish silently,
 * including org-admin and platform-admin setup links that expire in 15 minutes.
 */
interface ResolvedTransport {
  transporter: Transporter;
  deliverable: boolean;
}

/**
 * Escape hatch for local development, where the Ethereal preview inbox is genuinely useful.
 *
 * Deliberately an explicit opt-in rather than a `NODE_ENV !== 'production'` check: NODE_ENV is
 * not set on this platform's production VM (not in .env, not in the pm2 process environment),
 * so a production check would silently never fire and this guard would be dead code -- the
 * exact failure mode it exists to prevent.
 */
const ALLOW_UNDELIVERABLE = 'ALLOW_UNDELIVERABLE_EMAIL';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporterPromises = new Map<string, Promise<ResolvedTransport>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: OrgSecretsCryptoService,
  ) {}

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    try {
      const { transporter, fromAddress, deliverable } = await this.resolveTransporter(input.organizationId);

      // Refuse rather than send. Two reasons, and the second is the stronger one:
      //   1. Reporting success for mail nobody can read makes every caller believe it worked.
      //   2. The Ethereal fallback TRANSMITS the message to a third-party test service, and its
      //      preview URLs are readable by anyone holding the link. These messages carry
      //      password-setup links, so quietly relaying them off-platform is a disclosure, not
      //      just a delivery failure.
      if (!deliverable && process.env[ALLOW_UNDELIVERABLE] !== 'true') {
        this.logger.error(
          `EMAIL_NOT_SENT: no SMTP configured for ${
            input.organizationId ? `organization ${input.organizationId}` : 'the platform'
          } -- "${input.subject}" to ${input.to} was NOT delivered and was NOT relayed anywhere. ` +
            `Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS for platform mail, or configure the organization's own SMTP. ` +
            `For local development set ${ALLOW_UNDELIVERABLE}=true to use the Ethereal preview inbox.`,
        );
        return { success: false };
      }

      const info = await transporter.sendMail({
        from: fromAddress,
        to: input.to,
        subject: input.subject,
        html: input.html,
        ...(input.attachments ? { attachments: input.attachments } : {}),
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

  private async resolveTransporter(
    organizationId: string | undefined,
  ): Promise<{ transporter: Transporter; fromAddress: string; deliverable: boolean }> {
    if (organizationId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { smtpHost: true, smtpPort: true, smtpUser: true, smtpPasswordEncrypted: true, emailFromAddress: true },
      });
      if (org?.smtpHost && org.smtpUser && org.smtpPasswordEncrypted) {
        const { transporter } = await this.getOrBuildTransporter(organizationId, () =>
          Promise.resolve({
            transporter: nodemailer.createTransport(
              buildSmtpTransportOptions({
                host: org.smtpHost as string,
                port: org.smtpPort ?? 587,
                user: org.smtpUser as string,
                password: this.cryptoService.decrypt(org.smtpPasswordEncrypted as string),
              }),
            ),
            deliverable: true,
          }),
        );
        // Fall back to the ORG's own mailbox, not the platform's. An org that
        // authenticates as X must send as X or Office365 rejects it with
        // 550 5.7.60 SendAsDenied -- and "From address" is optional in the UI,
        // so most orgs will not have set one.
        return {
          transporter,
          fromAddress: org.emailFromAddress ?? org.smtpUser ?? platformFromAddress(),
          deliverable: true,
        };
      }
    }
    // An org with no SMTP of its own lands here too, so this single flag covers BOTH ways mail
    // reaches the dead platform transporter: a caller that passes no organizationId, and an org
    // that never configured SMTP.
    const { transporter, deliverable } = await this.getOrBuildTransporter(PLATFORM_CACHE_KEY, () =>
      this.createPlatformTransporter(),
    );
    return { transporter, fromAddress: platformFromAddress(), deliverable };
  }

  private async getOrBuildTransporter(
    cacheKey: string,
    build: () => Promise<ResolvedTransport>,
  ): Promise<ResolvedTransport> {
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

  private async createPlatformTransporter(): Promise<ResolvedTransport> {
    if (process.env.SMTP_HOST) {
      return {
        transporter: nodemailer.createTransport(
          buildSmtpTransportOptions({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
            user: process.env.SMTP_USER,
            password: process.env.SMTP_PASS,
          }),
        ),
        deliverable: true,
      };
    }
    const testAccount = await nodemailer.createTestAccount();
    // warn, not log: on this platform's production VM this line appeared once per api restart
    // and read as routine startup noise for weeks while real mail was being discarded.
    this.logger.warn(
      `No SMTP_HOST configured - platform mail is UNDELIVERABLE (Ethereal test account: ${testAccount.user}). ` +
        `Sends will be refused unless ${ALLOW_UNDELIVERABLE}=true.`,
    );
    return {
      transporter: nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: { user: testAccount.user, pass: testAccount.pass },
      }),
      deliverable: false,
    };
  }
}
