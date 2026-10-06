import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { IdentityProvider, Prisma } from '@prisma/client';
import { X509Certificate } from 'crypto';
import { AuditService, OrgSecretsCryptoService, TenantContext, TenantPrismaService, loadTenantSecurityPolicy } from '@exam-platform/shared';
import { CreateIdentityProviderDto, UpdateIdentityProviderDto } from './dto/identity-provider.dto';
import { GOOGLE_ISSUER, assertIssuerUrl, entraIssuer } from './identity-providers';
import { SsoService } from './sso.service';
import { OidcService } from './oidc.service';

const SELECT = {
  id: true,
  organizationId: true,
  type: true,
  name: true,
  status: true,
  samlEntityId: true,
  samlSsoUrl: true,
  samlCertificate: true,
  oidcIssuer: true,
  oidcClientId: true,
  oidcClientSecretEncrypted: true,
  entraTenantId: true,
  jitEnabled: true,
  jitRole: true,
  mfaClaimValues: true,
  createdAt: true,
  updatedAt: true,
  domains: { select: { domain: true }, orderBy: { domain: 'asc' } },
} satisfies Prisma.IdentityProviderSelect;
type Row = Prisma.IdentityProviderGetPayload<{ select: typeof SELECT }>;

// Settings it is safe to show an admin: never the client secret, only whether one is set.
function view({ oidcClientSecretEncrypted, domains, ...row }: Row) {
  return { ...row, domains: domains.map((d) => d.domain), clientSecretSet: oidcClientSecretEncrypted !== null };
}

// The fields an edit may change, as stored.
type Settings = Omit<IdentityProvider, 'id' | 'organizationId' | 'type' | 'createdAt' | 'updatedAt'>;
const AUDITED: (keyof Settings)[] = [
  'name',
  'status',
  'samlEntityId',
  'samlSsoUrl',
  'samlCertificate',
  'oidcIssuer',
  'oidcClientId',
  'oidcClientSecretEncrypted',
  'entraTenantId',
  'jitEnabled',
  'jitRole',
  'mfaClaimValues',
];

// Settings › People & Access › Security › SSO providers (P12 §6.3, §7): several SAML / Google /
// Entra / generic OIDC providers per company, each with its email domains and JIT rule.
@Injectable()
export class IdentityProvidersService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly sso: SsoService,
    private readonly oidc: OidcService,
  ) {}

  private orgOf(context: TenantContext): string {
    if (!context.organizationId) {
      throw new BadRequestException('Switch into an organisation to manage its identity providers');
    }
    return context.organizationId;
  }

  async list(context: TenantContext) {
    const organizationId = this.orgOf(context);
    const rows = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.identityProvider.findMany({ where: { organizationId }, select: SELECT, orderBy: { createdAt: 'asc' } }),
    );
    return rows.map(view);
  }

  async create(context: TenantContext, actorUserId: string, dto: CreateIdentityProviderDto) {
    const organizationId = this.orgOf(context);
    if (!dto.name) throw new BadRequestException('Give the provider a name');
    const type = dto.type;
    const base: Settings = {
      name: dto.name,
      status: 'disabled',
      samlEntityId: null,
      samlSsoUrl: null,
      samlCertificate: null,
      oidcIssuer: type === 'oidc_google' ? GOOGLE_ISSUER : null,
      oidcClientId: null,
      oidcClientSecretEncrypted: null,
      entraTenantId: null,
      jitEnabled: false,
      jitRole: null,
      mfaClaimValues: [],
    };
    const { settings, domains } = await this.prepare(organizationId, type, base, [], dto);
    const id = await this.write(context, actorUserId, organizationId, null, type, base, settings, domains);
    return this.one(context, id);
  }

  async update(context: TenantContext, actorUserId: string, id: string, dto: UpdateIdentityProviderDto) {
    const organizationId = this.orgOf(context);
    const current = await this.find(context, id);
    const { oidcClientSecretEncrypted, domains: currentDomains, ...rest } = current;
    const before: Settings = { ...pick(rest), oidcClientSecretEncrypted };
    const { settings, domains } = await this.prepare(organizationId, current.type, before, currentDomains.map((d) => d.domain), dto);
    await this.write(context, actorUserId, organizationId, id, current.type, before, settings, domains);
    return this.one(context, id);
  }

  async remove(context: TenantContext, actorUserId: string, id: string) {
    const organizationId = this.orgOf(context);
    const current = await this.find(context, id);
    if (current.status === 'active') await this.assertNotLastForSsoOnly(context, organizationId, id);
    await this.tenantPrisma.forTenant(context, (tx) => tx.identityProvider.delete({ where: { id } }));
    // YX-IAM-10: every IdP change is logged.
    await this.audit.record(context, {
      actorUserId,
      action: 'identity_provider.deleted',
      entityType: 'identity_provider',
      entityId: id,
      metadata: { type: current.type, name: current.name, domains: current.domains.map((d) => d.domain) },
    });
    return { success: true };
  }

  private async find(context: TenantContext, id: string): Promise<Row> {
    const row = await this.tenantPrisma.forTenant(context, (tx) => tx.identityProvider.findFirst({ where: { id }, select: SELECT }));
    if (!row) throw new NotFoundException('Identity provider not found');
    return row;
  }

  private async one(context: TenantContext, id: string) {
    return view(await this.find(context, id));
  }

  // Applies `dto` on top of `before` and checks the result: type-specific completeness, the
  // issuer rules, valid certificate, JIT floor, and (on activation) that a generic issuer answers.
  private async prepare(organizationId: string, type: string, before: Settings, beforeDomains: string[], dto: UpdateIdentityProviderDto) {
    const next: Settings = { ...before };
    for (const key of ['name', 'status', 'jitEnabled', 'jitRole', 'mfaClaimValues'] as const) {
      if (dto[key] !== undefined) (next as Record<string, unknown>)[key] = dto[key];
    }
    const domains = dto.domains ? [...new Set(dto.domains)] : beforeDomains;

    if (type === 'saml') {
      if (dto.oidcIssuer !== undefined || dto.oidcClientId !== undefined || dto.oidcClientSecret !== undefined || dto.entraTenantId !== undefined) {
        throw new BadRequestException('A SAML provider takes an entity ID, SSO URL and certificate');
      }
      if (dto.samlEntityId !== undefined) next.samlEntityId = dto.samlEntityId;
      if (dto.samlSsoUrl !== undefined) next.samlSsoUrl = dto.samlSsoUrl;
      if (dto.samlCertificate !== undefined) {
        try {
          new X509Certificate(dto.samlCertificate);
        } catch {
          throw new BadRequestException('That does not look like a valid X.509 certificate (PEM format)');
        }
        next.samlCertificate = dto.samlCertificate;
      }
    } else {
      if (dto.samlEntityId !== undefined || dto.samlSsoUrl !== undefined || dto.samlCertificate !== undefined) {
        throw new BadRequestException('An OpenID Connect provider takes a client ID and secret');
      }
      if (dto.oidcIssuer !== undefined) {
        if (type !== 'oidc_generic') throw new BadRequestException('Google and Microsoft Entra have a fixed issuer');
        assertIssuerUrl(dto.oidcIssuer);
        next.oidcIssuer = dto.oidcIssuer.replace(/\/+$/, '');
      }
      if (dto.entraTenantId !== undefined) {
        if (type !== 'oidc_entra') throw new BadRequestException('Only a Microsoft Entra provider has a directory (tenant) ID');
        next.entraTenantId = dto.entraTenantId.toLowerCase();
        next.oidcIssuer = entraIssuer(next.entraTenantId);
      }
      if (dto.oidcClientId !== undefined) next.oidcClientId = dto.oidcClientId;
      if (dto.oidcClientSecret !== undefined) next.oidcClientSecretEncrypted = this.crypto.encrypt(dto.oidcClientSecret);
      if (!next.oidcIssuer) {
        throw new BadRequestException(type === 'oidc_entra' ? 'Enter the Microsoft Entra directory (tenant) ID' : 'Enter the issuer URL');
      }
    }

    if (next.jitEnabled) {
      if (!next.jitRole) throw new BadRequestException('Choose the role new accounts get');
      if (!domains.length) throw new BadRequestException('Just-in-time accounts need at least one email domain');
      if (!(await this.sso.jitRoleIsSafe(organizationId, next.jitRole))) {
        throw new BadRequestException('Just-in-time accounts cannot get a role with administrator, security or exam-supervision permissions');
      }
    }

    if (next.status === 'active') {
      const complete =
        type === 'saml' ? next.samlEntityId && next.samlSsoUrl && next.samlCertificate : next.oidcIssuer && next.oidcClientId && next.oidcClientSecretEncrypted;
      if (!complete) {
        throw new BadRequestException(
          type === 'saml' ? 'Set the entity ID, SSO URL and certificate before turning this provider on' : 'Set the client ID and secret before turning this provider on',
        );
      }
      // A generic issuer is whatever the admin typed: prove it answers discovery before relying on it.
      if (type === 'oidc_generic' && (before.status !== 'active' || next.oidcIssuer !== before.oidcIssuer)) {
        try {
          await this.oidc.checkIssuer(next.oidcIssuer!, next.oidcClientId!);
        } catch {
          throw new BadRequestException('Could not reach that issuer. Check the URL (its /.well-known/openid-configuration must answer).');
        }
      }
    }
    return { settings: next, domains };
  }

  private async write(
    context: TenantContext,
    actorUserId: string,
    organizationId: string,
    id: string | null,
    type: string,
    before: Settings,
    next: Settings,
    domains: string[],
  ): Promise<string> {
    if (id && before.status === 'active' && next.status !== 'active') await this.assertNotLastForSsoOnly(context, organizationId, id);
    let savedId: string;
    try {
      savedId = await this.tenantPrisma.forTenant(context, async (tx) => {
        const row = id
          ? await tx.identityProvider.update({ where: { id }, data: next, select: { id: true } })
          : await tx.identityProvider.create({ data: { ...next, organizationId, type }, select: { id: true } });
        await tx.identityProviderDomain.deleteMany({ where: { identityProviderId: row.id } });
        if (domains.length) {
          await tx.identityProviderDomain.createMany({ data: domains.map((domain) => ({ organizationId, domain, identityProviderId: row.id })) });
        }
        return row.id;
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('One of those domains already belongs to another provider');
      throw error;
    }

    // YX-IAM-10: every IdP change is logged -- which settings changed, never secret values.
    const changed = AUDITED.filter((key) => JSON.stringify(before[key]) !== JSON.stringify(next[key]));
    await this.audit.record(context, {
      actorUserId,
      action: id ? 'identity_provider.updated' : 'identity_provider.created',
      entityType: 'identity_provider',
      entityId: savedId,
      metadata: { type, name: next.name, status: next.status, changed, domains },
    });
    return savedId;
  }

  // SSO-only (YX-IAM-04) needs a provider to sign in with; the last one cannot be switched off.
  private async assertNotLastForSsoOnly(context: TenantContext, organizationId: string, id: string): Promise<void> {
    const policy = await loadTenantSecurityPolicy(this.tenantPrisma, organizationId);
    if (!policy.ssoOnly) return;
    const others = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.identityProvider.count({ where: { organizationId, status: 'active', id: { not: id } } }),
    );
    if (others === 0) throw new BadRequestException('SSO-only is on: turn it off, or add another active provider, first');
  }
}

function pick(row: Omit<Row, 'oidcClientSecretEncrypted' | 'domains'>): Omit<Settings, 'oidcClientSecretEncrypted'> {
  const { id: _id, organizationId: _org, type: _type, createdAt: _c, updatedAt: _u, ...settings } = row;
  return settings;
}
