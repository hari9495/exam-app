import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WalkInService } from './walk-in.service';
import { RegisterWalkInDto } from './dto/register-walk-in.dto';
import { STRICT_WALK_IN_THROTTLE } from '../rate-limit-tiers';
import { WalkInThrottlerGuard } from './walk-in-throttler.guard';
import { SkipGlobalThrottle } from '../fail-open-throttler.guard';

@Controller('public/walk-in')
@UseGuards(WalkInThrottlerGuard)
@Throttle(STRICT_WALK_IN_THROTTLE)
@SkipGlobalThrottle()
export class WalkInController {
  constructor(private readonly walkInService: WalkInService) {}

  @Get(':orgSlug/exams')
  listExams(@Param('orgSlug') orgSlug: string) {
    return this.walkInService.listExams(orgSlug);
  }

  @Post(':orgSlug/register')
  register(@Param('orgSlug') orgSlug: string, @Body() dto: RegisterWalkInDto) {
    return this.walkInService.register(orgSlug, dto);
  }
}
