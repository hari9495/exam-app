import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { ownSession } from '../org-structure/org-structure.controller';
import { EmployeeHistoryService, RequestUser } from '../employee-history/employee-history.service';
import { IdentityChecksService } from './identity-checks.service';
import { AttestDto, ReverifyDto, WorkAuthDto } from './person-panels.dto';
import { WorkAuthService } from './work-auth.service';

// The person record's panels beyond its core (P02 §4.4 classes, each key checked again per person by the service):
//   employee.aadhaar.view     the Identity panel (Special class), every look recorded (PPL-34)
//   employee.identity.manage  with it: attest an identity check, ask for a fresh ID
//   employee.identity.view    work authorisations, numbers masked (PPL-45); employee.identity.manage adds one
@Controller('people')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PersonPanelsController {
  constructor(
    private readonly history: EmployeeHistoryService,
    private readonly identity: IdentityChecksService,
    private readonly workAuth: WorkAuthService,
  ) {}

  private viewer(req: Request) {
    return this.history.viewer(req.user as RequestUser);
  }

  @Get('employees/:id/identity-checks')
  @RequirePermissions('employee.aadhaar.view')
  async identityChecks(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    return this.identity.view(ctx, await this.viewer(req), id);
  }

  @Post('employees/:id/identity-checks/attest')
  @RequirePermissions('employee.aadhaar.view', 'employee.identity.manage')
  @RequireStepUp()
  async attestIdentity(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AttestDto) {
    ownSession(req);
    return this.identity.attest(ctx, await this.viewer(req), id, dto.note);
  }

  @Post('employees/:id/identity-checks/reverify')
  @RequirePermissions('employee.aadhaar.view', 'employee.identity.manage')
  async reverifyIdentity(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReverifyDto) {
    ownSession(req);
    return this.identity.reverify(ctx, await this.viewer(req), id, dto.typeKey);
  }

  @Get('employees/:id/work-authorisations')
  @RequirePermissions('employee.identity.view')
  async workAuthorisations(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    return this.workAuth.list(ctx, await this.viewer(req), id);
  }

  @Post('employees/:id/work-authorisations')
  @RequirePermissions('employee.identity.manage')
  @RequireStepUp()
  async addWorkAuthorisation(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WorkAuthDto) {
    ownSession(req);
    return this.workAuth.add(ctx, await this.viewer(req), id, dto);
  }
}
