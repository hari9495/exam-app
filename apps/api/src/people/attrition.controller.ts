import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { SPLITS, type Split } from './attrition';
import { ATTRITION_KEY, AttritionService } from './attrition.service';

export class AttritionQueryDto {
  @IsOptional() @Matches(/^20\d\d-(0[1-9]|1[0-2])$/, { message: 'from is a month, for example 2026-04.' }) from?: string;
  @IsOptional() @Matches(/^20\d\d-(0[1-9]|1[0-2])$/, { message: 'to is a month, for example 2026-09.' }) to?: string;
  @IsOptional() @IsIn(SPLITS) by?: Split;
}

// T2-G 47 (answer 2747): People › Headcount and attrition, for holders of the people analytics key (company-wide).
@Controller('people/attrition')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttritionController {
  constructor(private readonly attrition: AttritionService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get()
  @RequirePermissions(ATTRITION_KEY)
  report(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: AttritionQueryDto) {
    return this.attrition.report(ctx, this.user(req), q);
  }

  @Get('export')
  @RequirePermissions(ATTRITION_KEY)
  async export(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Query() q: AttritionQueryDto) {
    const out = await this.attrition.csv(ctx, this.user(req), q);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${out.name}"`);
    return out.csv;
  }
}
