import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Transform } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import type { ScopeUser } from '../access/scope';
import { VersionDto } from './dto';
import { ResourcingService } from './resourcing.service';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

class RaiseRequestDto {
  @IsUUID()
  projectId!: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Matches(/^[^<>]*$/, { message: 'Write the role without < or >.' })
  role!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  percent!: number;

  @IsDateString({ strict: true })
  fromOn!: string;

  @IsDateString({ strict: true })
  toOn!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

class FillDto {
  @IsUUID()
  employeeId!: string;

  @IsInt()
  @Min(1)
  version!: number;
}

// Projects P-4 (PRJ-03, PRJ-07; answers 1411, 1417, 1418). The service checks the Projects keys and the project's
// manager. Registered before ProjectsController (its :id routes).
@Controller('projects')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ResourcingController {
  constructor(private readonly resourcing: ResourcingService) {}

  @Get('capacity')
  capacity(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('from') from?: string) {
    if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new BadRequestException('Give the first week as YYYY-MM-DD.');
    return this.resourcing.capacity(ctx, req.user as ScopeUser, from);
  }

  @Get('requests')
  requests(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.resourcing.requests(ctx, req.user as ScopeUser);
  }

  @Post('requests')
  raise(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: RaiseRequestDto) {
    return this.resourcing.raise(ctx, req.user as ScopeUser, dto);
  }

  @Get('requests/:id/matches')
  matches(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.resourcing.matches(ctx, req.user as ScopeUser, id);
  }

  @Post('requests/:id/fill')
  @HttpCode(200)
  fill(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FillDto) {
    return this.resourcing.fill(ctx, req.user as ScopeUser, id, dto);
  }

  @Post('requests/:id/withdraw')
  @HttpCode(200)
  withdraw(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    return this.resourcing.withdraw(ctx, req.user as ScopeUser, id, dto.version);
  }
}
