import { Injectable, Logger } from '@nestjs/common';
import { BlobStorageService, TenantPrismaService } from '@exam-platform/shared';
import type { CompanyLook, EmailType } from './account-emails';

// A static email may be opened days later, so the logo link lives longer than a page's (as the offer and
// interview emails do).
const LOGO_SIGN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * A company's branding and wording for one account email (P04 Q5), read under the company's own RLS context.
 * Never blocks a security email: any failure sends YukthiX's own wording instead.
 */
@Injectable()
export class EmailLookService {
  private readonly logger = new Logger(EmailLookService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly blob: BlobStorageService,
  ) {}

  /** The company's name and the recipient's (for {{companyName}} / {{firstName}}); nulls when unknown. */
  async recipient(organizationId: string, email: string): Promise<{ company: string | null; firstName: string | null }> {
    try {
      const [org, user] = await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
        Promise.all([
          tx.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
          tx.user.findFirst({ where: { organizationId, email: { equals: email, mode: 'insensitive' } }, select: { name: true } }),
        ]),
      );
      return { company: org?.name ?? null, firstName: user?.name ?? null };
    } catch {
      return { company: null, firstName: null };
    }
  }

  /** The company logo (Settings › Branding) as a long-lived signed link; null when there is none. */
  async logoOf(organizationId: string): Promise<string | null> {
    const org = await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) => tx.organization.findUnique({ where: { id: organizationId }, select: { logoPath: true } }));
    return org?.logoPath ? ((await this.blob.signIfOurs(org.logoPath, LOGO_SIGN_TTL_MS)) as string | null) : null;
  }

  async forCompany(organizationId: string | null | undefined, type: EmailType, language = 'en'): Promise<CompanyLook | null> {
    if (!organizationId) return null;
    try {
      const [brand, wording] = await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
        Promise.all([
          tx.emailBranding.findUnique({ where: { organizationId } }),
          tx.emailTemplateOverride.findUnique({ where: { organizationId_type_language: { organizationId, type, language } } }),
        ]),
      );
      const showLogo = brand?.showLogo ?? true;
      return {
        logoUrl: showLogo ? await this.logoOf(organizationId) : null,
        accentColor: brand?.accentColor ?? null,
        senderName: brand?.senderName ?? null,
        replyTo: brand?.replyTo ?? null,
        wording: wording ? { subject: wording.subject, heading: wording.heading, intro: wording.intro, buttonLabel: wording.buttonLabel, footer: wording.footer } : null,
      };
    } catch (error) {
      this.logger.error(`Could not load the email branding of organisation ${organizationId}; sending YukthiX's wording`, error as Error);
      return null;
    }
  }
}
