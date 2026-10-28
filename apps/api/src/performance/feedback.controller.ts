import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PUBLIC_API_THROTTLE } from '../rate-limit-tiers';
import type { ScopeUser } from '../access/scope';
import { ActionDto, AgendaDto, DoneDto, FeedbackDto, FeedbackListDto, FeedbackRequestDto, OneOnOneDto, OneOnOneUpdateDto, PrivateNoteDto, SealDto } from './dto';
import { PerformanceFeedbackService } from './feedback.service';

// Performance batch PM3 (M06-BUILD-DESIGN §19 "Feedback", "1:1s"). Feedback and 1:1s are open to every employee; the
// service decides who sees what (the two people of a 1:1; the recipient, giver and manager chain of feedback).
// Sealing a concern needs perf.concern.seal.
@Controller('performance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PerformanceFeedbackController {
  constructor(private readonly svc: PerformanceFeedbackService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get('feedback')
  list(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: FeedbackListDto) {
    return this.svc.list(ctx, this.user(req), q.view);
  }

  /** HR who handle concerns: one person's feedback, given and received, sealed text included (MFA via the key). */
  @Get('feedback/employee/:employeeId')
  @RequirePermissions('perf.concern.seal')
  ofEmployee(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.svc.list(ctx, this.user(req), 'employee', employeeId);
  }

  /** PPL-03: received and given counts this quarter for the record's Performance tab; the service checks who may ask. */
  @Get('feedback/employee/:employeeId/counts')
  counts(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.svc.counts(ctx, this.user(req), employeeId);
  }

  @Post('feedback')
  @Throttle(PUBLIC_API_THROTTLE)
  give(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: FeedbackDto) {
    return this.svc.give(ctx, this.user(req), dto);
  }

  @Post('feedback/:id/withdraw')
  @HttpCode(200)
  withdraw(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.withdraw(ctx, this.user(req), id);
  }

  @Post('feedback/:id/seal')
  @HttpCode(200)
  @RequirePermissions('perf.concern.seal')
  seal(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SealDto) {
    return this.svc.seal(ctx, this.user(req), id, dto.reason);
  }

  @Get('feedback-requests')
  requests(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.svc.requests(ctx, this.user(req));
  }

  @Post('feedback-requests')
  @Throttle(PUBLIC_API_THROTTLE)
  request(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: FeedbackRequestDto) {
    return this.svc.request(ctx, this.user(req), dto);
  }

  @Post('feedback-requests/:id/decline')
  @HttpCode(200)
  decline(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.decline(ctx, this.user(req), id);
  }

  @Get('one-on-ones')
  meetings(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.svc.meetings(ctx, this.user(req));
  }

  @Post('one-on-ones')
  createMeeting(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: OneOnOneDto) {
    return this.svc.createMeeting(ctx, this.user(req), dto);
  }

  @Get('one-on-ones/:id')
  meeting(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.meeting(ctx, this.user(req), id);
  }

  @Put('one-on-ones/:id')
  updateMeeting(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OneOnOneUpdateDto) {
    return this.svc.updateMeeting(ctx, this.user(req), id, dto);
  }

  @Post('one-on-ones/:id/agenda')
  addAgenda(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AgendaDto) {
    return this.svc.addAgenda(ctx, this.user(req), id, dto);
  }

  @Put('one-on-ones/:id/agenda/:itemId')
  agendaDone(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body() dto: DoneDto) {
    return this.svc.agendaDone(ctx, this.user(req), id, itemId, dto.done);
  }

  @Put('one-on-ones/:id/private-note')
  privateNote(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PrivateNoteDto) {
    return this.svc.privateNote(ctx, this.user(req), id, dto.text);
  }

  @Post('one-on-ones/:id/actions')
  addAction(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ActionDto) {
    return this.svc.addAction(ctx, this.user(req), id, dto);
  }

  @Put('one-on-ones/:id/actions/:actionId')
  actionDone(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('actionId', ParseUUIDPipe) actionId: string, @Body() dto: DoneDto) {
    return this.svc.actionDone(ctx, this.user(req), id, actionId, dto.done);
  }
}
