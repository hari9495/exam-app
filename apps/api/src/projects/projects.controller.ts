import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import type { ScopeUser } from '../access/scope';
import { AllocationDto, SaveProjectSettingsDto, AllocationUpdateDto, MilestoneDto, ProjectInputDto, ProjectStatusDto, ProjectUpdateDto, TaskDto, VersionDto, HoursRangeQueryDto } from './dto';
import { ProjectsService } from './projects.service';

// Projects P-1 (answers 1401 to 1405, 1412, 1420). Signed-in company people; the service checks the Projects keys
// (projects.view / manage / finance / resource) and the project manager per record, because a project's manager may
// run their own project without a key. Projects must be switched on for the company (projects.enabled).
@Controller('projects')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get('status')
  status(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.projects.status(ctx, this.user(req));
  }

  @Get('settings')
  readSettings(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.projects.readSettings(ctx, this.user(req));
  }

  @Put('settings')
  saveSettings(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: SaveProjectSettingsDto) {
    return this.projects.saveSettings(ctx, this.user(req), dto.changes);
  }

  @Get()
  list(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.projects.list(ctx, this.user(req));
  }

  @Get('choices')
  choices(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.projects.choices(ctx, this.user(req));
  }

  @Post()
  create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ProjectInputDto) {
    return this.projects.create(ctx, this.user(req), dto);
  }

  /** Answer 1541: PRJ-01's Timesheets tab for a week. */
  @Get(':id/timesheets')
  timesheets(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query('week') week: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week ?? '')) throw new BadRequestException('Give the week as YYYY-MM-DD (a Monday).');
    return this.projects.timesheets(ctx, this.user(req), id, week);
  }

  @Get(':id')
  get(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: HoursRangeQueryDto) {
    return this.projects.get(ctx, this.user(req), id, q.range ?? 'week');
  }

  @Put(':id')
  update(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProjectUpdateDto) {
    return this.projects.update(ctx, this.user(req), id, dto);
  }

  @Post(':id/status')
  @HttpCode(200)
  setStatus(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProjectStatusDto) {
    return this.projects.setStatus(ctx, this.user(req), id, dto);
  }

  @Post(':id/allocations')
  allocate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AllocationDto) {
    return this.projects.allocate(ctx, this.user(req), id, dto);
  }

  @Put(':id/allocations/:aid')
  updateAllocation(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('aid', ParseUUIDPipe) aid: string, @Body() dto: AllocationUpdateDto) {
    return this.projects.updateAllocation(ctx, this.user(req), id, aid, dto);
  }

  @Post(':id/allocations/:aid/end')
  @HttpCode(200)
  endAllocation(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('aid', ParseUUIDPipe) aid: string, @Body() dto: VersionDto) {
    return this.projects.endAllocation(ctx, this.user(req), id, aid, dto.version);
  }

  @Post(':id/tasks')
  addTask(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TaskDto) {
    return this.projects.addTask(ctx, this.user(req), id, dto);
  }

  @Put(':id/tasks/:tid')
  updateTask(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('tid', ParseUUIDPipe) tid: string, @Body() dto: TaskDto) {
    return this.projects.updateTask(ctx, this.user(req), id, tid, dto);
  }

  @Post(':id/milestones')
  addMilestone(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MilestoneDto) {
    return this.projects.addMilestone(ctx, this.user(req), id, dto);
  }

  @Post(':id/milestones/:mid/complete')
  @HttpCode(200)
  completeMilestone(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('mid', ParseUUIDPipe) mid: string, @Body() dto: VersionDto) {
    return this.projects.completeMilestone(ctx, this.user(req), id, mid, dto.version);
  }
}
