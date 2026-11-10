import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { TenantContext } from '@exam-platform/shared';
import type { ScopeUser } from '../access/scope';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { ClraRegistersService } from './registers.service';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

class MakeRegistersDto {
  @Matches(MONTH, { message: 'Give the month as YYYY-MM.' }) month!: string;
  @IsUUID() locationId!: string;
  @IsOptional() @trim() @IsString() @MaxLength(500) reason?: string;
}

class FilingDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Give the filing day as a date.' }) filedOn!: string;
  @trim() @IsString() @MinLength(3, { message: 'Give the portal’s reference (3 to 60 characters).' }) @MaxLength(60) @Matches(/^[^<>]*$/) reference!: string;
}

const pdf = (res: Response, file: Buffer, name: string) => {
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  return new StreamableFile(file);
};
const who = (req: Request) => req.user as ScopeUser;

// Contract labour CL-6 (CLB-04, answers 629, 630): registers and the annual return. Freezing and signing a register
// with the company DSC are the payroll registers routes (statutory/registers/:id/freeze, /sign).
@Controller('contract-labour')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequireAnyPermission('clra.contractor.view', 'clra.contractor.manage')
export class ClraRegistersController {
  constructor(private readonly registers: ClraRegistersService) {}

  @Get('registers')
  list(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('month') month: string) {
    if (!MONTH.test(month ?? '')) month = new Date(Date.now() + 330 * 60_000 - 28 * 86_400_000).toISOString().slice(0, 7);
    return this.registers.list(ctx, who(req), month);
  }

  @Post('registers')
  make(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: MakeRegistersDto) {
    return this.registers.make(ctx, who(req), dto);
  }

  @Get('registers/:id/file')
  async file(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const f = await this.registers.file(ctx, who(req), id);
    return pdf(res, f.file, f.name);
  }

  @Get('returns')
  returns(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('year', new ParseIntPipe({ optional: true })) year?: number) {
    return this.registers.returns(ctx, who(req), year ?? Number(new Date().toISOString().slice(0, 4)) - 1);
  }

  @Get('returns/:locationId/:year/draft.pdf')
  async draft(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('locationId', ParseUUIDPipe) locationId: string, @Param('year', ParseIntPipe) year: number, @Res({ passthrough: true }) res: Response) {
    const f = await this.registers.returnPdf(ctx, who(req), locationId, year);
    return pdf(res, f.file, f.name);
  }

  @Post('returns/:locationId/:year/filed')
  filed(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('locationId', ParseUUIDPipe) locationId: string, @Param('year', ParseIntPipe) year: number, @Body() dto: FilingDto) {
    return this.registers.recordFiling(ctx, who(req), locationId, year, dto);
  }
}
