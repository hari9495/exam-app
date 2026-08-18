import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
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

  @Post('offers/:token/respond')
  respond(@Param('token') token: string, @Body() dto: RespondOfferDto) {
    return this.offers.respondPublic(token, dto.action);
  }
}
