import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
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

  /** HIR-09 e-sign: emails the candidate a one-time code (only when the offer's template switched e-sign on). */
  @Post('offers/:token/esign-code')
  @HttpCode(200)
  esignCode(@Param('token') token: string, @Req() req: Request) {
    return this.offers.sendEsignCode(token, req.ip ?? null);
  }

  @Post('offers/:token/respond')
  respond(@Param('token') token: string, @Body() dto: RespondOfferDto, @Req() req?: Request) {
    return this.offers.respondPublic(token, dto.action, { code: dto.code, disclosureAccepted: dto.disclosureAccepted, ip: req?.ip ?? null, device: req?.get?.('user-agent') ?? null });
  }
}
