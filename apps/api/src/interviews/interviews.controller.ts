import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { assertOwnSession } from '../service-desk/desk-access';
import { InterviewsService } from './interviews.service';
import { CreateInterviewDto } from './dto/create-interview.dto';

// HIR-05 / HIR-06: scheduling, cancelling and resending an interview are the recruiter's own acts, never done while
// acting for someone else.
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InterviewsController {
  constructor(private readonly interviews: InterviewsService) {}

  @Post('pipeline/entries/:id/interviews')
  @RequirePermissions('pipeline:manage')
  createInterview(
    @Req() req: Request,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateInterviewDto,
  ) {
    assertOwnSession(req);
    return this.interviews.createInterview(tenant, userId, id, dto);
  }

  @Get('pipeline/entries/:id/interviews')
  @RequirePermissions('pipeline:manage')
  listForEntry(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.interviews.listForEntry(tenant, id);
  }

  @Get('candidates/:id/interviews')
  @RequirePermissions('pipeline:manage')
  listForCandidate(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.interviews.listForCandidate(tenant, id);
  }

  @Get('interviews/mine')
  @RequirePermissions('interview:view_assigned')
  listMine(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.interviews.listMine(tenant, userId);
  }

  @Post('interviews/:id/cancel')
  @RequirePermissions('pipeline:manage')
  cancel(@Req() req: Request, @CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.interviews.cancel(tenant, userId, id);
  }

  @Post('interviews/:id/send')
  @RequirePermissions('pipeline:manage')
  sendInvite(@Req() req: Request, @CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.interviews.sendInvite(tenant, userId, id);
  }
}
