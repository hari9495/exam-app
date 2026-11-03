import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { Throttle } from '@nestjs/throttler';
import { CompetencyDto, CompetencyImportDto, MergeDto, ScaleDto, SkillDto, TemplateDto, VersionDto } from './dto';
import { PerformanceSetupService } from './setup.service';

// Performance batch PM1 (M06-BUILD-DESIGN §19 "Set-up"): Settings › Performance. Every route needs
// perf.setup.manage (company-wide). Reading scales and templates for reviews comes with the cycles (PM4).
@Controller('performance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PerformanceSetupController {
  constructor(private readonly setup: PerformanceSetupService) {}

  @Post('setup/from-starter')
  @RequirePermissions('perf.setup.manage')
  fromStarter(@CurrentTenant() ctx: TenantContext) {
    return this.setup.fromStarter(ctx);
  }

  @Get('scales')
  @RequirePermissions('perf.setup.manage')
  scales(@CurrentTenant() ctx: TenantContext) {
    return this.setup.scales(ctx);
  }

  @Post('scales')
  @RequirePermissions('perf.setup.manage')
  addScale(@CurrentTenant() ctx: TenantContext, @Body() dto: ScaleDto) {
    return this.setup.saveScale(ctx, null, dto);
  }

  @Put('scales/:id')
  @RequirePermissions('perf.setup.manage')
  updateScale(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ScaleDto) {
    return this.setup.saveScale(ctx, id, dto);
  }

  @Post('scales/:id/retire')
  @RequirePermissions('perf.setup.manage')
  @HttpCode(200)
  retireScale(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.setup.retireScale(ctx, id);
  }

  @Get('templates')
  @RequirePermissions('perf.setup.manage')
  templates(@CurrentTenant() ctx: TenantContext) {
    return this.setup.templates(ctx);
  }

  @Get('templates/:id')
  @RequirePermissions('perf.setup.manage')
  template(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.setup.template(ctx, id);
  }

  @Post('templates')
  @RequirePermissions('perf.setup.manage')
  addTemplate(@CurrentTenant() ctx: TenantContext, @Body() dto: TemplateDto) {
    return this.setup.createTemplate(ctx, dto);
  }

  @Put('templates/:id')
  @RequirePermissions('perf.setup.manage')
  updateTemplate(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TemplateDto) {
    return this.setup.updateTemplate(ctx, id, dto);
  }

  @Post('templates/:id/new-version')
  @RequirePermissions('perf.setup.manage')
  newVersion(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.setup.newVersion(ctx, id);
  }

  @Post('templates/:id/activate')
  @RequirePermissions('perf.setup.manage')
  @HttpCode(200)
  activate(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    return this.setup.activateTemplate(ctx, id, dto.version);
  }

  @Post('templates/:id/retire')
  @RequirePermissions('perf.setup.manage')
  @HttpCode(200)
  retireTemplate(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.setup.retireTemplate(ctx, id);
  }

  @Get('competencies')
  @RequirePermissions('perf.setup.manage')
  competencies(@CurrentTenant() ctx: TenantContext) {
    return this.setup.competencies(ctx);
  }

  /** PRF-14 Import: all rows or none; the rows with problems come back in the refusal. */
  @Post('competencies/import')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermissions('perf.setup.manage')
  importCompetencies(@CurrentTenant() ctx: TenantContext, @Body() dto: CompetencyImportDto) {
    return this.setup.importCompetencies(ctx, dto.csv);
  }

  /** PRF-14 skills test: the question-bank tags to choose from (names and counts only). */
  @Get('competencies/question-tags')
  @RequirePermissions('perf.setup.manage')
  questionTags(@CurrentTenant() ctx: TenantContext) {
    return this.setup.questionTags(ctx);
  }

  @Post('competencies')
  @RequirePermissions('perf.setup.manage')
  addCompetency(@CurrentTenant() ctx: TenantContext, @Body() dto: CompetencyDto) {
    return this.setup.saveCompetency(ctx, null, dto);
  }

  @Put('competencies/:id')
  @RequirePermissions('perf.setup.manage')
  updateCompetency(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CompetencyDto) {
    return this.setup.saveCompetency(ctx, id, dto);
  }

  @Post('competencies/:id/retire')
  @RequirePermissions('perf.setup.manage')
  @HttpCode(200)
  retireCompetency(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.setup.retireCompetency(ctx, id);
  }

  @Post('competencies/:id/merge')
  @HttpCode(200)
  @RequirePermissions('perf.setup.manage')
  mergeCompetency(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MergeDto) {
    return this.setup.mergeCompetency(ctx, id, dto.intoId);
  }

  @Get('skills')
  @RequirePermissions('perf.setup.manage')
  skills(@CurrentTenant() ctx: TenantContext) {
    return this.setup.skills(ctx);
  }

  @Post('skills')
  @RequirePermissions('perf.setup.manage')
  addSkill(@CurrentTenant() ctx: TenantContext, @Body() dto: SkillDto) {
    return this.setup.saveSkill(ctx, null, dto);
  }

  @Put('skills/:id')
  @RequirePermissions('perf.setup.manage')
  updateSkill(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SkillDto) {
    return this.setup.saveSkill(ctx, id, dto);
  }

  @Post('skills/:id/retire')
  @RequirePermissions('perf.setup.manage')
  @HttpCode(200)
  retireSkill(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.setup.retireSkill(ctx, id);
  }

  @Post('skills/:id/merge')
  @RequirePermissions('perf.setup.manage')
  @HttpCode(200)
  mergeSkill(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MergeDto) {
    return this.setup.mergeSkill(ctx, id, dto.intoId);
  }
}
