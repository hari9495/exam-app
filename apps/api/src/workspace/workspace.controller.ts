import { Body, Controller, Delete, Get, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ArrayMaxSize, IsArray, IsIn, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { ownSession } from '../org-structure/org-structure.controller';
import { HOME_PERSONAS, HomeLayoutService, type HomePersona } from './home-layout.service';
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

export class WorkspaceHomeDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month?: string;

  @IsOptional()
  @IsUUID()
  legalEntityId?: string;
}

const WIDGET_ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;

/** T2-F 79: the person's own Home layout (the widgets shown in order, the ones they removed, sizes they picked). */
export class HomeLayoutDto {
  @IsIn(HOME_PERSONAS)
  persona!: HomePersona;

  @IsArray()
  @ArrayMaxSize(40)
  @Matches(WIDGET_ID, { each: true })
  order!: string[];

  @IsArray()
  @ArrayMaxSize(40)
  @Matches(WIDGET_ID, { each: true })
  hidden!: string[];

  @IsObject()
  sizes!: Record<string, number>;
}

export class WorkspaceCountsDto {
  /** The top bar's company: counts of lists that follow it (Probation) count only its people. */
  @IsOptional()
  @IsUUID()
  legalEntityId?: string;
}

// The app frame's data (design audit step 1). No permission key of its own: each section of the search and each
// count applies the rule of the page it links to, inside the company's RLS context.
@Controller('workspace')
@UseGuards(JwtAuthGuard)
export class WorkspaceController {
  constructor(
    private readonly workspace: WorkspaceService,
    private readonly layouts: HomeLayoutService,
  ) {}

  @Get('search')
  search(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() dto: WorkspaceSearchDto) {
    return this.workspace.search(ctx, req.user as RequestUser, dto.q ?? '');
  }

  @Get('home')
  home(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() dto: WorkspaceHomeDto) {
    return this.workspace.home(ctx, req.user as RequestUser, dto.month ?? new Date().toISOString().slice(0, 7), dto.legalEntityId ?? null);
  }

  /** T2-F 79: one's own Home layout and whether the company lets roles personalise (no key: only the caller's own row). */
  @Get('home/layout')
  homeLayout(@CurrentTenant() ctx: TenantContext) {
    return this.layouts.get(ctx);
  }

  @Put('home/layout')
  saveHomeLayout(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: HomeLayoutDto) {
    ownSession(req);
    return this.layouts.save(ctx, dto);
  }

  /** Reset to company layout. */
  @Delete('home/layout')
  resetHomeLayout(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    ownSession(req);
    return this.layouts.reset(ctx);
  }

  @Get('counts')
  counts(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() dto: WorkspaceCountsDto) {
    return this.workspace.counts(ctx, req.user as RequestUser, dto.legalEntityId ?? null);
  }
}
