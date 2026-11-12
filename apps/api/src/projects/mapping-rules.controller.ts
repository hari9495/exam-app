import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import type { ScopeUser } from '../access/scope';
import { MappingRuleDto, MappingRuleUpdateDto, VersionDto } from './dto';
import { ProjectMappingService } from './project-mapping.service';

// Projects P-3 (PRJ-08, answers 1409, 1410): the company's timesheet mapping rules. The service checks the keys
// (projects.manage or org.settings.manage) and that Projects is on. Registered before ProjectsController (its :id).
@Controller('projects/mapping-rules')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MappingRulesController {
  constructor(private readonly rules: ProjectMappingService) {}

  @Get()
  list(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.rules.list(ctx, req.user as ScopeUser);
  }

  @Post()
  create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: MappingRuleDto) {
    return this.rules.create(ctx, req.user as ScopeUser, dto);
  }

  @Post('test')
  @HttpCode(200)
  test(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.rules.test(ctx, req.user as ScopeUser);
  }

  @Put(':id')
  update(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MappingRuleUpdateDto) {
    return this.rules.update(ctx, req.user as ScopeUser, id, dto);
  }

  @Post(':id/remove')
  @HttpCode(200)
  remove(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    return this.rules.remove(ctx, req.user as ScopeUser, id, dto.version);
  }
}
