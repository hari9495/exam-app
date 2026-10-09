import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { RequireStepUp } from '../auth/step-up.decorator';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import type { ScopeUser } from '../access/scope';
import { BgvCheckDto, BgvUpdateDto, CancelJoinerDto, CompleteTaskDto, JoinDto, JoinerDto, JoinerImportDto, PlanDto, PostponeDto, ReassignTaskDto, SkipTaskDto, StarterDto, TemplateDto } from './dto';
import { JoiningService } from './joining.service';
import { JoinersService } from './joiners.service';
import { LifecycleJourneysService } from './journeys.service';

// M01 lifecycle batch 6a (M01-LIFECYCLE-BUILD-DESIGN §13). Keys (P02 YX-SEC-01), checked again per joiner / person:
//   lifecycle.onboarding.view             the onboarding board and joiners in scope (planned entity / location / dept)
//   lifecycle.onboarding.manage           add, import and postpone joiners; hand tasks to someone else
//   lifecycle.journey.template.manage     onboarding and offboarding checklists
//   lifecycle.bgv.manage                  background-check consent requests and checks (Special data)
//   + employee.change.manage              mark a joiner joined (the ordinary hire path checks it again)
//   no key (implicit)                     my tasks; a checklist I have a task on (or HR in scope); joiners joining my
//                                         team; doing my own tasks (the service decides per task)
@Controller('lifecycle')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LifecycleController {
  constructor(
    private readonly journeys: LifecycleJourneysService,
    private readonly joiners: JoinersService,
    private readonly joining: JoiningService,
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

  // ------------------------------------------------------------------------------------------ batch 6b: joining, BGV, offers

  @Get('joiners/:id/forms')
  @RequireAnyPermission('lifecycle.onboarding.view', 'lifecycle.onboarding.manage')
  forms(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.joining.forms(ctx, this.user(req), id);
  }

  @Put('joiners/:id/plan')
  @RequirePermissions('lifecycle.onboarding.manage')
  plan(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PlanDto) {
    return this.joining.updatePlan(ctx, this.user(req), id, dto);
  }

  @Post('joiners/:id/join')
  @HttpCode(200)
  @RequirePermissions('lifecycle.onboarding.manage', 'employee.change.manage')
  join(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: JoinDto) {
    return this.joining.markJoined(ctx, this.user(req), id, dto);
  }

  @Post('joiners/:id/cancel')
  @HttpCode(200)
  @RequireStepUp()
  @RequirePermissions('lifecycle.onboarding.manage')
  cancel(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelJoinerDto) {
    return this.joining.cancel(ctx, this.user(req), id, dto);
  }

  @Post('joiners/:id/bgv/ask')
  @HttpCode(200)
  @RequirePermissions('lifecycle.bgv.manage')
  askBgv(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.joining.askBgvConsent(ctx, this.user(req), id);
  }

  @Post('joiners/:id/bgv/checks')
  @RequirePermissions('lifecycle.bgv.manage')
  addCheck(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BgvCheckDto) {
    return this.joining.addCheck(ctx, this.user(req), id, dto);
  }

  @Post('bgv/checks/:checkId')
  @HttpCode(200)
  @RequirePermissions('lifecycle.bgv.manage')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  updateCheck(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('checkId', ParseUUIDPipe) checkId: string, @Body() dto: BgvUpdateDto, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.joining.updateCheck(ctx, this.user(req), checkId, dto, file);
  }

  @Get('ready-to-onboard')
  @RequirePermissions('lifecycle.onboarding.manage')
  ready(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.joining.readyToOnboard(ctx, this.user(req));
  }

  @Post('ready-to-onboard/:offerId')
  @RequirePermissions('lifecycle.onboarding.manage')
  fromOffer(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('offerId', ParseUUIDPipe) offerId: string, @Body() dto: JoinerDto) {
    return this.joiners.fromOffer(ctx, this.user(req), offerId, dto);
  }
}
