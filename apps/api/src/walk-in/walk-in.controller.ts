import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WalkInService } from './walk-in.service';
import { RegisterWalkInDto } from './dto/register-walk-in.dto';
import { STRICT_WALK_IN_THROTTLE } from '../rate-limit-tiers';

@Controller('public/walk-in')
export class WalkInController {
  constructor(private readonly walkInService: WalkInService) {}

  @Get(':orgSlug/exams')
  @Throttle(STRICT_WALK_IN_THROTTLE)
  listExams(@Param('orgSlug') orgSlug: string) {
    return this.walkInService.listExams(orgSlug);
  }

  @Post(':orgSlug/register')
  @Throttle(STRICT_WALK_IN_THROTTLE)
  register(@Param('orgSlug') orgSlug: string, @Body() dto: RegisterWalkInDto) {
    return this.walkInService.register(orgSlug, dto);
  }
}
