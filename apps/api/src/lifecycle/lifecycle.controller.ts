import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import type { ScopeUser } from '../access/scope';
import { CompleteTaskDto, JoinerDto, JoinerImportDto, PostponeDto, ReassignTaskDto, SkipTaskDto, StarterDto, TemplateDto } from './dto';
import { JoinersService } from './joiners.service';
import { LifecycleJourneysService } from './journeys.service';

// M01 lifecycle batch 6a (M01-LIFECYCLE-BUILD-DESIGN §13). Keys (P02 YX-SEC-01), checked again per joiner / person:
//   lifecycle.onboarding.view             the onboarding board and joiners in scope (planned entity / location / dept)
//   lifecycle.onboarding.manage           add, import and postpone joiners; hand tasks to someone else
//   lifecycle.journey.template.manage     onboarding and offboarding checklists
//   no key (implicit)                     my tasks; a checklist I have a task on (or HR in scope); joiners joining my
//                                         team; doing my own tasks (the service decides per task)
@Controller('lifecycle')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LifecycleController {
  constructor(
    private readonly journeys: LifecycleJourneysService,
    private readonly joiners: JoinersService,
  ) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  // ------------------------------------------------------------------------------------------ templates (LIFE-1.04 / 1.06)

  @Get('journey-templates')
  @RequireAnyPermission('lifecycle.journey.template.manage', 'lifecycle.onboarding.manage')
  templates(@CurrentTenant() ctx: TenantContext) {
    return this.journeys.templates(ctx);
  }

  @Get('journey-templates/options')
  @RequirePermissions('lifecycle.journey.template.manage')
  templateOptions(@CurrentTenant() ctx: TenantContext) {
    return this.journeys.templateOptions(ctx);
  }

  @Post('journey-templates')
  @RequirePermissions('lifecycle.journey.template.manage')
  createTemplate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: TemplateDto) {
    return this.journeys.saveTemplate(ctx, this.user(req), null, dto);
  }

  @Post('journey-templates/from-starter')
  @RequirePermissions('lifecycle.journey.template.manage')
  fromStarter(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: StarterDto) {
    return this.journeys.copyStarter(ctx, this.user(req), dto.starterKey);
  }

  @Put('journey-templates/:id')
  @RequirePermissions('lifecycle.journey.template.manage')
  updateTemplate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TemplateDto) {
    return this.journeys.saveTemplate(ctx, this.user(req), id, dto);
  }

  // ------------------------------------------------------------------------------------------ joiners (LIFE-1.07)

  @Get('joiners')
  @RequireAnyPermission('lifecycle.onboarding.view', 'lifecycle.onboarding.manage')
  board(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.joiners.board(ctx, this.user(req));
  }

  @Post('joiners')
  @RequirePermissions('lifecycle.onboarding.manage')
  addJoiner(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: JoinerDto) {
    return this.joiners.add(ctx, this.user(req), dto);
  }

  @Post('joiners/import')
  @HttpCode(200)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @RequirePermissions('lifecycle.onboarding.manage')
  importJoiners(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: JoinerImportDto) {
    return this.joiners.import(ctx, this.user(req), dto);
  }

  @Get('joining-soon')
  joiningSoon(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.joiners.joiningSoon(ctx, this.user(req));
  }

  @Get('joiners/:id')
  joiner(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.joiners.get(ctx, this.user(req), id);
  }

  @Post('joiners/:id/postpone')
  @HttpCode(200)
  @RequirePermissions('lifecycle.onboarding.manage')
  postpone(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PostponeDto) {
    return this.joiners.postpone(ctx, this.user(req), id, dto);
  }

  // ------------------------------------------------------------------------------------------ checklists and tasks

  @Get('my-tasks')
  myTasks(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.journeys.myTasks(ctx, this.user(req));
  }

  @Get('journeys/:id')
  journey(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.journeys.journey(ctx, this.user(req), id);
  }

  @Post('tasks/:id/complete')
  @HttpCode(200)
  complete(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CompleteTaskDto) {
    return this.journeys.complete(ctx, this.user(req), id, dto);
  }

  @Post('tasks/:id/skip')
  @HttpCode(200)
  skip(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SkipTaskDto) {
    return this.journeys.skip(ctx, this.user(req), id, dto);
  }

  @Post('tasks/:id/reassign')
  @HttpCode(200)
  @RequirePermissions('lifecycle.onboarding.manage')
  reassign(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReassignTaskDto) {
    return this.journeys.reassign(ctx, this.user(req), id, dto);
  }
}
