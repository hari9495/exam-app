import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { CREATABLE_ROLES } from '../rbac/roles';
import { assertPublicHttpsUrl } from '../common/ssrf';

// Sign-in identity providers (P12 §4, YX-IAM-04/05; Q2 wave 1).
export const IDP_TYPES = ['saml', 'oidc_google', 'oidc_entra', 'oidc_generic'] as const;
export type IdpType = (typeof IDP_TYPES)[number];

export const GOOGLE_ISSUER = 'https://accounts.google.com';
export const entraIssuer = (tenantId: string) => `https://login.microsoftonline.com/${tenantId}/v2.0`;

// JIT may create staff in these roles only, and only while the role (with the company's own
// overrides) holds no sensitive permission -- checked when saved and again at provisioning.
export const JIT_ROLES: readonly string[] = CREATABLE_ROLES.filter((role) => role !== 'org_admin');

// "The IdP did MFA" (P12 §3: SSO is AAL2 only where the IdP enforces MFA). OIDC: amr contains
// "mfa" (RFC 8176) or one of these acr values. SAML: one of these AuthnContextClassRef / Entra /
// ADFS authnmethodsreferences values. Fixed: not configurable by a company (YX-IAM-01).
export const OIDC_MFA_ACR_VALUES: readonly string[] = ['https://refeds.org/profile/mfa', 'http://schemas.openid.net/pape/policies/2007/06/multi-factor'];
export const SAML_MFA_CONTEXT_VALUES: readonly string[] = ['https://refeds.org/profile/mfa', 'http://schemas.microsoft.com/claims/multipleauthn'];

export const NO_SSO_MESSAGE = 'Single sign-on is not set up for this account';

export const emailDomain = (email: string) => email.slice(email.lastIndexOf('@') + 1).toLowerCase();

// Is any provider switched on? Drives SSO-only, the login page and unusable passwords for new staff.
export async function hasActiveIdentityProvider(tx: Prisma.TransactionClient, organizationId: string): Promise<boolean> {
  return (await tx.identityProvider.count({ where: { organizationId, status: 'active' } })) > 0;
}

// The server fetches discovery + JWKS from a generic issuer, so it must be a public https host.
// A loopback http issuer (local Keycloak, the test issuer) is accepted outside production only.
export function assertIssuerUrl(raw: string): void {
  const url = new URL(raw);
  if (process.env.NODE_ENV !== 'production' && isLoopback(url)) return;
  try {
    assertPublicHttpsUrl(url);
  } catch {
    throw new BadRequestException('The issuer must be a public https URL');
  }
}

export function isLoopback(url: URL): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}
