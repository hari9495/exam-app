import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Organization } from '@prisma/client';
import { randomBytes, createHash, X509Certificate } from 'crypto';
import * as argon2 from 'argon2';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '@exam-platform/shared';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AuditService } from '@exam-platform/shared';
import { OrgSecretsCryptoService } from '@exam-platform/shared';
import { BlobStorageService } from '@exam-platform/shared';
import { AiProvider, AnthropicProvider, OpenAiCompatibleProvider } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { resolvePaginationParams, buildPaginatedResponse, PaginatedResponse } from '../common/paginated-response';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateBrandingColorsDto } from './dto/update-branding-colors.dto';
import { UpdateSmtpSettingsDto } from './dto/update-smtp-settings.dto';
import { UpdateAiKeyDto } from './dto/update-ai-key.dto';
import { UpdateWebhookUrlDto } from './dto/update-webhook-url.dto';
import { UpdateSsoSettingsDto } from './dto/update-sso-settings.dto';

export interface BrandingResponse {
  // The organisation's own display name. Consumers render this in place of the
  // product name wherever branding applies -- including the browser tab title,
  // which previously always read "Prudent Hire" because nothing exposed this.
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
}

// The platform-admin list is the ONLY consumer of the organizations table that
// reaches a browser, and this table holds every one of an org's secrets. Without
// an explicit select Prisma returns all scalars -- smtpPasswordEncrypted,
// aiApiKeyEncrypted, apiKeyHash, webhookSecretEncrypted, samlIdpCertificate --
// and the controller returns them verbatim. Add columns here deliberately; never
// widen this to a bare findMany.
const ORGANIZATION_LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  region: true,
  status: true,
  createdAt: true,
} as const;

export interface OrganizationListItem {
  id: string;
  name: string;
  slug: string;
  region: string;
  status: string;
  createdAt: Date;
  primaryAdminName: string | null;
  primaryAdminEmail: string | null;
  userCount: number;
  examCount: number;
}

export interface AiCreditUsageResponse {
  aiCreditLimit: number;
  totalUsed: number;
  breakdown: { questionGeneration: number; insightGeneration: number };
}

export interface IntegrationsResponse {
  smtpConfigured: boolean;
  aiKeyConfigured: boolean;
  aiProvider: string;
  aiBaseUrl: string | null;
  aiModelFast: string | null;
  aiModelStandard: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  emailFromAddress: string | null;
  apiKeyConfigured: boolean;
  apiKeyPrefix: string | null;
  apiKeyCreatedAt: Date | null;
  webhookConfigured: boolean;
  webhookUrl: string | null;
}

export interface SsoSettingsResponse {
  samlEnabled: boolean;
  samlIdpEntityId: string | null;
  samlIdpSsoUrl: string | null;
  samlIdpCertificate: string | null;
}

const ALLOWED_LOGO_MIME_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/svg+xml': '.svg',
};
const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;

// Mirrors AuthService's PASSWORD_RESET_EXPIRY_MINUTES (apps/api/src/auth/auth.service.ts) --
// same policy, reused verbatim rather than shared cross-module, matching this codebase's
// existing pattern of each service owning its own small local constants.
const PASSWORD_RESET_EXPIRY_MINUTES = 15;

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly emailService: EmailService,
    private readonly cryptoService: OrgSecretsCryptoService,
    private readonly blobStorage: BlobStorageService,
  ) {}

  async create(context: TenantContext, actorUserId: string, dto: CreateOrganizationDto): Promise<Organization> {
    const existing = await this.prisma.organization.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException(`Organization slug "${dto.slug}" is already taken`);
    }

    const trialPlan = await this.prisma.plan.findFirst({ where: { name: 'trial' } });
    if (!trialPlan) {
      throw new Error('No trial plan is configured for this environment');
    }

    const org = await this.prisma.organization.create({
      data: { name: dto.name, slug: dto.slug, region: dto.region, planId: trialPlan.id },
    });

    // The new org has no pre-existing tenant session to scope to, so admin creation
    // and the token that lets them set their own password are both routed through
    // forTenant's super-admin bypass -- same idiom the password-reset flow already
    // established for "identity proven by other means, not an org-scoped session".
    const passwordHash = await argon2.hash(randomBytes(32).toString('hex'));
    const admin = await this.tenantPrisma.forTenant({ organizationId: org.id, isSuperAdmin: true }, (tx) =>
      tx.user.create({
        data: { organizationId: org.id, email: dto.adminEmail, passwordHash, role: 'org_admin' },
      }),
    );

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await this.tenantPrisma.forTenant({ organizationId: org.id, isSuperAdmin: true }, (tx) =>
      tx.passwordResetToken.create({
        data: {
          userId: admin.id,
          tokenHash,
          expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000),
        },
      }),
    );

    this.dispatchWelcomeEmail(dto.adminEmail, rawToken).catch((error) =>
      this.logger.error(`Failed to dispatch welcome email to ${dto.adminEmail}`, error as Error),
    );

    await this.audit.record(context, {
      actorUserId,
      action: 'organization.created',
      entityType: 'organization',
      entityId: org.id,
    });
    return org;
  }

  private async dispatchWelcomeEmail(email: string, rawToken: string): Promise<void> {
    const link = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/reset-password/${rawToken}`;
    await this.emailService.send({
      to: email,
      subject: 'Welcome — set up your account',
      html: `<p>An organization has been created for you on the Examination Platform. Click the link below to set your password and get started. This link expires in 15 minutes.</p><p><a href="${link}">${link}</a></p>`,
    });
  }

  async list(filters: { page?: string; pageSize?: string; search?: string } = {}): Promise<PaginatedResponse<OrganizationListItem>> {
    const { page, pageSize, skip, take } = resolvePaginationParams(filters.page, filters.pageSize);
    const where = filters.search
      ? { OR: [{ name: { contains: filters.search } }, { slug: { contains: filters.search } }] }
      : {};
    const [organizations, total] = await Promise.all([
      this.prisma.organization.findMany({ where, select: ORGANIZATION_LIST_SELECT, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.organization.count({ where }),
    ]);

    const items = await this.enrichForList(organizations);
    return buildPaginatedResponse(items, total, page, pageSize);
  }

  /**
   * Adds each organization's primary admin and its user/exam counts.
   *
   * `users` and `exams` carry RLS filter predicates, and `this.prisma` sets no
   * session context -- on the raw client the predicate matches nothing, so every
   * lookup here would come back empty with no error and every count would read
   * zero. Hence the super-admin bypass.
   *
   * All three reads share one forTenant call, which is one pooled connection.
   * Querying per organization would hold 3N, and the connection pool is this
   * platform's known concurrency ceiling.
   */
  private async enrichForList(
    organizations: { id: string; name: string; slug: string; region: string; status: string; createdAt: Date }[],
  ): Promise<OrganizationListItem[]> {
    if (organizations.length === 0) {
      return [];
    }
    const organizationIds = organizations.map((org) => org.id);

    const { admins, userCounts, examCounts } = await this.tenantPrisma.forTenant(
      { organizationId: null, isSuperAdmin: true },
      async (tx) => ({
        admins: await tx.user.findMany({
          where: { organizationId: { in: organizationIds }, role: 'org_admin' },
          select: { organizationId: true, name: true, email: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        }),
        userCounts: await tx.user.groupBy({
          by: ['organizationId'],
          where: { organizationId: { in: organizationIds } },
          _count: { _all: true },
        }),
        examCounts: await tx.exam.groupBy({
          by: ['organizationId'],
          where: { organizationId: { in: organizationIds } },
          _count: { _all: true },
        }),
      }),
    );

    // An organization can have several org_admins. `admins` is ordered oldest
    // first, so the first entry seen for an organization is its earliest -- in
    // practice the admin created alongside the organization itself.
    const primaryAdmins = new Map<string, { name: string | null; email: string }>();
    for (const admin of admins) {
      if (admin.organizationId && !primaryAdmins.has(admin.organizationId)) {
        primaryAdmins.set(admin.organizationId, { name: admin.name, email: admin.email });
      }
    }
    const userCountByOrg = new Map(userCounts.map((row) => [row.organizationId, row._count._all]));
    const examCountByOrg = new Map(examCounts.map((row) => [row.organizationId, row._count._all]));

    return organizations.map((org) => ({
      ...org,
      primaryAdminName: primaryAdmins.get(org.id)?.name ?? null,
      primaryAdminEmail: primaryAdmins.get(org.id)?.email ?? null,
      userCount: userCountByOrg.get(org.id) ?? 0,
      examCount: examCountByOrg.get(org.id) ?? 0,
    }));
  }

  async getBranding(context: TenantContext): Promise<BrandingResponse> {
    const organizationId = this.requireOrganizationId(context);
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    return this.toBrandingResponse(org!);
  }

  async updateBrandingColors(context: TenantContext, actorUserId: string, dto: UpdateBrandingColorsDto): Promise<BrandingResponse> {
    const organizationId = this.requireOrganizationId(context);
    const org = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { ...(dto.primaryColor !== undefined && { primaryColor: dto.primaryColor }), ...(dto.accentColor !== undefined && { accentColor: dto.accentColor }) },
    });
    await this.audit.record(context, {
      actorUserId,
      action: 'organization.branding_updated',
      entityType: 'organization',
      entityId: organizationId,
    });
    return this.toBrandingResponse(org);
  }

  async uploadLogo(context: TenantContext, actorUserId: string, file: Express.Multer.File): Promise<BrandingResponse> {
    const organizationId = this.requireOrganizationId(context);

    const extension = ALLOWED_LOGO_MIME_TYPES[file.mimetype];
    if (!extension) {
      throw new BadRequestException('Logo must be a PNG, JPEG, or SVG image');
    }
    if (file.size > MAX_LOGO_SIZE_BYTES) {
      throw new BadRequestException('Logo file must be 2MB or smaller');
    }

    const blobPath = `logos/${organizationId}-${Date.now()}${extension}`;
    const logoPath = await this.blobStorage.upload(blobPath, file.buffer, file.mimetype);

    const org = await this.prisma.organization.update({ where: { id: organizationId }, data: { logoPath } });
    await this.audit.record(context, {
      actorUserId,
      action: 'organization.logo_updated',
      entityType: 'organization',
      entityId: organizationId,
    });
    return this.toBrandingResponse(org);
  }

  async getPublicBrandingBySlug(slug: string): Promise<BrandingResponse> {
    const org = await this.prisma.organization.findUnique({ where: { slug } });
    if (!org) {
      throw new NotFoundException(`Organization "${slug}" not found`);
    }
    return this.toBrandingResponse(org);
  }

  async getUsage(context: TenantContext): Promise<AiCreditUsageResponse> {
    const organizationId = this.requireOrganizationId(context);

    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, include: { plan: true } });

    const grouped = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.aiCreditUsage.groupBy({ by: ['source'], where: { organizationId }, _sum: { credits: true } }),
    );

    const breakdown = { questionGeneration: 0, insightGeneration: 0 };
    for (const row of grouped) {
      const credits = row._sum.credits ?? 0;
      if (row.source === 'question_generation') {
        breakdown.questionGeneration = credits;
      } else if (row.source === 'insight_generation') {
        breakdown.insightGeneration = credits;
      }
    }

    return {
      aiCreditLimit: org!.plan.aiCreditLimit,
      totalUsed: breakdown.questionGeneration + breakdown.insightGeneration,
      breakdown,
    };
  }

  async getIntegrations(context: TenantContext): Promise<IntegrationsResponse> {
    const organizationId = this.requireOrganizationId(context);
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        smtpHost: true, smtpPort: true, emailFromAddress: true, aiApiKeyEncrypted: true, smtpPasswordEncrypted: true,
        aiProvider: true, aiBaseUrl: true, aiModelFast: true, aiModelStandard: true,
        apiKeyHash: true, apiKeyPrefix: true, apiKeyCreatedAt: true, webhookUrl: true,
      },
    });
    return {
      smtpConfigured: Boolean(org?.smtpPasswordEncrypted),
      aiKeyConfigured: Boolean(org?.aiApiKeyEncrypted),
      aiProvider: org?.aiProvider ?? 'anthropic',
      aiBaseUrl: org?.aiBaseUrl ?? null,
      aiModelFast: org?.aiModelFast ?? null,
      aiModelStandard: org?.aiModelStandard ?? null,
      smtpHost: org?.smtpHost ?? null,
      smtpPort: org?.smtpPort ?? null,
      emailFromAddress: org?.emailFromAddress ?? null,
      apiKeyConfigured: org?.apiKeyHash !== null && org?.apiKeyHash !== undefined,
      apiKeyPrefix: org?.apiKeyPrefix ?? null,
      apiKeyCreatedAt: org?.apiKeyCreatedAt ?? null,
      webhookConfigured: org?.webhookUrl !== null && org?.webhookUrl !== undefined,
      webhookUrl: org?.webhookUrl ?? null,
    };
  }

  async generateApiKey(context: TenantContext, actorUserId: string): Promise<{ apiKey: string; apiKeyPrefix: string }> {
    const organizationId = this.requireOrganizationId(context);
    const { apiKey, apiKeyPrefix, apiKeyHash } = this.generateApiKeyValue();

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { apiKeyHash, apiKeyPrefix, apiKeyCreatedAt: new Date() },
    });
    await this.audit.record(context, {
      actorUserId,
      action: 'organization.api_key_generated',
      entityType: 'organization',
      entityId: organizationId,
    });
    return { apiKey, apiKeyPrefix };
  }

  async revokeApiKey(context: TenantContext, actorUserId: string): Promise<{ apiKeyConfigured: boolean }> {
    const organizationId = this.requireOrganizationId(context);

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { apiKeyHash: null, apiKeyPrefix: null, apiKeyCreatedAt: null },
    });
    await this.audit.record(context, {
      actorUserId,
      action: 'organization.api_key_revoked',
      entityType: 'organization',
      entityId: organizationId,
    });
    return { apiKeyConfigured: false };
  }

  private generateApiKeyValue(): { apiKey: string; apiKeyPrefix: string; apiKeyHash: string } {
    const apiKey = `pk_live_${randomBytes(32).toString('hex')}`;
    const apiKeyPrefix = apiKey.slice(0, 12);
    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');
    return { apiKey, apiKeyPrefix, apiKeyHash };
  }

  async updateSmtpSettings(context: TenantContext, actorUserId: string, dto: UpdateSmtpSettingsDto): Promise<{ smtpConfigured: boolean }> {
    const organizationId = this.requireOrganizationId(context);

    const transporter = nodemailer.createTransport({
      host: dto.host,
      port: dto.port,
      auth: { user: dto.user, pass: dto.password },
    });
    try {
      await transporter.verify();
    } catch (error) {
      throw new BadRequestException(`Could not connect to that SMTP server: ${(error as Error).message}`);
    }

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        smtpHost: dto.host,
        smtpPort: dto.port,
        smtpUser: dto.user,
        smtpPasswordEncrypted: this.cryptoService.encrypt(dto.password),
        emailFromAddress: dto.fromAddress ?? null,
      },
    });
    await this.audit.record(context, {
      actorUserId,
      action: 'organization.smtp_configured',
      entityType: 'organization',
      entityId: organizationId,
    });
    return { smtpConfigured: true };
  }

  async updateAiKey(context: TenantContext, actorUserId: string, dto: UpdateAiKeyDto): Promise<{ aiKeyConfigured: boolean }> {
    const organizationId = this.requireOrganizationId(context);

    const provider: AiProvider =
      dto.provider === 'openai-compatible'
        ? new OpenAiCompatibleProvider(dto.apiKey, dto.baseUrl as string, dto.modelFast as string, dto.modelStandard as string)
        : new AnthropicProvider(dto.apiKey);

    try {
      await provider.ping();
    } catch (error) {
      throw new BadRequestException(`That API key was rejected: ${(error as Error).message}`);
    }

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        aiProvider: dto.provider,
        aiApiKeyEncrypted: this.cryptoService.encrypt(dto.apiKey),
        aiBaseUrl: dto.provider === 'openai-compatible' ? (dto.baseUrl as string) : null,
        aiModelFast: dto.provider === 'openai-compatible' ? (dto.modelFast as string) : null,
        aiModelStandard: dto.provider === 'openai-compatible' ? (dto.modelStandard as string) : null,
      },
    });
    await this.audit.record(context, {
      actorUserId,
      action: 'organization.ai_key_configured',
      entityType: 'organization',
      entityId: organizationId,
    });
    return { aiKeyConfigured: true };
  }

  async updateWebhookUrl(context: TenantContext, actorUserId: string, dto: UpdateWebhookUrlDto): Promise<{ webhookUrl: string }> {
    const organizationId = this.requireOrganizationId(context);

    await this.prisma.organization.update({ where: { id: organizationId }, data: { webhookUrl: dto.url } });
    await this.audit.record(context, {
      actorUserId,
      action: 'organization.webhook_url_updated',
      entityType: 'organization',
      entityId: organizationId,
    });
    return { webhookUrl: dto.url };
  }

  async getSsoSettings(context: TenantContext): Promise<SsoSettingsResponse> {
    const organizationId = this.requireOrganizationId(context);
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { samlEnabled: true, samlIdpEntityId: true, samlIdpSsoUrl: true, samlIdpCertificate: true },
    });
    return {
      samlEnabled: org?.samlEnabled ?? false,
      samlIdpEntityId: org?.samlIdpEntityId ?? null,
      samlIdpSsoUrl: org?.samlIdpSsoUrl ?? null,
      samlIdpCertificate: org?.samlIdpCertificate ?? null,
    };
  }

  async updateSsoSettings(context: TenantContext, actorUserId: string, dto: UpdateSsoSettingsDto): Promise<SsoSettingsResponse> {
    const organizationId = this.requireOrganizationId(context);

    // Defense-in-depth: @IsUrl on the DTO only fires behind the global ValidationPipe
    // (HTTP boundary). Re-check here so the service is safe to call directly too.
    if (dto.samlIdpSsoUrl !== undefined) {
      try {
        new URL(dto.samlIdpSsoUrl);
      } catch {
        throw new BadRequestException('That does not look like a valid SSO URL');
      }
    }

    if (dto.samlIdpCertificate !== undefined) {
      try {
        // eslint-disable-next-line no-new
        new X509Certificate(dto.samlIdpCertificate);
      } catch {
        throw new BadRequestException('That does not look like a valid X.509 certificate (PEM format)');
      }
    }

    if (dto.samlEnabled === true) {
      const current = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { samlIdpEntityId: true, samlIdpSsoUrl: true, samlIdpCertificate: true },
      });
      const entityId = dto.samlIdpEntityId ?? current?.samlIdpEntityId;
      const ssoUrl = dto.samlIdpSsoUrl ?? current?.samlIdpSsoUrl;
      const certificate = dto.samlIdpCertificate ?? current?.samlIdpCertificate;
      if (!entityId || !ssoUrl || !certificate) {
        throw new BadRequestException('Cannot enable SSO until the IdP entity ID, SSO URL, and certificate are all set');
      }
    }

    const org = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(dto.samlEnabled !== undefined && { samlEnabled: dto.samlEnabled }),
        ...(dto.samlIdpEntityId !== undefined && { samlIdpEntityId: dto.samlIdpEntityId }),
        ...(dto.samlIdpSsoUrl !== undefined && { samlIdpSsoUrl: dto.samlIdpSsoUrl }),
        ...(dto.samlIdpCertificate !== undefined && { samlIdpCertificate: dto.samlIdpCertificate }),
      },
    });
    await this.audit.record(context, {
      actorUserId,
      action: 'organization.sso_configured',
      entityType: 'organization',
      entityId: organizationId,
    });
    return {
      samlEnabled: org.samlEnabled,
      samlIdpEntityId: org.samlIdpEntityId,
      samlIdpSsoUrl: org.samlIdpSsoUrl,
      samlIdpCertificate: org.samlIdpCertificate,
    };
  }

  async generateWebhookSecret(context: TenantContext, actorUserId: string): Promise<{ webhookSecret: string }> {
    const organizationId = this.requireOrganizationId(context);
    const webhookSecret = randomBytes(32).toString('hex');

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { webhookSecretEncrypted: this.cryptoService.encrypt(webhookSecret) },
    });
    await this.audit.record(context, {
      actorUserId,
      action: 'organization.webhook_secret_generated',
      entityType: 'organization',
      entityId: organizationId,
    });
    return { webhookSecret };
  }

  async listWebhookDeliveries(context: TenantContext): Promise<{ id: string; eventType: string; status: string; httpStatusCode: number | null; createdAt: Date }[]> {
    const organizationId = this.requireOrganizationId(context);
    return this.prisma.webhookDelivery.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, eventType: true, status: true, httpStatusCode: true, createdAt: true },
    });
  }

  private requireOrganizationId(context: TenantContext): string {
    if (!context.organizationId) {
      throw new BadRequestException('No organization context for this account');
    }
    return context.organizationId;
  }

  // logoPath holds the FULL blob URL returned by blobStorage.upload(), which is
  // its only writer. The evidence container is private, so that raw URL is not
  // fetchable by a browser -- an <img src> or a favicon href pointing at it gets
  // a 403. signIfOurs() mints a short-lived read-only SAS for blobs we own and
  // passes anything else (a foreign URL, or storage being unconfigured in local
  // dev) through untouched. The value comes from our own row, never from client
  // input, which is the condition signIfOurs documents for safe use.
  //
  // Signing on the PUBLIC by-slug endpoint is intended: a login page has to show
  // the organisation's logo before anyone has authenticated.
  private async toBrandingResponse(
    org: Pick<Organization, 'name' | 'logoPath' | 'primaryColor' | 'accentColor'>,
  ): Promise<BrandingResponse> {
    return {
      name: org.name,
      logoUrl: ((await this.blobStorage.signIfOurs(org.logoPath ?? null)) as string | null) ?? null,
      primaryColor: org.primaryColor,
      accentColor: org.accentColor,
    };
  }
}
