import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import {
  AsOnDto,
  CompensationChangeDto,
  CompensationInputDto,
  ComponentDto,
  FormulaCheckDto,
  GoLiveDto,
  ImportDto,
  LayoutDto,
  LegalOptionDto,
  LetterDto,
  MemberDto,
  PayGroupDto,
  RegistrationsDto,
  StatutoryProfileDto,
  TemplateDto,
  TemplateVersionDto,
  YearDto5b,
} from './dto-5b';
import { PayImportsService } from './imports.service';
import { PaySetupService } from './setup.service';
import { PayStructuresService } from './structures.service';

// Payroll batch 5b (M03-BUILD-DESIGN §14.2). Every route declares its key (YX-SEC-01); the services check the key's
// legal-entity scope again and the database pay guard is the second layer. ⚡ = a fresh second sign-in step (P12).
//   payroll.setup.manage          rules browser, set-up state, pay groups and members, payslip layout, coverage
//   payroll.statutory.setup ⚡    registrations, deductor details, legal options (reads need the key, writes ⚡)
//   payroll.component.manage      the component library (and the starter install, with template.manage)
//   payroll.template.manage       templates, versions with their sample run, formula checks
//   employee.salary.manage        compensation preview and change, statutory profile
//   employee.salary.view / self   the compensation in force on a date
//   payroll.import.run            opening balances, as-paid lines, Form 12B, the go-live check
//   payroll.document.issue ⚡     the revision letter of an approved change
@Controller('payroll')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class Payroll5bController {
  constructor(
    private readonly setup: PaySetupService,
    private readonly structures: PayStructuresService,
    private readonly imports: PayImportsService,
  ) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  // ------------------------------------------------------------------------------------------ statutory set-up

  @Get('setup/entities')
  @RequireAnyPermission('payroll.setup.manage', 'payroll.statutory.setup', 'payroll.template.manage', 'payroll.import.run')
  entities(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.setup.entities(ctx, this.user(req));
  }

  @Get('statutory/rules')
  @RequirePermissions('payroll.setup.manage')
  rules(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('entityId', new ParseUUIDPipe({ optional: true })) entityId?: string) {
    return this.setup.rulesFor(ctx, this.user(req), entityId);
  }

  @Get('entities/:id/statutory-registrations')
  @RequirePermissions('payroll.statutory.setup')
  registrations(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.setup.registrations(ctx, this.user(req), id);
  }

  @Put('entities/:id/statutory-registrations')
  @RequirePermissions('payroll.statutory.setup')
  @RequireStepUp()
  saveRegistrations(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RegistrationsDto) {
    return this.setup.saveRegistrations(ctx, this.user(req), id, dto);
  }

  @Get('entities/:id/legal-options')
  @RequirePermissions('payroll.statutory.setup')
  legalOptions(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.setup.legalOptions(ctx, this.user(req), id);
  }

  @Put('entities/:id/legal-options')
  @RequirePermissions('payroll.statutory.setup')
  @RequireStepUp()
  setLegalOption(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LegalOptionDto) {
    return this.setup.setLegalOption(ctx, this.user(req), id, dto);
  }

  @Get('entities/:id/setup')
  @RequirePermissions('payroll.setup.manage')
  wizard(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.setup.wizard(ctx, this.user(req), id);
  }

  @Get('coverage')
  @RequirePermissions('payroll.setup.manage')
  coverage(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.setup.coverage(ctx, this.user(req));
  }

  // ------------------------------------------------------------------------------------------ pay groups

  @Get('pay-groups')
  @RequirePermissions('payroll.setup.manage')
  payGroups(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.setup.payGroups(ctx, this.user(req));
  }

  @Post('pay-groups')
  @RequirePermissions('payroll.setup.manage')
  createPayGroup(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PayGroupDto) {
    return this.setup.createPayGroup(ctx, this.user(req), dto);
  }

  @Patch('pay-groups/:id')
  @RequirePermissions('payroll.setup.manage')
  updatePayGroup(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PayGroupDto) {
    return this.setup.updatePayGroup(ctx, this.user(req), id, dto);
  }

  @Get('pay-groups/:id/members')
  @RequirePermissions('payroll.setup.manage')
  members(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: AsOnDto) {
    return this.setup.members(ctx, this.user(req), id, q.asOn);
  }

  @Post('pay-groups/:id/members')
  @RequirePermissions('payroll.setup.manage')
  addMembers(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MemberDto) {
    return this.setup.addMembers(ctx, this.user(req), id, dto);
  }

  @Get('pay-groups/:id/calendar')
  @RequirePermissions('payroll.setup.manage')
  calendar(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: YearDto5b) {
    return this.setup.calendar(ctx, this.user(req), id, q.year);
  }

  // ------------------------------------------------------------------------------------------ payslip layout

  @Get('entities/:id/payslip-layout')
  @RequirePermissions('payroll.setup.manage')
  layouts(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.setup.layouts(ctx, this.user(req), id);
  }

  @Put('entities/:id/payslip-layout')
  @RequirePermissions('payroll.setup.manage')
  saveLayout(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LayoutDto) {
    return this.setup.saveLayout(ctx, this.user(req), id, dto);
  }

  @Post('entities/:id/payslip-layout/preview')
  @HttpCode(200)
  @RequirePermissions('payroll.setup.manage')
  async previewLayout(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const out = await this.setup.previewLayout(ctx, this.user(req), id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${out.name}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(out.file);
  }

  @Post('entities/:id/payslip-layout/activate')
  @HttpCode(200)
  @RequirePermissions('payroll.setup.manage')
  activateLayout(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.setup.activateLayout(ctx, this.user(req), id);
  }

  // ------------------------------------------------------------------------------------------ components, formulas, templates

  @Get('components')
  @RequireAnyPermission('payroll.component.manage', 'payroll.template.manage')
  components(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.structures.components(ctx, this.user(req));
  }

  @Post('components')
  @RequirePermissions('payroll.component.manage')
  createComponent(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ComponentDto) {
    return this.structures.createComponent(ctx, this.user(req), dto);
  }

  @Patch('components/:id')
  @RequirePermissions('payroll.component.manage')
  updateComponent(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ComponentDto) {
    return this.structures.updateComponent(ctx, this.user(req), id, dto);
  }

  @Post('components/starter')
  @RequirePermissions('payroll.component.manage', 'payroll.template.manage')
  installStarter(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.structures.installStarter(ctx, this.user(req));
  }

  @Post('formulas/check')
  @HttpCode(200)
  @RequirePermissions('payroll.template.manage')
  checkFormula(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: FormulaCheckDto) {
    return this.structures.checkFormula(ctx, this.user(req), dto);
  }

  @Get('templates')
  @RequirePermissions('payroll.template.manage')
  templates(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.structures.templates(ctx, this.user(req));
  }

  @Post('templates')
  @RequirePermissions('payroll.template.manage')
  createTemplate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: TemplateDto) {
    return this.structures.createTemplate(ctx, this.user(req), dto);
  }

  @Post('templates/validate')
  @HttpCode(200)
  @RequirePermissions('payroll.template.manage')
  validate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: TemplateVersionDto) {
    return this.structures.validate(ctx, this.user(req), dto);
  }

  @Post('templates/:id/versions')
  @RequirePermissions('payroll.template.manage')
  addVersion(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TemplateVersionDto) {
    return this.structures.addVersion(ctx, this.user(req), id, dto);
  }

  // ------------------------------------------------------------------------------------------ compensation and statutory profile

  @Post('compensations/preview')
  @HttpCode(200)
  @RequirePermissions('employee.salary.manage')
  preview(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: CompensationInputDto) {
    return this.structures.preview(ctx, this.user(req), dto);
  }

  @Post('employees/:id/compensation-changes')
  @RequirePermissions('employee.salary.manage')
  change(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CompensationChangeDto) {
    return this.structures.change(ctx, this.user(req), { ...dto, employeeId: id });
  }

  @Post('compensation-changes/:changeId/letter')
  @RequirePermissions('payroll.document.issue')
  @RequireStepUp()
  letter(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('changeId', ParseUUIDPipe) changeId: string, @Body() dto: LetterDto) {
    return this.structures.letter(ctx, this.user(req), changeId, dto);
  }

  /** Self (implicit) or employee.salary.view over the person: checked in the service. */
  @Get('employees/:id/compensation')
  compensation(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: AsOnDto) {
    return this.structures.compensation(ctx, this.user(req), id, q.asOn);
  }

  @Get('employees/:id/statutory-profile')
  @RequireAnyPermission('employee.salary.view', 'employee.salary.manage')
  statutoryProfile(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.structures.statutoryProfile(ctx, this.user(req), id);
  }

  @Put('employees/:id/statutory-profile')
  @RequirePermissions('employee.salary.manage')
  saveStatutoryProfile(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StatutoryProfileDto) {
    return this.structures.saveStatutoryProfile(ctx, this.user(req), id, dto);
  }

  // ------------------------------------------------------------------------------------------ imports

  @Post('imports')
  @RequirePermissions('payroll.import.run')
  stage(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ImportDto) {
    return this.imports.stage(ctx, this.user(req), dto);
  }

  @Post('imports/go-live-check')
  @HttpCode(200)
  @RequirePermissions('payroll.import.run')
  goLive(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: GoLiveDto) {
    return this.imports.goLiveCheck(ctx, this.user(req), dto);
  }

  @Post('imports/:id/commit')
  @HttpCode(200)
  @RequirePermissions('payroll.import.run')
  commit(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.imports.commit(ctx, this.user(req), id);
  }
}
