import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PublicApplicationsThrottlerGuard } from '../public-applications/public-applications.throttler.guard';
import { STRICT_WALK_IN_THROTTLE } from '../rate-limit-tiers';
import { SurveysService } from './surveys.service';
import { SubmitSurveyDto } from './dto/survey.dto';

// Deliberately NOT behind JwtAuthGuard -- a candidate answers a survey without an account. The
// per-response token IS the authorization; the service resolves it cross-tenant via the RLS
// super-admin bypass. Same throttle layering as the public applications controller.
@Controller('public/surveys')
@UseGuards(PublicApplicationsThrottlerGuard)
@Throttle(STRICT_WALK_IN_THROTTLE)
export class PublicSurveysController {
  constructor(private readonly surveys: SurveysService) {}

  @Get(':token')
  get(@Param('token') token: string) {
    return this.surveys.getPublic(token);
  }

  @Post(':token')
  submit(@Param('token') token: string, @Body() dto: SubmitSurveyDto) {
    return this.surveys.submit(token, dto.answers);
  }
}
