import { Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import * as passport from 'passport';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '@exam-platform/shared';
import { SsoUser } from './saml.strategy';

const SSO_LOGIN_CODE_EXPIRY_SECONDS = 60;

@Controller('auth/saml')
export class SamlController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':organizationSlug/status')
  async status(@Param('organizationSlug') organizationSlug: string): Promise<{ enabled: boolean }> {
    const org = await this.prisma.organization.findUnique({
      where: { slug: organizationSlug },
      select: { samlEnabled: true },
    });
    return { enabled: org?.samlEnabled ?? false };
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
        this.handleAuthCallback(err, user, info, res),
    )(req, res);
  }

  async handleAuthCallback(
    err: Error | null,
    user: SsoUser | false | undefined,
    info: { message: string } | undefined,
    res: Response,
  ): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

    if (err) {
      res.redirect(`${frontendUrl}/sso/callback?ssoError=invalid_response`);
      return;
    }
    if (!user) {
      // Hardcode the literal, not info?.message -- the redirect must never leak
      // which specific validation step failed, regardless of what a collaborator sends.
      res.redirect(`${frontendUrl}/sso/callback?ssoError=not_provisioned`);
      return;
    }

    try {
      const rawCode = randomBytes(32).toString('hex');
      const codeHash = createHash('sha256').update(rawCode).digest('hex');
      const expiresAt = new Date(Date.now() + SSO_LOGIN_CODE_EXPIRY_SECONDS * 1000);

      await this.prisma.ssoLoginCode.create({ data: { userId: user.id, codeHash, expiresAt } });

      res.redirect(`${frontendUrl}/sso/callback?code=${rawCode}`);
    } catch {
      res.redirect(`${frontendUrl}/sso/callback?ssoError=invalid_response`);
    }
  }
}
