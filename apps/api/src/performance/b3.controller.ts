import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { Request, Response } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { BiasCheckDto, BiasDecisionDto, CoachDismissDto, CoachOptOutDto, DisputeDecisionDto, DisputeExportDto, HandoverDecideDto, HandoverWithHrDto, LegalHoldDto, RaiseDisputeDto } from './b3-dto';
import { PerformanceHandoversService } from './handovers.service';
import { PerformanceDisputesService } from './disputes.service';
import { PerformanceCoachService } from './coach.service';

// PRF-13 … PRF-17 (performance builder 3). Routes with a key need it at the guard; the self-service routes (the new
// manager's hand-overs, my dispute, my coach card, my review's assistant) are open to signed-in staff and the service
// decides per record, as for the rest of Performance (the person, their manager): anyone else gets 404.
const ATTACHMENT = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

const send = (res: Response, out: { file: Buffer; name: string; contentType: string }, disposition: 'inline' | 'attachment') => {
  res.set({
    'Content-Type': out.contentType,
    'Content-Disposition': `${disposition}; filename="${out.name.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; sandbox",
  });
  return new StreamableFile(out.file);
};

@Controller('performance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PerformanceB3Controller {
  constructor(
    private readonly handovers: PerformanceHandoversService,
    private readonly disputes: PerformanceDisputesService,
    private readonly coachSvc: PerformanceCoachService,
  ) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  // ------------------------------------------------------------------------------------------ PRF-13 hand-over list

  @Get('handover-list')
  handoverMine(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.handovers.mine(ctx, this.user(req));
  }

  @Get('handover-list/all')
  @RequirePermissions('perf.cycle.manage')
  handoverAll(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.handovers.all(ctx, this.user(req));
  }

  /** PRF-13 bulk "Reassign to HR" (HR with company-wide perf.cycle.manage, checked again by the service). */
  @Post('handover-list/with-hr')
  @HttpCode(200)
  @RequirePermissions('perf.cycle.manage')
  handoverWithHr(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: HandoverWithHrDto) {
    return this.handovers.withHr(ctx, this.user(req), dto);
  }

  /** PRF-13 "View audit entry". */
  @Get('handover-list/:id/audit')
  @RequirePermissions('perf.cycle.manage')
  handoverAudit(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.handovers.auditOf(ctx, this.user(req), id);
  }

  @Get('handover-list/:id/parent-options')
  handoverOptions(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.handovers.parentOptions(ctx, this.user(req), id);
  }

  @Post('handover-list/:id/decide')
  @HttpCode(200)
  handoverDecide(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: HandoverDecideDto) {
    return this.handovers.decide(ctx, this.user(req), id, dto);
  }

  // ------------------------------------------------------------------------------------------ PRF-15 disputes (employee)

  @Get('reviews/:id/dispute')
  myDispute(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.disputes.myDispute(ctx, this.user(req), id);
  }

  @Post('reviews/:id/dispute')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  raise(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RaiseDisputeDto) {
    return this.disputes.raise(ctx, this.user(req), id, dto);
  }

  @Post('disputes/:id/files')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(ATTACHMENT)
  addFile(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.disputes.addFile(ctx, this.user(req), id, file);
  }

  // ------------------------------------------------------------------------------------------ PRF-15 disputes (perf.dispute.manage)

  @Get('disputes')
  @RequirePermissions('perf.dispute.manage')
  disputeList(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.disputes.list(ctx, this.user(req));
  }

  @Get('disputes/:id')
  @RequirePermissions('perf.dispute.manage')
  dispute(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.disputes.get(ctx, this.user(req), id);
  }

  @Post('disputes/:id/legal-hold')
  @HttpCode(200)
  @RequirePermissions('perf.dispute.manage')
  legalHold(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LegalHoldDto) {
    return this.disputes.legalHold(ctx, this.user(req), id, dto);
  }

  @Post('disputes/:id/decision')
  @HttpCode(200)
  @RequirePermissions('perf.dispute.manage')
  decide(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DisputeDecisionDto) {
    return this.disputes.decide(ctx, this.user(req), id, dto);
  }

  @Post('disputes/:id/export')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermissions('perf.dispute.manage')
  exportEvidence(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DisputeExportDto) {
    return this.disputes.export(ctx, this.user(req), id, dto);
  }

  @Get('disputes/:id/exports/:exportId/file')
  @RequirePermissions('perf.dispute.manage')
  async exportFile(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('exportId', ParseUUIDPipe) exportId: string) {
    return send(res, await this.disputes.exportFile(ctx, this.user(req), id, exportId), 'attachment');
  }

  @Get('disputes/:id/files/:fileId')
  @RequirePermissions('perf.dispute.manage')
  async attachment(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('fileId', ParseUUIDPipe) fileId: string) {
    return send(res, await this.disputes.attachmentFile(ctx, this.user(req), id, fileId), 'inline');
  }

  // ------------------------------------------------------------------------------------------ PRF-16 coach and agenda

  @Get('coach')
  coach(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.coachSvc.coach(ctx, this.user(req));
  }

  @Post('coach/opt-out')
  @HttpCode(200)
  optOut(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: CoachOptOutDto) {
    return this.coachSvc.optOut(ctx, this.user(req), dto.optedOut);
  }

  @Post('coach/dismiss')
  @HttpCode(200)
  dismiss(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: CoachDismissDto) {
    return this.coachSvc.dismiss(ctx, this.user(req), dto.key);
  }

  @Get('one-on-ones/:id/suggested-agenda')
  agenda(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.coachSvc.agenda(ctx, this.user(req), id);
  }

  // ------------------------------------------------------------------------------------------ PRF-17 review assistant

  @Get('reviews/:id/assistant')
  assistant(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.coachSvc.assistant(ctx, this.user(req), id);
  }

  @Post('reviews/:id/assistant/draft')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  draft(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.coachSvc.draft(ctx, this.user(req), id);
  }

  @Post('reviews/:id/assistant/check')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  check(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BiasCheckDto) {
    return this.coachSvc.check(ctx, this.user(req), id, dto);
  }

  @Post('reviews/:id/assistant/flags')
  @HttpCode(200)
  flag(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BiasDecisionDto) {
    return this.coachSvc.decideFlag(ctx, this.user(req), id, dto);
  }
}
