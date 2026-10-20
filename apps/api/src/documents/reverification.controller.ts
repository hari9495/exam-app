import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { ReverificationAskDto, ReverificationEndDto, ReverificationRuleDto } from './dto';
import { ReverificationService } from './reverification.service';

// PPL-42 re-verification cycles. document.manage for the rules, the due list and asking (the service checks the legal
// entity of a rule and each person's document class); the person record's "Coming up" is self, HR in scope or a manager.
@Controller('documents/reverification')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReverificationController {
  constructor(private readonly reverification: ReverificationService) {}

  @Get('rules')
  @RequirePermissions('document.manage')
  rules(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.reverification.rules(ctx, req.user as ScopeUser);
  }

  @Post('rules')
  @RequirePermissions('document.manage')
  addRule(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ReverificationRuleDto) {
    return this.reverification.addRule(ctx, req.user as ScopeUser, dto);
  }

  @Post('rules/:id/end')
  @HttpCode(200)
  @RequirePermissions('document.manage')
  endRule(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReverificationEndDto) {
    return this.reverification.endRule(ctx, req.user as ScopeUser, id, dto.validTo);
  }

  @Get('due')
  @RequirePermissions('document.manage')
  due(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.reverification.due(ctx, req.user as ScopeUser);
  }

  @Post('ask')
  @HttpCode(200)
  @RequirePermissions('document.manage')
  ask(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ReverificationAskDto) {
    return this.reverification.ask(ctx, req.user as ScopeUser, dto);
  }

  /** The person record's "Coming up": the person, document.manage in scope, or their manager (decided by the service). */
  @Get('person/:employeeId')
  forPerson(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.reverification.forPerson(ctx, req.user as ScopeUser, employeeId);
  }
}
