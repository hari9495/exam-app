import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { AbscondingDto, BatchDto, BatchMembersDto, BuddyDto, ClosureDto, ContractDto, DispatchDto, IrDecisionDto, IrPermissionDto, PayeesDto, RehireDto, StopDto, VersionDto, VrsApplyDto, VrsSchemeDto } from './exit-dto';
import { ExitExtrasService } from './exit-extras.service';
import { ExitsService } from './exits.service';
import { OnboardingExtrasService } from './onboarding-extras.service';

// Lifecycle batch 6e (design §16.5). Keys, checked again per joiner, case, employee and legal entity:
//   lifecycle.onboarding.manage    rehire options, the buddy, campus batches (+ letter.issue for a batch's letters)
//   lifecycle.exit.manage          payees of a death in service, absconding timelines, government permissions, closures,
//                                  VRS schemes
//   lifecycle.exit.view / manage   upcoming retirements and contract ends
//   employee.change.manage         a fixed-term contract's end, extension and conversion
//   no key (self)                  VRS schemes open to me, and applying to one
@Controller('lifecycle')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SpecialCasesController {
  constructor(
    private readonly onboarding: OnboardingExtrasService,
    private readonly extras: ExitExtrasService,
    private readonly exits: ExitsService,
  ) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  // ------------------------------------------------------------------------------------------ rehire, buddy, batches

  @Get('joiners/:id/rehire')
  @RequirePermissions('lifecycle.onboarding.manage')
  rehire(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.onboarding.rehire(ctx, this.user(req), id);
  }

  @Put('joiners/:id/rehire')
  @RequirePermissions('lifecycle.onboarding.manage')
  setRehire(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RehireDto) {
    return this.onboarding.setRehire(ctx, this.user(req), id, dto);
  }

  @Put('joiners/:id/buddy')
  @RequirePermissions('lifecycle.onboarding.manage')
  buddy(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BuddyDto) {
    return this.onboarding.setBuddy(ctx, this.user(req), id, dto);
  }

  @Get('batches')
  @RequireAnyPermission('lifecycle.onboarding.view', 'lifecycle.onboarding.manage')
  batches(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.onboarding.batches(ctx, this.user(req));
  }

  @Post('batches')
  @RequirePermissions('lifecycle.onboarding.manage')
  addBatch(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: BatchDto) {
    return this.onboarding.saveBatch(ctx, this.user(req), null, dto);
  }

  @Put('batches/:id')
  @RequirePermissions('lifecycle.onboarding.manage')
  saveBatch(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BatchDto) {
    return this.onboarding.saveBatch(ctx, this.user(req), id, dto);
  }

  @Post('batches/:id/members')
  @HttpCode(200)
  @RequirePermissions('lifecycle.onboarding.manage')
  members(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BatchMembersDto) {
    return this.onboarding.addMembers(ctx, this.user(req), id, dto.preboardingIds);
  }

  @Post('batches/:id/loi')
  @HttpCode(200)
  @RequirePermissions('lifecycle.onboarding.manage', 'letter.issue')
  loi(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.onboarding.sendLoi(ctx, this.user(req), id);
  }

  // ------------------------------------------------------------------------------------------ death, absconding, contracts

  @Get('exits/:id/payees')
  @RequirePermissions('lifecycle.exit.manage')
  payees(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.extras.payees(ctx, this.user(req), id);
  }

  @Put('exits/:id/payees')
  @RequirePermissions('lifecycle.exit.manage')
  setPayees(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PayeesDto) {
    return this.extras.setPayees(ctx, this.user(req), id, dto.payees);
  }

  @Get('absconding')
  @RequirePermissions('lifecycle.exit.manage')
  absconding(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.extras.abscondingList(ctx, this.user(req));
  }

  @Post('absconding')
  @RequirePermissions('lifecycle.exit.manage')
  startAbsconding(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: AbscondingDto) {
    return this.extras.startAbsconding(ctx, this.user(req), dto);
  }

  @Post('absconding/:id/stop')
  @HttpCode(200)
  @RequirePermissions('lifecycle.exit.manage')
  stop(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StopDto) {
    return this.extras.stopAbsconding(ctx, this.user(req), id, dto);
  }

  @Post('absconding/:id/resume')
  @HttpCode(200)
  @RequirePermissions('lifecycle.exit.manage')
  resume(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    return this.extras.resumeAbsconding(ctx, this.user(req), id, dto);
  }

  @Put('absconding/:id/steps/:key/dispatch')
  @RequirePermissions('lifecycle.exit.manage')
  dispatch(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('key') key: string, @Body() dto: DispatchDto) {
    return this.extras.dispatch(ctx, this.user(req), id, key.slice(0, 20), dto);
  }

  @Get('upcoming-exits')
  @RequireAnyPermission('lifecycle.exit.view', 'lifecycle.exit.manage')
  upcoming(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.extras.upcoming(ctx, this.user(req));
  }

  @Put('contracts/:employeeId')
  @RequirePermissions('employee.change.manage')
  contract(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Body() dto: ContractDto) {
    return this.extras.contract(ctx, this.user(req), employeeId, dto);
  }

  // ------------------------------------------------------------------------------------------ retrenchment, closure, VRS

  @Get('ir-permissions')
  @RequirePermissions('lifecycle.exit.manage')
  permissions(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.extras.permissions(ctx, this.user(req));
  }

  @Post('ir-permissions')
  @RequirePermissions('lifecycle.exit.manage')
  addPermission(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: IrPermissionDto) {
    return this.extras.addPermission(ctx, this.user(req), dto);
  }

  @Post('ir-permissions/:id/decide')
  @HttpCode(200)
  @RequirePermissions('lifecycle.exit.manage')
  decide(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: IrDecisionDto) {
    return this.extras.decidePermission(ctx, this.user(req), id, dto);
  }

  @Post('ir-permissions/:id/closure')
  @HttpCode(200)
  @RequirePermissions('lifecycle.exit.manage')
  closure(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ClosureDto) {
    return this.extras.closure(ctx, this.user(req), id, dto);
  }

  @Post('vrs-schemes')
  @RequirePermissions('lifecycle.exit.manage')
  addScheme(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: VrsSchemeDto) {
    return this.extras.addScheme(ctx, this.user(req), dto);
  }

  @Get('me/vrs')
  myVrs(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.exits.myVrs(ctx, this.user(req));
  }

  @Post('me/vrs')
  applyVrs(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: VrsApplyDto) {
    return this.exits.applyVrs(ctx, this.user(req), dto);
  }
}
