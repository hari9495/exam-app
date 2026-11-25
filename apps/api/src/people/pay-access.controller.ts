import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { ownSession } from '../org-structure/org-structure.controller';
import { RequestUser } from '../employee-history/employee-history.service';
import { buildViewer } from '../access/scope';
import { PayAccessAskDto, PayAccessDecisionDto, PayAccessEndDto } from './dto';
import { PayAccessService } from './pay-access.service';

// Team pay access (founder 28 Oct 2026). A manager asks for their own team (the service checks they manage the people);
// employee.pay_access.approve is HR, over the people in its scope, two different HR people per request (step-up each).
@Controller('people/pay-access')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PayAccessController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly payAccess: PayAccessService,
  ) {}

  private viewer(req: Request) {
    return buildViewer(this.prisma, this.tenantPrisma, req.user as RequestUser, ['employee.pay_access.approve']);
  }

  @Get('mine')
  async mine(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    ownSession(req);
    return this.payAccess.mine(ctx, await this.viewer(req));
  }

  @Post()
  async ask(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PayAccessAskDto) {
    ownSession(req);
    return this.payAccess.ask(ctx, await this.viewer(req), dto);
  }

  @Get()
  @RequirePermissions('employee.pay_access.approve')
  async list(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.payAccess.list(ctx, await this.viewer(req));
  }

  @Post(':id/decision')
  @RequirePermissions('employee.pay_access.approve')
  @RequireStepUp()
  async decide(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PayAccessDecisionDto) {
    ownSession(req);
    return this.payAccess.decide(ctx, await this.viewer(req), id, dto);
  }

  @Post(':id/end')
  @RequirePermissions('employee.pay_access.approve')
  @RequireStepUp()
  async end(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PayAccessEndDto) {
    ownSession(req);
    return this.payAccess.end(ctx, await this.viewer(req), id, dto);
  }
}
