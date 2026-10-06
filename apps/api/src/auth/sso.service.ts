import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { IdentityProvider } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import {
  AuditService,
  PrismaService,
  SENSITIVE_ROLE_PERMISSIONS,
  TenantContext,
  TenantPrismaService,
  isOrganizationActive,
  resolvePermissionGrants,
} from '@exam-platform/shared';
import { JIT_ROLES, NO_SSO_MESSAGE, OIDC_MFA_ACR_VALUES, SAML_MFA_CONTEXT_VALUES, emailDomain } from './identity-providers';
import type { OidcClaims } from './oidc.service';

// What every IdP sign-in (SAML or OIDC) has in common once the assertion itself is verified:
// which account it is (domain rules + JIT, YX-IAM-04/05), whether the IdP did MFA (AAL2, P12 §3),
// and the short single-use code the browser trades for a session (POST /auth/sso/exchange).

export type ProviderWithDomains = IdentityProvider & { domains: { domain: string }[] };
export interface SsoAccount {
  id: string;
  email: string;
  role: string;
  organizationId: string | null;
}
export type SsoResolution = { user: SsoAccount } | { reason: string };

const SSO_LOGIN_CODE_EXPIRY_SECONDS = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const tenant = (organizationId: string): TenantContext => ({ organizationId, isSuperAdmin: false });

// Which email the ID token vouches for, by provider type; null = not one we may trust.
//  - Google: a verified address inside the company's Google Workspace (`hd`), so a personal
//    Google account registered with a work address is refused.
//  - Entra: only tokens from the configured directory (`tid`); the address is the UPN (a domain
//    the directory has verified), or `email` only when Entra marks it verified (`xms_edov`).
//  - Generic: `email_verified` must be true.
export function oidcEmail(provider: Pick<IdentityProvider, 'type' | 'entraTenantId'>, claims: OidcClaims): string | null {
  let email: unknown;
  if (provider.type === 'oidc_google') {
    email = claims.email_verified === true && typeof claims.email === 'string' && claims.hd === emailDomain(claims.email) ? claims.email : null;
  } else if (provider.type === 'oidc_entra') {
    if (!provider.entraTenantId || claims.tid !== provider.entraTenantId) return null;
    email = claims.xms_edov === true && claims.email ? claims.email : claims.preferred_username;
  } else {
    email = claims.email_verified === true ? claims.email : null;
  }
  return typeof email === 'string' && EMAIL_RE.test(email) ? email.toLowerCase() : null;
}

// Only these fixed values count: a company cannot declare a password-only sign-in to be MFA,
// which would waive the floor for its sensitive roles (YX-IAM-01).
export function oidcMfaAsserted(claims: OidcClaims): boolean {
  const acr = typeof claims.acr === 'string' ? claims.acr : null;
  return (Array.isArray(claims.amr) && claims.amr.includes('mfa')) || (acr !== null && OIDC_MFA_ACR_VALUES.includes(acr));
}

// SAML: the assertion's AuthnContextClassRef, or Entra's authnmethodsreferences attribute.
export function samlMfaAsserted(assertion: unknown, attributes: Record<string, unknown>): boolean {
  const values: string[] = [];
  // xml2js shape: { ..., AuthnContextClassRef: ['value' | { _: 'value' }] } at any depth.
  const walk = (node: unknown, inClassRef: boolean): void => {
    if (typeof node === 'string') {
      if (inClassRef) values.push(node.trim());
    } else if (Array.isArray(node)) {
      node.forEach((child) => walk(child, inClassRef));
    } else if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) walk(child, inClassRef ? key === '_' : /(^|:)AuthnContextClassRef$/.test(key));
    }
  };
  walk(assertion, false);
  const methods = attributes['http://schemas.microsoft.com/claims/authnmethodsreferences'];
  values.push(...([] as unknown[]).concat(methods ?? []).filter((v): v is string => typeof v === 'string'));
  return values.some((value) => SAML_MFA_CONTEXT_VALUES.includes(value));
}

@Injectable()
export class SsoService {
  private readonly logger = new Logger(SsoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async organizationBySlug(slug: string) {
    const org = await this.prisma.organization.findUnique({ where: { slug }, select: { id: true, slug: true, status: true } });
    return org && isOrganizationActive(org.status) ? org : null;
  }

  activeProviders(organizationId: string): Promise<ProviderWithDomains[]> {
    return this.tenantPrisma.forTenant(tenant(organizationId), (tx) =>
      tx.identityProvider.findMany({
        where: { organizationId, status: 'active' },
        include: { domains: { select: { domain: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  async activeProvider(organizationId: string, providerId: string): Promise<ProviderWithDomains | null> {
    return (await this.activeProviders(organizationId)).find((p) => p.id === providerId) ?? null;
  }

  // Which provider signs this person in: the one named, else the one owning the email's domain,
  // else -- the pre-1e set-up, one provider with no domains -- that one.
  async route(organizationId: string, choice: { providerId?: string; email?: string }): Promise<ProviderWithDomains> {
    const providers = await this.activeProviders(organizationId);
    let provider: ProviderWithDomains | undefined;
    if (choice.providerId) {
      provider = providers.find((p) => p.id === choice.providerId);
    } else {
      const domain = choice.email ? emailDomain(choice.email) : null;
      provider = (domain && providers.find((p) => p.domains.some((d) => d.domain === domain))) || undefined;
      if (!provider && providers.length === 1 && providers[0].domains.length === 0) provider = providers[0];
    }
    if (!provider) throw new NotFoundException(NO_SSO_MESSAGE);
    return provider;
  }

  // The account the IdP has vouched for. A provider only speaks for its own domains: a domain
  // mapped to another provider of this company is refused, and a provider with domains refuses
  // every other domain. Missing accounts are created only by JIT, only for a mapped domain, and
  // only into a role that holds no sensitive permission (YX-IAM-05).
  async resolveUser(provider: ProviderWithDomains, rawEmail: string, displayName?: string): Promise<SsoResolution> {
    const email = rawEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return { reason: 'no_verified_email' };
    const domain = emailDomain(email);
    const organizationId = provider.organizationId;
    const ownDomain = provider.domains.some((d) => d.domain === domain);

    const { owner, existing } = await this.tenantPrisma.forTenant(tenant(organizationId), async (tx) => ({
      owner: await tx.identityProviderDomain.findUnique({ where: { organizationId_domain: { organizationId, domain } } }),
      existing: await tx.user.findFirst({ where: { organizationId, email }, select: { id: true, email: true, role: true, organizationId: true } }),
    }));
    if (owner ? owner.identityProviderId !== provider.id : provider.domains.length > 0) return { reason: 'domain_not_allowed' };
    if (existing) return { user: existing };
    if (!provider.jitEnabled || !provider.jitRole || !ownDomain) return { reason: 'not_provisioned' };
    if (!(await this.jitRoleIsSafe(organizationId, provider.jitRole))) {
      this.logger.warn(`JIT refused for provider ${provider.id}: role ${provider.jitRole} now holds a sensitive permission`);
      return { reason: 'jit_role_sensitive' };
    }

    const passwordHash = await argon2.hash(randomBytes(32).toString('hex')); // unusable: SSO accounts sign in through the IdP
    const name = (typeof displayName === 'string' && displayName.trim()) || email.slice(0, email.indexOf('@'));
    let user: SsoAccount;
    try {
      user = await this.tenantPrisma.forTenant(tenant(organizationId), (tx) =>
        tx.user.create({
          data: { organizationId, email, name: name.slice(0, 200), passwordHash, role: provider.jitRole! },
          select: { id: true, email: true, role: true, organizationId: true },
        }),
      );
    } catch (error) {
      // Two first sign-ins racing: the other one created the account.
      if ((error as { code?: string }).code !== 'P2002') throw error;
      const raced = await this.tenantPrisma.forTenant(tenant(organizationId), (tx) =>
        tx.user.findFirst({ where: { organizationId, email }, select: { id: true, email: true, role: true, organizationId: true } }),
      );
      if (!raced) throw error;
      return { user: raced };
    }
    await this.audit.record(tenant(organizationId), {
      actorUserId: null,
      action: 'user.jit_provisioned',
      entityType: 'user',
      entityId: user.id,
      metadata: { identityProviderId: provider.id, role: user.role },
    });
    return { user };
  }

  // A JIT role is safe while the company's effective grants for it hold no sensitive permission.
  async jitRoleIsSafe(organizationId: string, role: string): Promise<boolean> {
    if (!JIT_ROLES.includes(role)) return false;
    const grants = await resolvePermissionGrants(this.prisma, this.tenantPrisma, { role, organizationId }, [...SENSITIVE_ROLE_PERMISSIONS]);
    return SENSITIVE_ROLE_PERMISSIONS.every((key) => !grants.has(key));
  }

  // The browser trades this for a session within 60 s, once. Only its sha256 is stored.
  async mintLoginCode(userId: string, method: 'saml' | 'oidc', mfaAsserted: boolean): Promise<string> {
    const rawCode = randomBytes(32).toString('hex');
    await this.prisma.ssoLoginCode.create({
      data: {
        userId,
        codeHash: createHash('sha256').update(rawCode).digest('hex'),
        expiresAt: new Date(Date.now() + SSO_LOGIN_CODE_EXPIRY_SECONDS * 1000),
        method,
        mfaAsserted,
      },
    });
    return rawCode;
  }
}
