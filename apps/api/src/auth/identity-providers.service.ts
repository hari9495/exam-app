import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { IdentityProvider, Prisma } from '@prisma/client';
import { X509Certificate } from 'crypto';
import { AuditService, OrgSecretsCryptoService, TenantContext, TenantPrismaService, loadTenantSecurityPolicy, revokeStaffSessions } from '@exam-platform/shared';
import { CreateIdentityProviderDto, UpdateIdentityProviderDto } from './dto/identity-provider.dto';
import { DOMAIN_VERIFICATION_PREFIX, GOOGLE_ISSUER, assertIssuerUrl, entraIssuer, isPublicMailDomain } from './identity-providers';
import { SsoService } from './sso.service';
import { OidcService } from './oidc.service';
import { SessionsService } from './sessions.service';
import { escapeHtml } from '../notifications/notification-email-render';

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
  mfaTrusted: true,
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
  'mfaTrusted',
];

// DNS TXT lookups for domain ownership; injectable so tests answer without the network.
export const DNS_TXT_RESOLVER = 'DNS_TXT_RESOLVER';
export type TxtResolver = (name: string) => Promise<string[][]>;

// One TXT look-up: the record is there, it is not (the name has no TXT records or does not exist), or
// DNS could not say (timeout, SERVFAIL, refused...) -- which proves nothing either way.
export type TxtCheck = 'found' | 'missing' | 'unknown';
const DNS_ANSWERED_NO = new Set(['ENODATA', 'ENOTFOUND']);
export async function checkTxt(resolveTxt: TxtResolver, domain: string, expected: string): Promise<TxtCheck> {
  try {
    return (await resolveTxt(domain)).some((chunks) => chunks.join('') === expected) ? 'found' : 'missing';
  } catch (error) {
    return DNS_ANSWERED_NO.has((error as { code?: string }).code ?? '') ? 'missing' : 'unknown';
  }
}

// After how many consecutive real misses a verified domain lapses (W-006). Configurable, at least 1.
export function domainRecheckMaxFailures(env = process.env.DOMAIN_RECHECK_MAX_FAILURES): number {
  const n = Number(env);
  return Number.isInteger(n) && n >= 1 ? n : 3;
}

// The consecutive-miss counter after one re-check: a find resets it, a transient DNS error leaves it
// alone, a real miss adds one; `lapse` once it reaches the limit.
export function afterRecheck(failedChecks: number, outcome: TxtCheck, maxFailures: number): { failedChecks: number; lapse: boolean } {
  const next = outcome === 'found' ? 0 : outcome === 'missing' ? failedChecks + 1 : failedChecks;
  return { failedChecks: next, lapse: next >= maxFailures };
}

// Removes the company's verified domains that none of its providers maps any more (a claim lives
// only as long as the mapping).
async function pruneVerifiedDomains(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
  const mapped = await tx.identityProviderDomain.findMany({ where: { organizationId }, select: { domain: true } });
  await tx.verifiedDomain.deleteMany({ where: { organizationId, domain: { notIn: mapped.map((d) => d.domain) } } });
}

// Settings › People & Access › Security › SSO providers (P12 §6.3, §7): several SAML / Google /
// Entra / generic OIDC providers per company, each with its email domains and JIT rule.
@Injectable()
export class IdentityProvidersService {
  private readonly logger = new Logger(IdentityProvidersService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly sso: SsoService,
    private readonly oidc: OidcService,
    private readonly sessions: SessionsService,
    @Inject(DNS_TXT_RESOLVER) private readonly resolveTxt: TxtResolver,
  ) {}

  // Whoever controls a sign-in provider can sign in as anyone at its domains, so every change
  // reaches all of the company's administrators, not only the audit log (YX-IAM-04/10).
  private alertAdmins(organizationId: string, actorUserId: string, what: string): void {
    this.sessions.notifyAdmins(
      organizationId,
      'Single sign-on settings changed in your YukthiX organisation',
      `<p>${escapeHtml(what)}</p><p>Changed by user ${escapeHtml(actorUserId)} at ${escapeHtml(new Date().toISOString())}.</p>` +
        '<p>If this was not expected, review <b>Settings &rsaquo; Single Sign-On</b> and the audit log at once.</p>',
    );
  }

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
      mfaTrusted: false,
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
    const beforeDomains = currentDomains.map((d) => d.domain);
    const { settings, domains } = await this.prepare(organizationId, current.type, before, beforeDomains, dto);
    await this.write(context, actorUserId, organizationId, id, current.type, before, settings, domains, beforeDomains);
    return this.one(context, id);
  }

  async remove(context: TenantContext, actorUserId: string, id: string) {
    const organizationId = this.orgOf(context);
    const current = await this.find(context, id);
    if (current.status === 'active') await this.assertNotLastForSsoOnly(context, organizationId, id);
    // YX-IAM-05: the sessions it signed in end with it (same transaction, before the link is cleared).
    const sessionsRevoked = await this.tenantPrisma.forTenant(context, async (tx) => {
      const revoked = await revokeStaffSessions(tx, { identityProviderId: id }, 'identity_provider_removed');
      await tx.identityProvider.delete({ where: { id } });
      await pruneVerifiedDomains(tx, organizationId);
      return revoked;
    });
    // YX-IAM-10: every IdP change is logged.
    await this.audit.record(context, {
      actorUserId,
      action: 'identity_provider.deleted',
      entityType: 'identity_provider',
      entityId: id,
      metadata: { type: current.type, name: current.name, domains: current.domains.map((d) => d.domain), sessionsRevoked },
    });
    this.alertAdmins(organizationId, actorUserId, `The identity provider "${current.name}" was removed.`);
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
    for (const key of ['name', 'status', 'jitEnabled', 'jitRole', 'mfaTrusted'] as const) {
      if (dto[key] !== undefined) (next as Record<string, unknown>)[key] = dto[key];
    }
    const domains = dto.domains ? [...new Set(dto.domains)] : beforeDomains;
    const publicDomain = dto.domains?.find(isPublicMailDomain);
    if (publicDomain) throw new BadRequestException(`${publicDomain} is a public email domain. Single sign-on needs your company's own domain.`);

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
        await assertIssuerUrl(dto.oidcIssuer);
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
    beforeDomains: string[] = [],
  ): Promise<string> {
    if (id && before.status === 'active' && next.status !== 'active') await this.assertNotLastForSsoOnly(context, organizationId, id);
    let savedId: string;
    // YX-IAM-05: switching a provider off ends every session it signed in (within the request).
    const disabling = Boolean(id) && before.status === 'active' && next.status !== 'active';
    let sessionsRevoked = 0;
    try {
      savedId = await this.tenantPrisma.forTenant(context, async (tx) => {
        const row = id
          ? await tx.identityProvider.update({ where: { id }, data: next, select: { id: true } })
          : await tx.identityProvider.create({ data: { ...next, organizationId, type }, select: { id: true } });
        await tx.identityProviderDomain.deleteMany({ where: { identityProviderId: row.id } });
        if (domains.length) {
          await tx.identityProviderDomain.createMany({ data: domains.map((domain) => ({ organizationId, domain, identityProviderId: row.id })) });
        }
        await pruneVerifiedDomains(tx, organizationId);
        if (disabling) sessionsRevoked = await revokeStaffSessions(tx, { identityProviderId: row.id }, 'identity_provider_disabled');
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
      metadata: { type, name: next.name, status: next.status, changed, domains, ...(disabling ? { sessionsRevoked } : {}) },
    });
    if (!id || changed.length || JSON.stringify(domains) !== JSON.stringify(beforeDomains)) {
      this.alertAdmins(
        organizationId,
        actorUserId,
        `The identity provider "${next.name}" was ${id ? 'changed' : 'added'} (${next.status === 'active' ? 'on' : 'off'}; domains: ${domains.join(', ') || 'none'}).`,
      );
    }
    return savedId;
  }

  // ---- domain ownership (email-first routing) -------------------------------------------------

  // The TXT value this company must publish on `domain`.
  verificationValue(organizationId: string, domain: string): string {
    return DOMAIN_VERIFICATION_PREFIX + this.crypto.hmac('domain-verification', `${organizationId}\u0000${domain}`).slice(0, 32);
  }

  // The company's provider domains: verified or not, and the TXT record that proves each.
  async domains(context: TenantContext) {
    const organizationId = this.orgOf(context);
    const { mapped, verified } = await this.tenantPrisma.forTenant(context, async (tx) => ({
      mapped: await tx.identityProviderDomain.findMany({ where: { organizationId }, select: { domain: true }, orderBy: { domain: 'asc' } }),
      verified: await tx.verifiedDomain.findMany({ where: { organizationId } }),
    }));
    return mapped.map(({ domain }) => {
      const row = verified.find((v) => v.domain === domain);
      return {
        domain,
        verifiedAt: row && !row.lapsedAt ? row.verifiedAt : null,
        lapsedAt: row?.lapsedAt ?? null,
        txtRecord: { name: domain, value: this.verificationValue(organizationId, domain) },
      };
    });
  }

  // Looks the TXT record up now. Found: the domain routes email-first sign-ins to this company's
  // provider (unless another company has verified it too). Public mail domains are never claimable.
  async verifyDomain(context: TenantContext, actorUserId: string, domain: string) {
    const organizationId = this.orgOf(context);
    if (isPublicMailDomain(domain)) throw new BadRequestException(`${domain} is a public email domain and cannot be verified.`);
    const mapped = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.identityProviderDomain.findUnique({ where: { organizationId_domain: { organizationId, domain } } }),
    );
    if (!mapped) throw new NotFoundException('Add this domain to one of your identity providers first');
    const expected = this.verificationValue(organizationId, domain);
    const records = await this.resolveTxt(domain).catch(() => [] as string[][]);
    if (!records.some((chunks) => chunks.join('') === expected)) {
      throw new BadRequestException(`No TXT record "${expected}" on ${domain} yet. DNS changes can take a few hours; try again later.`);
    }
    // Also how a lapsed domain is restored: the miss counter and the lapse are cleared.
    const now = new Date();
    const row = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.verifiedDomain.upsert({
        where: { organizationId_domain: { organizationId, domain } },
        create: { organizationId, domain, verifiedAt: now, lastCheckedAt: now },
        update: { verifiedAt: now, lastCheckedAt: now, failedChecks: 0, lapsedAt: null },
      }),
    );
    await this.audit.record(context, { actorUserId, action: 'identity_provider.domain_verified', entityType: 'organization', entityId: organizationId, metadata: { domain } });
    this.alertAdmins(organizationId, actorUserId, `The domain ${domain} was verified: people with an @${domain} email now go straight to your identity provider.`);
    return { domain, verifiedAt: row.verifiedAt };
  }

  // Scheduled re-check of every verified domain (W-006; the 'domain-verification-recheck' sweep). A
  // domain whose TXT record is really gone DOMAIN_RECHECK_MAX_FAILURES times in a row lapses: it stops
  // routing sign-ins at once (SsoService skips lapsed rows), the company's admins are told and it is
  // audited. A transient DNS error counts for nothing. Lapsed domains wait for an admin's Check record.
  // ponytail: sequential look-ups (3 s timeout, 2 tries each); batch with a concurrency cap if the
  // number of verified domains ever makes the nightly run slow.
  async recheckDomains(): Promise<{ checked: number; lapsed: number }> {
    const maxFailures = domainRecheckMaxFailures();
    const rows = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.verifiedDomain.findMany({ where: { lapsedAt: null }, select: { organizationId: true, domain: true, verifiedAt: true, failedChecks: true } }),
    );
    let checked = 0;
    let lapsed = 0;
    for (const row of rows) {
      // One domain's failure never stops the others' checks.
      try {
        const result = await this.recheckDomain(row, maxFailures);
        if (result === 'unknown') this.logger.warn(`Could not look up the TXT record of ${row.domain}; will try again next run`);
        else checked++;
        if (result === 'lapsed') lapsed++;
      } catch (error) {
        this.logger.error(`Re-check of ${row.domain} failed: ${(error as Error).message}`);
      }
    }
    return { checked, lapsed };
  }

  private async recheckDomain(
    row: { organizationId: string; domain: string; verifiedAt: Date; failedChecks: number },
    maxFailures: number,
  ): Promise<'unknown' | 'recorded' | 'lapsed'> {
    const outcome = await checkTxt(this.resolveTxt, row.domain, this.verificationValue(row.organizationId, row.domain));
    if (outcome === 'unknown') return 'unknown';
    const { failedChecks, lapse } = afterRecheck(row.failedChecks, outcome, maxFailures);
    const context: TenantContext = { organizationId: row.organizationId, isSuperAdmin: false };
    const now = new Date();
    // Only if nothing changed since it was read: an admin's re-verify in between wins.
    const { count } = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.verifiedDomain.updateMany({
        where: { organizationId: row.organizationId, domain: row.domain, verifiedAt: row.verifiedAt, failedChecks: row.failedChecks, lapsedAt: null },
        data: { lastCheckedAt: now, failedChecks, ...(lapse ? { lapsedAt: now } : {}) },
      }),
    );
    if (!lapse || count !== 1) return 'recorded';
    await this.audit.record(context, {
      actorUserId: null,
      action: 'identity_provider.domain_lapsed',
      entityType: 'organization',
      entityId: row.organizationId,
      metadata: { domain: row.domain, failedChecks },
    });
    this.sessions.notifyAdmins(
      row.organizationId,
      'A verified email domain lapsed in your YukthiX organisation',
      `<p>The TXT record that proves your organisation owns <b>${escapeHtml(row.domain)}</b> was not found in ${failedChecks} checks in a row.</p>` +
        `<p>People with an @${escapeHtml(row.domain)} email are no longer sent straight to your identity provider.</p>` +
        '<p>If the domain is still yours, put the record back and use <b>Check record</b> in <b>Settings &rsaquo; Security</b>. If it is not, remove it from your identity providers.</p>',
    );
    return 'lapsed';
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
