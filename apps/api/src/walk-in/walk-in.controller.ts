import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WalkInService } from './walk-in.service';
import { RegisterWalkInDto } from './dto/register-walk-in.dto';
import { STRICT_WALK_IN_THROTTLE } from '../rate-limit-tiers';
import { WalkInThrottlerGuard } from './walk-in-throttler.guard';

// Deliberately NOT @SkipGlobalThrottle() -- unlike PublicApiThrottlerGuard (keyed off
// req.apiKeyOrg, set by ApiKeyAuthGuard from an authenticated API key), this route's
// WalkInThrottlerGuard keys off req.params.orgSlug, a raw route param with no validation
// at guard time (org existence is only checked later in WalkInService.resolveOrg()). An
// attacker sending a fresh made-up slug on every request would get a brand-new, always-empty
// bucket each time. Leaving the app-wide IP-keyed FailOpenThrottlerGuard (APP_GUARD) in
// front of this route keeps a volumetric cap per IP regardless of what slug is sent, while
// WalkInThrottlerGuard still gives a real walk-in crowd sharing one IP its own org-keyed budget.
@Controller('public/walk-in')
@UseGuards(WalkInThrottlerGuard)
@Throttle(STRICT_WALK_IN_THROTTLE)
export class WalkInController {
  constructor(private readonly walkInService: WalkInService) {}

  @Get(':orgSlug/exams')
  listExams(@Param('orgSlug') orgSlug: string, @Query('group') groupId?: string) {
    return this.walkInService.listExams(orgSlug, groupId);
  }

  @Post(':orgSlug/register')
  register(@Param('orgSlug') orgSlug: string, @Body() dto: RegisterWalkInDto) {
    return this.walkInService.register(orgSlug, dto);
  }
}
