import type { OidcClaims } from './oidc.service';
import { isLoopback } from './identity-providers';

// "Continue with Google / Microsoft" on the YukthiX sign-in screen (founder request 7 Oct 2026; P12
// Q2): YukthiX's own OIDC apps, the company not known up front. Off until both client id and secret
// are set; the buttons are hidden then. Companies opt in per method (tenant security policy).

export const SOCIAL_PROVIDERS = ['google', 'microsoft'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];
export const isSocialProvider = (value: unknown): value is SocialProvider => value === 'google' || value === 'microsoft';

export interface SocialApp {
  issuer: string;
  clientId: string;
  clientSecret: string;
}

// Microsoft multi-tenant ("common"): openid-client checks each ID token's `iss` against the tenant
// (`tid`) it names.
const ISSUERS: Record<SocialProvider, string> = {
  google: 'https://accounts.google.com',
  microsoft: 'https://login.microsoftonline.com/common/v2.0',
};
const ENV_PREFIX: Record<SocialProvider, string> = { google: 'YX_GOOGLE', microsoft: 'YX_MICROSOFT' };

// The local mock identity provider (scripts/mock-idp.mjs, `npm run dev:mock-idp`) registers exactly
// these clients. Development and tests only.
export const MOCK_IDP_CLIENTS: Record<SocialProvider, { clientId: string; clientSecret: string }> = {
  google: { clientId: 'yx-mock-google', clientSecret: 'yx-mock-google-secret' },
  microsoft: { clientId: 'yx-mock-microsoft', clientSecret: 'yx-mock-microsoft-secret' },
};

// YX_MOCK_IDP_URL points both buttons at the mock. Refused outright in production (the API will not
// start) and anywhere but a loopback address, so it can never send real people to a fake issuer.
export function mockIdpUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.YX_MOCK_IDP_URL?.trim();
  if (!raw) return null;
  if (env.NODE_ENV === 'production') throw new Error('YX_MOCK_IDP_URL is for local development and tests only: unset it in production');
  const url = new URL(raw);
  if (!isLoopback(url)) throw new Error('YX_MOCK_IDP_URL must be a loopback address (127.0.0.1 / localhost)');
  return url.href.replace(/\/+$/, '');
}

export function socialApp(provider: SocialProvider, env: NodeJS.ProcessEnv = process.env): SocialApp | null {
  const mock = mockIdpUrl(env);
  if (mock) return { issuer: `${mock}/${provider}`, ...MOCK_IDP_CLIENTS[provider] };
  const clientId = env[`${ENV_PREFIX[provider]}_CLIENT_ID`]?.trim();
  const clientSecret = env[`${ENV_PREFIX[provider]}_CLIENT_SECRET`]?.trim();
  return clientId && clientSecret ? { issuer: ISSUERS[provider], clientId, clientSecret } : null;
}

// One redirect URI per provider (registered in that provider's console): a response can only come
// back on the path of the provider the sign-in was started with (IdP mix-up, RFC 9700 §4.4).
export const socialRedirectUri = (provider: SocialProvider) => `${process.env.API_ORIGIN}/api/v1/auth/social/${provider}/callback`;

// Personal Microsoft accounts (outlook.com, hotmail.com ...) all carry this tenant id.
export const MICROSOFT_CONSUMER_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad';

export interface SocialIdentity {
  // Google `sub`; Microsoft `<tid>:<oid>` -- stable, never reassigned, never an email address.
  subject: string;
  // An address the provider vouches the person controls: matches accounts in any company.
  email: string | null;
  // Microsoft work / school sign-in name: matches only accounts of a company that verified its domain.
  domainEmail: string | null;
  name: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const address = (value: unknown) => {
  const v = text(value)?.toLowerCase();
  return v && v.length <= 320 && EMAIL_RE.test(v) ? v : null;
};

// What a validated ID token proves, or null when it names no stable subject.
//  - Google: the address only when `email_verified` is true.
//  - Microsoft: NEVER the plain `email` claim, which a directory admin can set to anyone's address
//    ("nOAuth"). The address counts when Microsoft marks it verified (`xms_edov`); otherwise only a
//    work / school account's sign-in name (UPN), whose domain that directory has verified -- and a
//    domain can be verified by one Microsoft directory only -- and only for a company that has
//    verified the same domain with YukthiX (AuthService). Personal accounts never use that path.
export function socialIdentity(provider: SocialProvider, claims: OidcClaims): SocialIdentity | null {
  const name = text(claims.name);
  if (provider === 'google') {
    const sub = text(claims.sub);
    return sub ? { subject: sub, email: claims.email_verified === true ? address(claims.email) : null, domainEmail: null, name } : null;
  }
  const tid = text(claims.tid);
  const oid = text(claims.oid);
  if (!tid || !oid) return null;
  return {
    subject: `${tid}:${oid}`,
    email: claims.xms_edov === true ? address(claims.email) : null,
    domainEmail: tid.toLowerCase() === MICROSOFT_CONSUMER_TENANT ? null : address(claims.preferred_username),
    name,
  };
}
