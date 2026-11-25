import { Body, Controller, Get, HttpCode, Param, Post, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { OffersService } from './offers.service';
import { RespondOfferDto } from './dto/respond-offer.dto';
import { PublicApplicationsThrottlerGuard } from '../public-applications/public-applications.throttler.guard';
import { STRICT_WALK_IN_THROTTLE } from '../rate-limit-tiers';

// Deliberately NOT behind JwtAuthGuard -- candidates accept/decline offers without an account.
// Reuses PublicApplicationsThrottlerGuard rather than a new guard class: same shape (token-keyed
// budget on a public, unauthenticated surface), same layering under the app-wide IP-keyed
// FailOpenThrottlerGuard (APP_GUARD), same pattern OffersController would otherwise duplicate.
@Controller('public')
@UseGuards(PublicApplicationsThrottlerGuard)
@Throttle(STRICT_WALK_IN_THROTTLE)
export class PublicOffersController {
  constructor(private readonly offers: OffersService) {}

  @Get('offers/:token')
  getOffer(@Param('token') token: string) {
    return this.offers.getPublicOffer(token);
  }

  /** M10 D4: the issued P05 offer letter (PDF), by the offer's link. */
  @Get('offers/:token/letter')
  async letter(@Param('token') token: string, @Res({ passthrough: true }) res: Response) {
    const f = await this.offers.publicLetter(token);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${f.name.replace(/[^A-Za-z0-9._-]/g, '_')}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    return new StreamableFile(f.file);
  }

  /** HIR-09 e-sign: emails the candidate a one-time code (only when the offer's template switched e-sign on). */
  @Post('offers/:token/esign-code')
  @HttpCode(200)
  esignCode(@Param('token') token: string, @Req() req: Request) {
    return this.offers.sendEsignCode(token, req.ip ?? null);
  }

  @Post('offers/:token/respond')
  respond(@Param('token') token: string, @Body() dto: RespondOfferDto, @Req() req?: Request) {
    // Public: only the new status goes back, never the offer row's internal fields (T9-09 candidate pages).
    return this.offers
      .respondPublic(token, dto.action, { code: dto.code, disclosureAccepted: dto.disclosureAccepted, ip: req?.ip ?? null, device: req?.get?.('user-agent') ?? null })
      .then((o) => ({ status: o.status }));
  }
}
