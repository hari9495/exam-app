import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { IdentityProvider } from '@prisma/client';
import Redis from 'ioredis';
import { createHash, timingSafeEqual } from 'crypto';
import * as client from 'openid-client';
import { OrgSecretsCryptoService } from '@exam-platform/shared';
import { LOGIN_PROTECTION_REDIS } from './login-protection.service';
import { isLoopback } from './identity-providers';
import { publicHttpsFetch } from '../common/ssrf';
import { SocialApp, SocialProvider, socialRedirectUri } from './social-sign-in';

// OpenID Connect sign-in (Google, Microsoft Entra, generic) via openid-client: authorization code
// flow with PKCE (S256), state and nonce; the library validates the ID token's signature against
// the issuer's JWKS, and its iss / aud / azp / exp / iat / nonce (YX-IAM-04, Q2).

export const OIDC_STATE_TTL_SECONDS = 600;
const CONFIG_TTL_MS = 60 * 60 * 1000;
const DISCOVERY_TIMEOUT_SECONDS = 10;

// One sign-in in flight, kept server-side and bound to the browser that started it (login CSRF).
export interface OidcPending {
  providerId: string;
  organizationId: string;
  nonce: string;
  codeVerifier: string;
  deviceIdHash: string;
}

// "Continue with Google / Microsoft": the same, for YukthiX's own apps; the company is not known yet
// (scopeSlug: the web address / remembered company, if any).
export interface SocialPending {
  provider: SocialProvider;
  scopeSlug: string | null;
  nonce: string;
  codeVerifier: string;
  deviceIdHash: string;
}

export type OidcClaims = client.IDToken;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const stateKey = (state: string) => `auth:oidc:state:${sha256(state)}`;
// A separate namespace: a company sign-in's state can never finish a Google / Microsoft one, or back.
const socialStateKey = (state: string) => `auth:social:state:${sha256(state)}`;

@Injectable()
export class OidcService {
  // Discovery result per provider version (id + updatedAt): an edit is picked up at once.
  private readonly configs = new Map<string, { version: number; at: number; config: Promise<client.Configuration> }>();

  constructor(
    private readonly crypto: OrgSecretsCryptoService,
    @Inject(LOGIN_PROTECTION_REDIS) private readonly redis: Redis,
  ) {}

  static redirectUri(): string {
    return `${process.env.API_ORIGIN}/api/v1/auth/oidc/callback`;
  }

  configuration(provider: IdentityProvider): Promise<client.Configuration> {
    const version = provider.updatedAt.getTime();
    const cached = this.configs.get(provider.id);
    if (cached && cached.version === version && Date.now() - cached.at < CONFIG_TTL_MS) {
      return cached.config;
    }
    const config = this.discover(provider.oidcIssuer!, provider.oidcClientId!, this.crypto.decrypt(provider.oidcClientSecretEncrypted!));
    config.catch(() => this.configs.delete(provider.id));
    this.configs.set(provider.id, { version, at: Date.now(), config });
    return config;
  }

  // Does this issuer answer discovery? (Checked before a generic provider is switched on.)
  async checkIssuer(issuer: string, clientId: string): Promise<void> {
    await this.discover(issuer, clientId, undefined);
  }

  private discover(issuerUrl: string, clientId: string, clientSecret: string | undefined): Promise<client.Configuration> {
    const issuer = new URL(issuerUrl);
    // http is only ever accepted for a loopback issuer outside production (assertIssuerUrl).
    const devLoopback = process.env.NODE_ENV !== 'production' && isLoopback(issuer);
    const execute = [
      // Verify the ID token's signature against the issuer's JWKS, not only TLS to the token
      // endpoint (openid-client skips it by default, as OIDC Core allows).
      client.enableNonRepudiationChecks,
      ...(devLoopback ? [client.allowInsecureRequests] : []),
    ];
    // SSRF (ASVS V12.6 / V5.2.6): discovery and every URL the discovery document names (token
    // endpoint, JWKS, userinfo) are fetched over https to public addresses only, each connection
    // pinned to the address that was checked. A tenant admin types the issuer; the document it
    // serves cannot point the server at internal hosts.
    return client.discovery(issuer, clientId, clientSecret, undefined, {
      timeout: DISCOVERY_TIMEOUT_SECONDS,
      execute,
      ...(devLoopback ? {} : { [client.customFetch]: publicHttpsFetch as client.CustomFetch }),
    });
  }

  // Step 1: remember state / nonce / PKCE verifier for this browser, return the IdP's URL.
  async begin(provider: IdentityProvider, deviceId: string, loginHint?: string): Promise<string> {
    const config = await this.configuration(provider);
    const state = client.randomState();
    const nonce = client.randomNonce();
    const codeVerifier = client.randomPKCECodeVerifier();
    const pending: OidcPending = { providerId: provider.id, organizationId: provider.organizationId, nonce, codeVerifier, deviceIdHash: sha256(deviceId) };
    await this.store(() => this.redis.set(stateKey(state), JSON.stringify(pending), 'EX', OIDC_STATE_TTL_SECONDS));
    return client.buildAuthorizationUrl(config, {
      redirect_uri: OidcService.redirectUri(),
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      ...(loginHint ? { login_hint: loginHint } : {}),
    }).href;
  }

  // Single use: the state is deleted as it is read, whoever presents it.
  async takeState(state: string): Promise<OidcPending | null> {
    const raw = await this.store(() => this.redis.getdel(stateKey(state)));
    return raw ? (JSON.parse(raw) as OidcPending) : null;
  }

  // "Continue with Google / Microsoft", step 1. One discovery per provider per process (refreshed hourly).
  async beginSocial(provider: SocialProvider, app: SocialApp, deviceId: string, scopeSlug: string | null): Promise<string> {
    const config = await this.socialConfiguration(provider, app);
    const state = client.randomState();
    const nonce = client.randomNonce();
    const codeVerifier = client.randomPKCECodeVerifier();
    const pending: SocialPending = { provider, scopeSlug, nonce, codeVerifier, deviceIdHash: sha256(deviceId) };
    await this.store(() => this.redis.set(socialStateKey(state), JSON.stringify(pending), 'EX', OIDC_STATE_TTL_SECONDS));
    return client.buildAuthorizationUrl(config, {
      redirect_uri: socialRedirectUri(provider),
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).href;
  }

  // Single use, as takeState.
  async takeSocialState(state: string): Promise<SocialPending | null> {
    const raw = await this.store(() => this.redis.getdel(socialStateKey(state)));
    return raw ? (JSON.parse(raw) as SocialPending) : null;
  }

  // Step 2: code -> tokens; the ID token's signature, iss (Microsoft: per tenant), aud, exp, nonce,
  // the state and the PKCE verifier are all checked by openid-client.
  async completeSocial(provider: SocialProvider, app: SocialApp, pending: SocialPending, state: string, callbackQuery: string): Promise<OidcClaims> {
    const config = await this.socialConfiguration(provider, app);
    const currentUrl = new URL(socialRedirectUri(provider));
    currentUrl.search = callbackQuery;
    const tokens = await client.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: pending.codeVerifier,
      expectedState: state,
      expectedNonce: pending.nonce,
      idTokenExpected: true,
    });
    return tokens.claims()!;
  }

  private socialConfiguration(provider: SocialProvider, app: SocialApp): Promise<client.Configuration> {
    const key = `social:${provider}:${app.issuer}:${app.clientId}`;
    const cached = this.configs.get(key);
    if (cached && Date.now() - cached.at < CONFIG_TTL_MS) return cached.config;
    const config = this.discover(app.issuer, app.clientId, app.clientSecret);
    config.catch(() => this.configs.delete(key));
    this.configs.set(key, { version: 0, at: Date.now(), config });
    return config;
  }

  // Only the browser that started a sign-in may finish it (login CSRF).
  static sameDevice(pending: { deviceIdHash: string }, deviceId: string): boolean {
    const a = Buffer.from(pending.deviceIdHash);
    const b = Buffer.from(sha256(deviceId));
    return a.length === b.length && timingSafeEqual(a, b);
  }

  // Step 2: code -> tokens at the IdP; returns the validated ID token claims.
  async complete(provider: IdentityProvider, pending: OidcPending, state: string, callbackQuery: string): Promise<OidcClaims> {
    const config = await this.configuration(provider);
    const currentUrl = new URL(OidcService.redirectUri());
    currentUrl.search = callbackQuery;
    const tokens = await client.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: pending.codeVerifier,
      expectedState: state,
      expectedNonce: pending.nonce,
      idTokenExpected: true,
    });
    return tokens.claims()!;
  }

  // Fail closed: without the state store no sign-in can be tied to the browser that began it.
  private async store<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch {
      throw new ServiceUnavailableException('Sign-in is temporarily unavailable. Please try again shortly.');
    }
  }
}
