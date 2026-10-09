import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { DEFAULT_SECURITY_POLICY, TenantPrismaService, loadTenantSecurityPolicy } from '@exam-platform/shared';
import { PUBLIC_API_THROTTLE } from '../rate-limit-tiers';
import { AuthService } from './auth.service';
import { signInResponse } from './auth.controller';
import { CompanyScopeService } from './company-scope';
import { SsoExchangeDto } from './dto/sso-exchange.dto';
import { OidcService } from './oidc.service';
import { OtpService } from './otp.service';
import { SessionsService, resolveClientMeta } from './sessions.service';
import { isSocialProvider, mockIdpUrl, socialApp, socialIdentity } from './social-sign-in';
import { SsoService } from './sso.service';
import { CredentialThrottle } from './credential-throttler.guard';

// The browser learns the result from the URL FRAGMENT only (never sent to a server, never in a
// Referer or a log; ASVS V3.1.1): a single-use code, or that it did not work.
export const socialCallbackUrl = (params: string) => `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/yx/sign-in/callback#${params}`;

// The YukthiX sign-in screen's other ways in (founder request 7 Oct 2026): which to show, and
// "Continue with Google / Microsoft" through YukthiX's own OpenID Connect apps (P12 Q2).
@Controller('auth')
export class SocialController {
  constructor(
    private readonly auth: AuthService,
    private readonly oidc: OidcService,
    private readonly otp: OtpService,
    private readonly sso: SsoService,
    private readonly sessions: SessionsService,
    private readonly scope: CompanyScopeService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {
    mockIdpUrl(); // throws (the API does not start) when the local mock is configured in production
  }

  // With the company known (web address / remembered company): only what its policy allows. An
  // unknown slug answers like a company with the default policy (everything off), so nothing tells
  // whether it exists. With no company: what YukthiX has set up -- the same for every visitor.
  @Get('sign-in-options')
  // Read-only and enumeration-safe (unknown companies answer like everything off), so the normal
  // public tier: an office behind one IP opening the sign-in page must not lose its buttons.
  @Throttle(PUBLIC_API_THROTTLE)
  async options(@Req() req: Request) {
    const google = socialApp('google') !== null;
    const microsoft = socialApp('microsoft') !== null;
    const slug = await this.scope.slugFor(req);
    if (!slug) {
      const [sms, whatsapp] = await Promise.all([this.otp.channelAvailable('sms'), this.otp.channelAvailable('whatsapp')]);
      return { google, microsoft, sms, whatsapp, emailCode: true, passkey: true };
    }
    const org = await this.sso.organizationBySlug(slug.toLowerCase());
    const policy = org ? await loadTenantSecurityPolicy(this.tenantPrisma, org.id) : DEFAULT_SECURITY_POLICY;
    const codeBy = async (channel: 'email' | 'sms' | 'whatsapp') =>
      !policy.ssoOnly && policy.otpSignInChannels.includes(channel) && (channel === 'email' || (await this.otp.channelAvailable(channel, org!.id)));
    return {
      google: google && !policy.ssoOnly && policy.googleSignIn,
      microsoft: microsoft && !policy.ssoOnly && policy.microsoftSignIn,
      sms: await codeBy('sms'),
      whatsapp: await codeBy('whatsapp'),
      emailCode: await codeBy('email'),
      // "Sign in with a passkey": where the company allows passkeys, never under SSO-only.
      passkey: !policy.ssoOnly && policy.allowedFactors.includes('passkey'),
    };
  }

  // Step 1: state, nonce and the PKCE verifier are kept server-side, bound to this browser's device
  // cookie (minted here if new); the browser goes to the provider.
  @Post('social/:provider/start')
  @HttpCode(200)
  @CredentialThrottle()
  async start(@Param('provider') provider: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const app = isSocialProvider(provider) ? socialApp(provider) : null;
    if (!isSocialProvider(provider) || !app) throw new NotFoundException('This way of signing in is not available');
    const { deviceId } = resolveClientMeta(req, res);
    const slug = await this.scope.slugFor(req);
    return { url: await this.oidc.beginSocial(provider, app, deviceId, slug?.toLowerCase() ?? null) };
  }

  // Step 2: the provider sends the browser back here (one path per provider: a response for one
  // can't be replayed on the other's). State is single-use and must come back to the browser that
  // started it; openid-client checks the code with the PKCE verifier and the ID token's signature,
  // issuer, audience, expiry and nonce. Every refusal is a login event; the browser only learns
  // "it worked" (a 60-second single-use code) or that it did not.
  @Get('social/:provider/callback')
  async callback(@Param('provider') provider: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    const meta = resolveClientMeta(req, res);
    const app = isSocialProvider(provider) ? socialApp(provider) : null;
    if (!isSocialProvider(provider) || !app) {
      res.redirect(socialCallbackUrl('error=signin_failed'));
      return;
    }
    const fail = async (reason: string) => {
      await this.sessions.recordLoginEvent({ organizationId: null, result: 'failed', method: provider, reason, meta });
      res.redirect(socialCallbackUrl('error=signin_failed'));
    };
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const pending = state ? await this.oidc.takeSocialState(state) : null;
    if (!pending) return fail('oidc_state_invalid');
    if (pending.provider !== provider) return fail('social_provider_mismatch');
    if (!OidcService.sameDevice(pending, meta.deviceId)) return fail('oidc_device_mismatch');

    let identity;
    try {
      identity = socialIdentity(provider, await this.oidc.completeSocial(provider, app, pending, state, req.originalUrl.split('?')[1] ?? ''));
    } catch {
      return fail('oidc_invalid_response');
    }
    if (!identity) return fail('no_stable_subject');
    const code = await this.auth.mintSocialCode({ ...identity, provider, scopeSlug: pending.scopeSlug, deviceIdHash: pending.deviceIdHash });
    res.redirect(socialCallbackUrl(`code=${code}`));
  }

  // Step 3: the browser that started the sign-in trades the code for the outcome: signed in, the
  // second factor owed, or the company picker.
  @Post('social/exchange')
  @HttpCode(200)
  @CredentialThrottle()
  async exchange(@Body() dto: SsoExchangeDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return signInResponse(await this.auth.socialSignIn(dto.code, resolveClientMeta(req, res)), res);
  }
}
