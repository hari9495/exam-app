import { BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import type { RequestUser } from '../employee-history/employee-history.service';
import { EXPORT_COLUMNS, type ExportColumn, WorkforceService } from './workforce.service';

export class WorkforceQueryDto {
  @IsOptional()
  @IsUUID()
  legalEntityId?: string;
}

export class WorkforceExportDto {
  @IsOptional()
  @IsUUID()
  legalEntityId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsUUID('all', { each: true })
  ids?: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(EXPORT_COLUMNS.length)
  @IsIn(EXPORT_COLUMNS, { each: true })
  columns!: ExportColumn[];
}

export class SavedViewDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsBoolean()
  shared!: boolean;

  @IsObject()
  state!: Record<string, unknown>;
}

// People › Directory on the designed screen (PPL-01). The service decides every field by the person's grants.
@Controller('people/workforce')
@UseGuards(JwtAuthGuard)
export class WorkforceController {
  constructor(private readonly workforce: WorkforceService) {}

  @Get()
  list(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: WorkforceQueryDto) {
    return this.workforce.workforce(ctx, req.user as RequestUser, q.legalEntityId ?? null);
  }

  @Post('export')
  @HttpCode(200)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="directory.csv"')
  @Header('Cache-Control', 'no-store')
  export(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: WorkforceExportDto) {
    return this.workforce.export(ctx, req.user as RequestUser, dto);
  }

  @Get('views')
  views(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.workforce.listViews(ctx, req.user as RequestUser);
  }

  @Post('views')
  createView(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: SavedViewDto) {
    // A view is filters and columns, never data: keep it small.
    if (JSON.stringify(dto.state).length > 4000) throw new BadRequestException('That view is too large to save.');
    return this.workforce.createView(ctx, req.user as RequestUser, dto);
  }

  @Delete('views/:id')
  deleteView(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.workforce.deleteView(ctx, req.user as RequestUser, id);
  }
}
