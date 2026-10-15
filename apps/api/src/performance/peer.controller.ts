import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { BlockDto, EntryDto, NominateDto, NomineeQueryDto, PeerConfigDto, ReasonDto } from './review-dto';
import { SealDto } from './dto';
import { PerformancePeerService } from './peer.service';

// Performance batch PM5 (M06-BUILD-DESIGN §19 "360°", "Privacy"). Nominations and answers are open to the implicit
// grants (the employee, their manager, an approved nominee); the service decides per review. Set-up needs
// perf.cycle.manage, reviewer blocks perf.concern.seal, revealing an author perf.feedback.investigate.
@Controller('performance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PerformancePeerController {
  constructor(private readonly svc: PerformancePeerService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Put('cycles/:id/peer-feedback')
  @RequirePermissions('perf.cycle.manage')
  configure(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PeerConfigDto) {
    return this.svc.configure(ctx, this.user(req), id, dto);
  }

  @Delete('cycles/:id/peer-feedback')
  @RequirePermissions('perf.cycle.manage')
  turnOff(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.configure(ctx, this.user(req), id, null);
  }

  @Get('reviews/:id/nominations')
  nominations(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.nominations(ctx, this.user(req), id);
  }

  @Get('reviews/:id/nominee-options')
  options(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: NomineeQueryDto) {
    return this.svc.options(ctx, this.user(req), id, q.q ?? '');
  }

  @Post('reviews/:id/nominations')
  nominate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NominateDto) {
    return this.svc.nominate(ctx, this.user(req), id, dto);
  }

  @Post('nominations/:id/approve')
  @HttpCode(200)
  approve(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.decide(ctx, this.user(req), id, true);
  }

  @Post('nominations/:id/decline')
  @HttpCode(200)
  decline(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.decide(ctx, this.user(req), id, false);
  }

  @Post('nominations/:id/withdraw')
  @HttpCode(200)
  withdraw(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.withdraw(ctx, this.user(req), id);
  }

  @Get('my-feedback-tasks')
  tasks(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.svc.tasks(ctx, this.user(req));
  }

  @Get('reviews/:id/peer-form')
  form(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.form(ctx, this.user(req), id);
  }

  @Put('reviews/:id/entries/peer')
  savePeer(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EntryDto) {
    return this.svc.answer(ctx, this.user(req), id, dto, false);
  }

  @Post('reviews/:id/entries/peer/submit')
  @HttpCode(200)
  submitPeer(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EntryDto) {
    return this.svc.answer(ctx, this.user(req), id, dto, true);
  }

  @Get('reviews/:id/peer-feedback')
  grouped(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.grouped(ctx, this.user(req), id);
  }

  @Get('reviewer-blocks')
  @RequirePermissions('perf.concern.seal')
  blocks(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.svc.blocks(ctx, this.user(req));
  }

  @Post('reviewer-blocks')
  @RequirePermissions('perf.concern.seal')
  block(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: BlockDto) {
    return this.svc.block(ctx, this.user(req), dto);
  }

  @Delete('reviewer-blocks/:id')
  @RequirePermissions('perf.concern.seal')
  endBlock(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.endBlock(ctx, this.user(req), id);
  }

  @Get('reviews/:id/sealable-entries')
  @RequirePermissions('perf.concern.seal')
  sealable(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.sealable(ctx, this.user(req), id);
  }

  @Post('review-entries/:id/seal')
  @HttpCode(200)
  @RequirePermissions('perf.concern.seal')
  sealEntry(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SealDto) {
    return this.svc.sealEntry(ctx, this.user(req), id, dto.reason);
  }

  @Get('reviews/:id/peer-entries')
  @RequirePermissions('perf.feedback.investigate')
  entries(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.entries(ctx, this.user(req), id);
  }

  @Post('review-entries/:id/reveal-author')
  @HttpCode(200)
  @RequirePermissions('perf.feedback.investigate')
  reveal(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.svc.reveal(ctx, this.user(req), id, dto.reason);
  }
}
