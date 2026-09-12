import { Body, Controller, Get, Header, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PublicApplicationsService } from './public-applications.service';
import { ApplyDto } from './dto/apply.dto';
import { ParseResumeDto } from './dto/parse-resume.dto';
import { UpdatePortalProfileDto } from './dto/update-portal-profile.dto';
import { UploadPortalResumeDto } from './dto/upload-portal-resume.dto';
import { QuickApplyDto } from './dto/quick-apply.dto';
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

  // Distinct segment from jobs/:applyToken -- no route collision.
  @Get('careers/:orgSlug')
  getCareers(@Param('orgSlug') orgSlug: string) {
    return this.service.getCareers(orgSlug);
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

  // Best-effort résumé → contact prefill for the apply form. Under the controller-level strict
  // walk-in throttle (this triggers an AI call, so it must stay rate-limited); the service caps
  // spend against the org's AI quota and returns {} whenever no prefill is available.
  @Post('jobs/:applyToken/parse-resume')
  parseResume(@Param('applyToken') applyToken: string, @Body() dto: ParseResumeDto) {
    return this.service.parseResume(applyToken, dto);
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

  // Returning-candidate one-click re-apply: the org's other open roles, and applying to one reusing
  // the candidate's saved details + résumé. Both scoped by the candidate's own portal token.
  @Get('portal/:portalToken/open-jobs')
  portalOpenJobs(@Param('portalToken') portalToken: string) {
    return this.service.getPortalOpenJobs(portalToken);
  }

  @Post('portal/:portalToken/apply/:applyToken')
  quickApply(
    @Param('portalToken') portalToken: string,
    @Param('applyToken') applyToken: string,
    @Body() dto: QuickApplyDto,
  ) {
    return this.service.quickApply(portalToken, applyToken, dto);
  }

  // External Easy Apply ingestion: a job board POSTs an application here with the org's shared
  // secret in the X-EasyApply-Secret header. Distinct 'easy-apply' segment -- no route collision
  // with jobs/portal. Inert (generic 404) until the org configures the provider's secret.
  @Post('easy-apply/:orgSlug/:provider')
  easyApply(
    @Param('orgSlug') orgSlug: string,
    @Param('provider') provider: string,
    @Headers('x-easyapply-secret') secret: string | undefined,
    @Body() payload: unknown,
  ) {
    return this.service.easyApplyIngest(orgSlug, provider, secret, payload);
  }
}
