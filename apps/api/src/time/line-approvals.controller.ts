import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Type, Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import type { ScopeUser } from '../access/scope';
import { LineApprovalsService } from './line-approvals.service';
import { TimesheetService } from './timesheet.service';

// Projects P-2 (PRJ-02, answers 1406, 1407, 1442): line-by-line timesheet approval. Signed-in people; the service lets
// each person decide only the lines they approve (their project's lines, or the people they approve for).

class LineDecisionDto {
  @IsUUID()
  lineId!: string;

  @IsIn(['approved', 'reduced', 'rejected'])
  status!: 'approved' | 'reduced' | 'rejected';

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(168)
  hours?: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(300)
  reason?: string;

  @IsInt()
  @Min(1)
  version!: number;
}

class DecideLinesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LineDecisionDto)
  decisions!: LineDecisionDto[];
}

class BulkItemDto {
  @IsUUID()
  lineId!: string;

  @IsInt()
  @Min(1)
  version!: number;
}

class BulkLinesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BulkItemDto)
  items!: BulkItemDto[];
}

@Controller('time/line-approvals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LineApprovalsController {
  constructor(
    private readonly lines: LineApprovalsService,
    private readonly timesheets: TimesheetService,
  ) {}

  /** Batch D answer 2535: people on my projects with weeks not sent (project managers; empty for anyone else). */
  @Get('not-sent')
  notSent(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.timesheets.teamNotSent(ctx, req.user as ScopeUser);
  }

  @Post('not-sent/:employeeId/remind')
  @HttpCode(200)
  remind(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.timesheets.remindNotSent(ctx, req.user as ScopeUser, employeeId);
  }

  @Get()
  list(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.lines.list(ctx, req.user as ScopeUser);
  }

  @Post('decide')
  @HttpCode(200)
  decide(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: DecideLinesDto) {
    return this.lines.decide(ctx, req.user as ScopeUser, dto.decisions);
  }

  @Post('bulk')
  @HttpCode(200)
  bulk(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: BulkLinesDto) {
    return this.lines.bulk(ctx, req.user as ScopeUser, dto.items);
  }
}
