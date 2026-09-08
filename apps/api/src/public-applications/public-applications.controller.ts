import { Body, Controller, Get, Header, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PublicApplicationsService } from './public-applications.service';
import { ApplyDto } from './dto/apply.dto';
import { UpdatePortalProfileDto } from './dto/update-portal-profile.dto';
import { UploadPortalResumeDto } from './dto/upload-portal-resume.dto';
import { UnsubscribeDto } from './dto/unsubscribe.dto';
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

  // Distinct segment from jobs/:applyToken (jobs-feed.xml vs jobs/*), so no route collision.
  @Get('jobs-feed.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  jobsFeed() {
    return this.service.getJobsFeed();
  }

  // Distinct segment from jobs-feed.xml and jobs/:applyToken -- no route collision.
  @Get('job-boards/:feedToken/feed.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  boardFeed(@Param('feedToken') feedToken: string) {
    return this.service.getBoardFeed(feedToken);
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

  @Get('unsubscribe/:token')
  getUnsubscribe(@Param('token') token: string) {
    return this.service.getUnsubscribe(token);
  }

  @Post('unsubscribe/:token')
  setUnsubscribe(@Param('token') token: string, @Body() dto: UnsubscribeDto) {
    return this.service.setUnsubscribe(token, dto.optedOut);
  }

  @Get('portal/:portalToken')
  portal(@Param('portalToken') portalToken: string) {
    return this.service.getPortal(portalToken);
  }

  @Patch('portal/:portalToken/profile')
  updatePortalProfile(@Param('portalToken') portalToken: string, @Body() dto: UpdatePortalProfileDto) {
    return this.service.updatePortalProfile(portalToken, dto);
  }

  @Post('portal/:portalToken/resume')
  uploadPortalResume(@Param('portalToken') portalToken: string, @Body() dto: UploadPortalResumeDto) {
    return this.service.uploadPortalResume(portalToken, dto);
  }
}
