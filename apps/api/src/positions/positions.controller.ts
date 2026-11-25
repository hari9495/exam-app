import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { PositionAsOfDto, PositionChangesDto, PositionsQueryDto, ReasonDto } from './dto';
import { PositionsService } from './positions.service';

// Enterprise E1 positions (answers 2340, 2341, 2641-2643, 2680-2689):
//   org.structure.view / org.position.manage   read seats in scope (money only with pay.range.view / ats.headcount.manage)
//   org.position.manage                        ask for seat changes (approved by another holder) and the switch-on plan;
//                                              approving the plan also needs employee.change.manage and .approve
@Controller('org/positions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PositionsController {
  constructor(private readonly positions: PositionsService) {}

  private v(req: Request) {
    return this.positions.viewer(req.user as ScopeUser);
  }

  @Get()
  @RequireAnyPermission('org.structure.view', 'org.position.manage')
  async list(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: PositionsQueryDto) {
    return this.positions.list(ctx, await this.v(req), q);
  }

  @Get('switch-on')
  @RequirePermissions('org.position.manage')
  async switchOn(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.positions.switchOnPreview(ctx, await this.v(req));
  }

  @Post('switch-on')
  @RequirePermissions('org.position.manage')
  async sendSwitchOn(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ReasonDto) {
    return this.positions.switchOnSend(ctx, await this.v(req), dto);
  }

  @Post('switch-on/:batchId/approve')
  @RequirePermissions('org.position.manage')
  async approveSwitchOn(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('batchId', ParseUUIDPipe) batchId: string) {
    return this.positions.switchOnApprove(ctx, await this.v(req), batchId);
  }

  @Post('switch-on/:batchId/decline')
  @RequirePermissions('org.position.manage')
  async declineSwitchOn(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('batchId', ParseUUIDPipe) batchId: string, @Body() dto: ReasonDto) {
    return this.positions.switchOnDecline(ctx, await this.v(req), batchId, dto);
  }

  @Post('changes')
  @RequirePermissions('org.position.manage')
  async request(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PositionChangesDto) {
    return this.positions.request(ctx, await this.v(req), dto);
  }

  @Post('changes/:batchId/withdraw')
  @RequirePermissions('org.position.manage')
  async withdraw(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('batchId', ParseUUIDPipe) batchId: string) {
    return this.positions.withdraw(ctx, await this.v(req), batchId);
  }

  @Get(':id')
  @RequireAnyPermission('org.structure.view', 'org.position.manage')
  async get(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: PositionAsOfDto) {
    return this.positions.get(ctx, await this.v(req), id, q.asOf);
  }
}
