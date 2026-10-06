import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { ownSession } from '../org-structure/org-structure.controller';
import { EmployeeHistoryService, RequestUser } from '../employee-history/employee-history.service';
import { BulkChangesService } from './bulk-changes.service';
import {
  BatchApproveDto,
  BatchListQueryDto,
  BulkCsvDto,
  DirectoryQueryDto,
  EmployeeCodeDto,
  ExtendProbationDto,
  LinkLoginDto,
  OrgChartQueryDto,
  ReasonDto,
  ReassignDto,
  ReportsQueryDto,
} from './dto';
import { PeopleService } from './people.service';
import { ProfileService } from './profile.service';
import { PersonalDetailsDto, ProfileDecisionDto, ProfileReasonDto, ProfileRequestDto, ProfileRequestListDto, RevealDto } from './profile.dto';

// People core (P01 §4.4–4.5a; M01 §3.1–3.4, §3.9–3.10). Permissions (P02 YX-SEC-01):
//   implicit grants (YX-SEC-04)   directory and org chart for employees of the company (Public fields, P02 Q4);
//                                 the team, reports and probations of one's own reporting subtree (P02 Q2)
//   employee.profile.view         everyone's record, the person behind it, every probation (HR)
//   employee.change.manage        employee codes, logins, probation extensions, bulk changes
//   employee.change.approve       approve or reject a bulk batch (never one's own, YX-SEC-11)
//   employee.personal.view        Personal class of the people in scope (P02 §4.4); the person always sees their own
//   employee.profile.edit         edit someone's Personal details (the person edits their own, §4.5)
//   employee.identity.view        masked identity / bank, full values through an audited reveal (YX-SEC-09)
//   employee.aadhaar.view         Aadhaar in full, each view audited (YX-SEC-08)
//   employee.identity.manage      raise an identity / bank change for someone (the person raises their own)
//   employee.identity.approve     approve or reject those changes (never one's own or about oneself, YX-SEC-11/13)
// Every key reaches only the people in its grants' scopes (P02 §4.3). Nothing here returns pay (founder rule R1).
@Controller('people')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PeopleController {
  constructor(
    private readonly history: EmployeeHistoryService,
    private readonly people: PeopleService,
    private readonly bulk: BulkChangesService,
    private readonly profiles: ProfileService,
  ) {}

  private viewer(req: Request) {
    return this.history.viewer(req.user as RequestUser);
  }

  @Get('directory')
  async directory(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: DirectoryQueryDto) {
    return this.people.directory(ctx, await this.viewer(req), q);
  }

  @Get('org-chart')
  async orgChart(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: OrgChartQueryDto) {
    return this.people.orgChart(ctx, await this.viewer(req), q.asOf);
  }

  @Get('team')
  async team(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.people.team(ctx, await this.viewer(req));
  }

  @Get('employees/:id/reports')
  async reports(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: ReportsQueryDto) {
    return this.people.reports(ctx, await this.viewer(req), id, q.scope === 'all');
  }

  @Get('employees/:id/person')
  async person(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.people.person(ctx, await this.viewer(req), id);
  }

  @Put('employees/:id/code')
  @RequirePermissions('employee.change.manage')
  async setCode(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EmployeeCodeDto) {
    ownSession(req);
    return this.people.setCode(ctx, await this.viewer(req), id, dto.employeeCode, dto.reason);
  }

  /** A login gives its holder the person's own view, pay included: a fresh second factor (P12 YX-IAM-02). */
  @Post('employees/:id/login')
  @RequirePermissions('employee.change.manage')
  @RequireStepUp()
  async linkLogin(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LinkLoginDto) {
    ownSession(req);
    return this.people.linkLogin(ctx, await this.viewer(req), id, dto.userId);
  }

  @Post('employees/:id/login/unlink')
  @RequirePermissions('employee.change.manage')
  @RequireStepUp()
  async unlinkLogin(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    ownSession(req);
    return this.people.unlinkLogin(ctx, await this.viewer(req), id, dto.reason);
  }

  // ---- the record by sensitivity class (P02 §4.4–4.5, step 2d) ----

  /** The signed-in person's own employee record, if they have one in this company. */
  @Get('me')
  async me(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.people.me(ctx, await this.viewer(req));
  }

  /** Who viewed my Confidential and Special data (P02 §7, P08). */
  @Get('me/access-log')
  async accessLog(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.profiles.accessLog(ctx, await this.viewer(req));
  }

  @Get('employees/:id/profile')
  async profile(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.profiles.profile(ctx, await this.viewer(req), id);
  }

  /** A full identifier: a fresh second factor, audited when it is someone else's (YX-SEC-08/09). */
  @Post('employees/:id/identity/reveal')
  @RequireStepUp()
  async reveal(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RevealDto) {
    ownSession(req);
    return this.profiles.reveal(ctx, await this.viewer(req), id, dto.field);
  }

  @Put('employees/:id/personal')
  async updatePersonal(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PersonalDetailsDto) {
    ownSession(req);
    return this.profiles.updatePersonal(ctx, await this.viewer(req), id, dto);
  }

  /** Identity, bank and legal-name changes go to approval; asking needs a fresh second factor (P02 §4.5). */
  @Post('employees/:id/profile-requests')
  @RequireStepUp()
  async requestProfileChange(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProfileRequestDto) {
    ownSession(req);
    return this.profiles.requestChange(ctx, await this.viewer(req), id, dto);
  }

  @Get('profile-requests')
  async profileRequests(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: ProfileRequestListDto) {
    return this.profiles.listRequests(ctx, await this.viewer(req), q.status);
  }

  @Post('profile-requests/:id/approve')
  @RequirePermissions('employee.identity.approve')
  @RequireStepUp()
  async approveProfileChange(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProfileDecisionDto) {
    ownSession(req);
    return this.profiles.approve(ctx, await this.viewer(req), id, dto.note, dto.overrideReason);
  }

  @Post('profile-requests/:id/reject')
  @RequirePermissions('employee.identity.approve')
  async rejectProfileChange(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProfileReasonDto) {
    ownSession(req);
    return this.profiles.reject(ctx, await this.viewer(req), id, dto.reason);
  }

  @Post('profile-requests/:id/cancel')
  async cancelProfileChange(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProfileReasonDto) {
    ownSession(req);
    return this.profiles.cancel(ctx, await this.viewer(req), id, dto.reason);
  }

  // ---- probation (M01 §3.4) ----

  @Get('probations')
  async probations(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.people.probations(ctx, await this.viewer(req));
  }

  @Post('employees/:id/probation/extend')
  @RequirePermissions('employee.change.manage')
  async extendProbation(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ExtendProbationDto) {
    ownSession(req);
    return this.people.extendProbation(ctx, await this.viewer(req), id, dto.months, dto.reason);
  }

  // ---- bulk changes (M01 §3.3) ----

  @Get('change-batches')
  @RequireAnyPermission('employee.profile.view', 'employee.change.manage', 'employee.change.approve')
  async batches(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: BatchListQueryDto) {
    return this.bulk.list(ctx, await this.viewer(req), q.status);
  }

  @Post('change-batches')
  @RequirePermissions('employee.change.manage')
  async fromCsv(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: BulkCsvDto) {
    ownSession(req);
    return this.bulk.fromCsv(ctx, await this.viewer(req), dto);
  }

  @Post('change-batches/reassign')
  @RequirePermissions('employee.change.manage')
  async reassign(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ReassignDto) {
    ownSession(req);
    return this.bulk.reassign(ctx, await this.viewer(req), dto);
  }

  @Get('change-batches/:id')
  @RequireAnyPermission('employee.profile.view', 'employee.change.manage', 'employee.change.approve')
  async batch(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.bulk.get(ctx, await this.viewer(req), id);
  }

  /** Approving rewrites many people's employment facts at once: a fresh second factor (P12 YX-IAM-02). */
  @Post('change-batches/:id/approve')
  @RequirePermissions('employee.change.approve')
  @RequireStepUp()
  async approve(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BatchApproveDto) {
    ownSession(req);
    return this.bulk.approve(ctx, await this.viewer(req), id, dto.confirmRebase === true, dto.note);
  }

  @Post('change-batches/:id/reject')
  @RequirePermissions('employee.change.approve')
  async reject(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    ownSession(req);
    return this.bulk.close(ctx, await this.viewer(req), id, 'rejected', dto.reason);
  }

  @Post('change-batches/:id/cancel')
  @RequirePermissions('employee.change.manage')
  async cancel(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    ownSession(req);
    return this.bulk.close(ctx, await this.viewer(req), id, 'cancelled', dto.reason);
  }
}
