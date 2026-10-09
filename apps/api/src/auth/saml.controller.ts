import { Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
// `import * as passport` silently drops `authenticate`/`use` (they live on
// the singleton's prototype, not as own properties) -- see saml.strategy.ts
// for the full explanation. Import-equals keeps the real object.
import passport = require('passport');
import { SsoUser, SamlStrategy } from './saml.strategy';
import { SsoService } from './sso.service';
import { DEVICE_COOKIE, SessionsService } from './sessions.service';
import { ssoCallbackUrl } from './sso.controller';

@Controller('auth/saml')
export class SamlController {
  constructor(
    private readonly samlStrategy: SamlStrategy,
    private readonly sso: SsoService,
    private readonly sessions: SessionsService,
  ) {}

  // Is any sign-in provider (SAML or OIDC) switched on for this company? Rate-limited per IP
  // (organisation recon); unknown and inactive organisations answer like one without SSO.
  @Get(':organizationSlug/status')
  @Throttle(STRICT_AUTH_THROTTLE)
  async status(@Param('organizationSlug') organizationSlug: string): Promise<{ enabled: boolean }> {
    const org = await this.sso.organizationBySlug(organizationSlug);
    return { enabled: org ? (await this.sso.activeProviders(org.id)).length > 0 : false };
  }

  @Get(':organizationSlug/metadata')
  metadata(@Req() req: Request, @Res() res: Response): void {
    this.samlStrategy.generateMetadata(req, (err, metadataXml) => {
      if (err || !metadataXml) {
        res.status(400).send('Could not generate metadata for this organization');
        return;
      }
      res.set('Content-Type', 'application/xml');
      res.send(metadataXml);
    });
  }

  @Get(':organizationSlug/login')
  @UseGuards(AuthGuard('saml'))
  login(): void {
    // AuthGuard('saml') performs the redirect to the IdP's entryPoint before
    // this handler body would ever run -- nothing to do here.
  }

  @Post(':organizationSlug/callback')
  async callback(@Req() req: Request, @Res() res: Response): Promise<void> {
    passport.authenticate(
      'saml',
      { session: false },
      (err: Error | null, user: SsoUser | false | undefined, info: { message: string } | undefined) =>
        this.handleAuthCallback(err, user, info, res, req),
    )(req, res);
  }

  async handleAuthCallback(
    err: Error | null,
    user: SsoUser | false | undefined,
    info: { message: string } | undefined,
    res: Response,
    req?: Request,
  ): Promise<void> {
    if (err || !user) {
      // YX-IAM-10: the failed attempt is a login event. The IdP's POST is cross-site, so the
      // SameSite=Lax device cookie is usually absent; none is minted here (that would overwrite it).
      if (req) {
        const userAgent = req.get('user-agent');
        await this.sessions.recordLoginEvent({
          organizationId: (await this.sso.organizationBySlug(String(req.params.organizationSlug ?? '')))?.id ?? null,
          result: 'failed',
          method: 'saml',
          reason: err ? 'saml_invalid_response' : `saml_${info?.message ?? 'rejected'}`.slice(0, 64),
          meta: { ip: req.ip ?? null, userAgent: userAgent ? userAgent.slice(0, 512) : null, deviceId: String(req.cookies?.[DEVICE_COOKIE] ?? '') },
        });
      }
      // Hardcode the literal, not info?.message -- the redirect must never leak
      // which specific validation step failed, regardless of what a collaborator sends.
      res.redirect(ssoCallbackUrl(`ssoError=${err ? 'invalid_response' : 'not_provisioned'}`));
      return;
    }

    try {
      const code = await this.sso.mintLoginCode(user.id, 'saml', user.mfaAsserted, { identityProviderId: user.identityProviderId, deviceIdHash: user.deviceIdHash });
      res.redirect(ssoCallbackUrl(`code=${code}`));
    } catch {
      res.redirect(ssoCallbackUrl('ssoError=invalid_response'));
    }
  }
}
