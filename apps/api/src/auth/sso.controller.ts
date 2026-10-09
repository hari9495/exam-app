import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';
import { SsoStartDto } from './dto/identity-provider.dto';
import { IdentifyDto } from './dto/login.dto';
import { NO_SSO_MESSAGE, emailDomain } from './identity-providers';
import { CompanyScopeService } from './company-scope';
import { parseOtpIdentifier } from './otp.service';
import type { ProviderWithDomains } from './sso.service';
import { OidcService } from './oidc.service';
import { SessionsService, resolveClientMeta } from './sessions.service';
import { SsoService, oidcEmail, oidcMfaAsserted } from './sso.service';
import { CredentialThrottle } from './credential-throttler.guard';

// The result rides in the URL FRAGMENT: never sent to a server, never in a Referer header, not in
// proxy / access logs (ASVS V3.1.1). The callback page also sends Referrer-Policy: no-referrer.
export const ssoCallbackUrl = (params: string) => `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/sso/callback#${params}`;

// Single sign-on entry points shared by every provider type (YX-IAM-04; Q2 wave 1).
@Controller('auth')
export class SsoController {
  constructor(
    private readonly sso: SsoService,
    private readonly oidc: OidcService,
    private readonly sessions: SessionsService,
    private readonly scope: CompanyScopeService,
  ) {}

  // Step 1 of the YukthiX sign-in (no company code): where this email or number goes next. To an
  // identity provider when the company is known (web address / remembered company) and maps the
  // email's domain, or -- no company known -- when the domain is verified by exactly one company.
  // Otherwise the password / code step, with the known company's "Continue with ..." providers.
  // The answer depends on the company and the domain only, never on whether an account exists.
  @Post('identify')
  @HttpCode(200)
  @CredentialThrottle()
  async identify(@Body() dto: IdentifyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const parsed = parseOtpIdentifier(dto.identifier);
    if (!parsed) throw new BadRequestException('Enter an email address or a mobile number');
    const email = parsed.kind === 'email' ? parsed.value : undefined;
    const slug = await this.scope.slugFor(req);
    if (slug) {
      const org = await this.sso.organizationBySlug(slug);
      const providers = org ? await this.sso.activeProviders(org.id) : [];
      const owner = email ? providers.find((p) => p.domains.some((d) => d.domain === emailDomain(email))) : undefined;
      if (org && owner) return { next: 'sso', url: await this.redirectUrl(org, owner, req, res, email) };
      return { next: 'password', providers: providers.map(({ id, name, type }) => ({ id, name, type })) };
    }
    const routed = email ? await this.sso.routeByVerifiedDomain(email) : null;
    if (routed) return { next: 'sso', url: await this.redirectUrl(routed.org, routed.provider, req, res, email) };
    return { next: 'password', providers: [] };
  }

  // The device cookie (minted here if new) binds the whole sign-in to this browser: OIDC keeps it
  // with the state, SAML with the AuthnRequest ID when the browser opens /login next.
  private async redirectUrl(org: { slug: string }, provider: ProviderWithDomains, req: Request, res: Response, email?: string): Promise<string> {
    const { deviceId } = resolveClientMeta(req, res);
    if (provider.type === 'saml') {
      return `${process.env.API_ORIGIN}/api/v1/auth/saml/${encodeURIComponent(org.slug)}/login?RelayState=${provider.id}`;
    }
    return this.oidc.begin(provider, deviceId, email);
  }

  // "Sign in with ..." buttons for a company's login page. Names and types only.
  @Get('sso/:organizationSlug/providers')
  @Throttle(STRICT_AUTH_THROTTLE)
  async providers(@Param('organizationSlug') slug: string) {
    const org = await this.sso.organizationBySlug(slug);
    if (!org) return [];
    return (await this.sso.activeProviders(org.id)).map(({ id, name, type }) => ({ id, name, type }));
  }

  // Where to send the browser: the provider named, or the one owning the email's domain. For OIDC
  // the state / nonce / PKCE verifier are created here, bound to this browser's device cookie.
  @Post('sso/start')
  @HttpCode(200)
  @CredentialThrottle()
  async start(@Body() dto: SsoStartDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const slug = await this.scope.slugFor(req, dto.organizationSlug);
    const org = slug ? await this.sso.organizationBySlug(slug) : null;
    if (!org) throw new NotFoundException(NO_SSO_MESSAGE);
    const provider = await this.sso.route(org.id, { providerId: dto.providerId, email: dto.email });
    return { url: await this.redirectUrl(org, provider, req, res, dto.email) };
  }

  // The IdP sends the browser back here. Every outcome is a login event; the browser only ever
  // learns "it worked" (a 60-second single-use code) or a generic error.
  @Get('oidc/callback')
  async oidcCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const meta = resolveClientMeta(req, res);
    let organizationId: string | null = null;
    let identifier: string | null = null;
    const fail = async (reason: string, ssoError = 'invalid_response') => {
      await this.sessions.recordLoginEvent({ organizationId, identifier, result: 'failed', method: 'oidc', reason, meta });
      res.redirect(ssoCallbackUrl(`ssoError=${ssoError}`));
    };

    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const pending = state ? await this.oidc.takeState(state) : null;
    if (!pending) return fail('oidc_state_invalid');
    organizationId = pending.organizationId;
    if (!OidcService.sameDevice(pending, meta.deviceId)) return fail('oidc_device_mismatch');
    const provider = await this.sso.activeProvider(pending.organizationId, pending.providerId);
    if (!provider) return fail('identity_provider_disabled');

    let claims;
    try {
      claims = await this.oidc.complete(provider, pending, state, req.originalUrl.split('?')[1] ?? '');
    } catch {
      return fail('oidc_invalid_response');
    }
    const email = oidcEmail(provider, claims);
    if (!email) return fail('no_verified_email', 'not_provisioned');
    identifier = email;
    const resolved = await this.sso.resolveUser(provider, email, typeof claims.name === 'string' ? claims.name : undefined);
    if ('reason' in resolved) return fail(resolved.reason, 'not_provisioned');

    try {
      // The IdP's MFA claim counts only for a provider an admin has trusted for MFA (YX-IAM-01/04).
      const mfaAsserted = provider.mfaTrusted && oidcMfaAsserted(claims);
      const code = await this.sso.mintLoginCode(resolved.user.id, 'oidc', mfaAsserted, { identityProviderId: provider.id, deviceIdHash: pending.deviceIdHash });
      res.redirect(ssoCallbackUrl(`code=${code}`));
    } catch {
      await fail('sso_code_error');
    }
  }
}
