import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import type { RequestUser } from '../employee-history/employee-history.service';
import { WorkspaceService } from './workspace.service';

export class WorkspaceSearchDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

// The app frame's data (design audit step 1). No permission key of its own: each section of the search and each
// count applies the rule of the page it links to, inside the company's RLS context.
@Controller('workspace')
@UseGuards(JwtAuthGuard)
export class WorkspaceController {
  constructor(private readonly workspace: WorkspaceService) {}

  @Get('search')
  search(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() dto: WorkspaceSearchDto) {
    return this.workspace.search(ctx, req.user as RequestUser, dto.q ?? '');
  }

  @Get('counts')
  counts(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.workspace.counts(ctx, req.user as RequestUser);
  }
}
