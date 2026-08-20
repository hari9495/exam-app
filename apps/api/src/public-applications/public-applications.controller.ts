import { Body, Controller, Get, Header, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PublicApplicationsService } from './public-applications.service';
import { ApplyDto } from './dto/apply.dto';
import { PublicApplicationsThrottlerGuard } from './public-applications.throttler.guard';
import { STRICT_WALK_IN_THROTTLE } from '../rate-limit-tiers';

// Deliberately NOT behind JwtAuthGuard -- candidates apply and check status without an
// account. The app-wide IP-keyed FailOpenThrottlerGuard (APP_GUARD) still applies in front of
// this, with PublicApplicationsThrottlerGuard adding a token-keyed budget on top, same layering
// as WalkInController.
@Controller('public')
@UseGuards(PublicApplicationsThrottlerGuard)
@Throttle(STRICT_WALK_IN_THROTTLE)
export class PublicApplicationsController {
  constructor(private readonly service: PublicApplicationsService) {}

  // Declared BEFORE jobs/:applyToken so the static path wins over the param route.
  @Get('jobs-feed.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  jobsFeed() {
    return this.service.getJobsFeed();
  }

  @Get('jobs/:applyToken')
  getJob(@Param('applyToken') applyToken: string) {
    return this.service.getPublicJob(applyToken);
  }

  @Post('jobs/:applyToken/apply')
  apply(@Param('applyToken') applyToken: string, @Body() dto: ApplyDto) {
    return this.service.apply(applyToken, dto);
  }

  @Get('applications/:statusToken')
  status(@Param('statusToken') statusToken: string) {
    return this.service.getApplicationStatus(statusToken);
  }
}
