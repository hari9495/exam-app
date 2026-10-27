import { Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { ownSession } from '../org-structure/org-structure.controller';
import { EmployeeHistoryService, RequestUser } from '../employee-history/employee-history.service';
import { BfsiService } from './bfsi.service';
import { BfsiCoiDto, BfsiHoldingDto, BfsiRelatedDto } from './person-panels.dto';

// BFSI declarations (PPL-43). The designated person keeps their own declaration (the service checks they are
// designated); compliance.declaration.manage is the compliance officer, for the designated persons in scope.
@Controller('people')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BfsiController {
  constructor(
    private readonly history: EmployeeHistoryService,
    private readonly bfsi: BfsiService,
  ) {}

  private viewer(req: Request) {
    return this.history.viewer(req.user as RequestUser);
  }

  @Get('me/bfsi')
  async myBfsi(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    ownSession(req);
    return this.bfsi.my(ctx, await this.viewer(req));
  }

  @Post('me/bfsi/holdings')
  async addHolding(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: BfsiHoldingDto) {
    ownSession(req);
    return this.bfsi.addHolding(ctx, await this.viewer(req), dto);
  }

  @Delete('me/bfsi/holdings/:id')
  async removeHolding(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    return this.bfsi.remove(ctx, await this.viewer(req), 'holdings', id);
  }

  @Post('me/bfsi/related')
  async addRelated(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: BfsiRelatedDto) {
    ownSession(req);
    return this.bfsi.addRelated(ctx, await this.viewer(req), dto);
  }

  @Delete('me/bfsi/related/:id')
  async removeRelated(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    return this.bfsi.remove(ctx, await this.viewer(req), 'related', id);
  }

  @Put('me/bfsi/coi')
  async saveCoi(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: BfsiCoiDto) {
    ownSession(req);
    return this.bfsi.saveCoi(ctx, await this.viewer(req), dto);
  }

  /** Attesting the code of conduct needs a fresh second factor (the OTP). */
  @Post('me/bfsi/submit')
  @RequireStepUp()
  async submitBfsi(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    ownSession(req);
    return this.bfsi.submit(ctx, await this.viewer(req));
  }

  @Get('bfsi/register')
  @RequirePermissions('compliance.declaration.manage')
  async bfsiRegister(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.bfsi.register(ctx, await this.viewer(req));
  }

  @Get('bfsi/register.csv')
  @RequirePermissions('compliance.declaration.manage')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="declarations-register.csv"')
  async bfsiRegisterCsv(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.bfsi.exportRegister(ctx, await this.viewer(req));
  }

  @Get('bfsi/candidates')
  @RequirePermissions('compliance.declaration.manage')
  async bfsiCandidates(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.bfsi.candidates(ctx, await this.viewer(req));
  }

  @Post('bfsi/designations/:employeeId')
  @RequirePermissions('compliance.declaration.manage')
  async designate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    ownSession(req);
    return this.bfsi.designate(ctx, await this.viewer(req), employeeId);
  }

  @Delete('bfsi/designations/:employeeId')
  @RequirePermissions('compliance.declaration.manage')
  async undesignate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    ownSession(req);
    return this.bfsi.undesignate(ctx, await this.viewer(req), employeeId);
  }

  @Get('bfsi/declarations/:employeeId')
  @RequirePermissions('compliance.declaration.manage')
  async reviewBfsi(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    ownSession(req);
    return this.bfsi.review(ctx, await this.viewer(req), employeeId);
  }

  @Post('bfsi/declarations/:employeeId/remind')
  @RequirePermissions('compliance.declaration.manage')
  async remindBfsi(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    ownSession(req);
    return this.bfsi.remind(ctx, await this.viewer(req), employeeId);
  }
}
