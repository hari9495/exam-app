import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InterviewsService } from './interviews.service';
import { RespondInterviewDto } from './dto/respond-interview.dto';
import { PublicApplicationsThrottlerGuard } from '../public-applications/public-applications.throttler.guard';
import { STRICT_WALK_IN_THROTTLE } from '../rate-limit-tiers';

// Deliberately NOT behind JwtAuthGuard -- candidates confirm/decline/reschedule an interview
// without an account. Reuses PublicApplicationsThrottlerGuard exactly like PublicOffersController:
// getTracker already falls back to req.params.token, so this gets its own token-scoped budget
// under the same app-wide IP-keyed FailOpenThrottlerGuard layering with no guard changes needed.
@Controller('public')
@UseGuards(PublicApplicationsThrottlerGuard)
@Throttle(STRICT_WALK_IN_THROTTLE)
export class PublicInterviewsController {
  constructor(private readonly interviews: InterviewsService) {}

  @Get('interviews/:token')
  getInterview(@Param('token') token: string) {
    return this.interviews.getPublicInterview(token);
  }

  @Post('interviews/:token/respond')
  respond(@Param('token') token: string, @Body() dto: RespondInterviewDto) {
    return this.interviews.respondPublic(token, dto);
  }
}
