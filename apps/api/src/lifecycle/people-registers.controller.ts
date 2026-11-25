import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { PeopleRegistersService } from './people-registers.service';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class BuddyPoolDto {
  @IsUUID() employeeId!: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) cap?: number;
}

export class UnionDto {
  @IsUUID() legalEntityId!: string;
  @IsString() @MinLength(2) @MaxLength(200) name!: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(60) registrationNo?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() locationId?: string | null;
  @IsIn(['recognised', 'not_recognised']) recognition!: 'recognised' | 'not_recognised';
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(200) basis?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString({ strict: true }) @Matches(DATE) validFrom?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString({ strict: true }) @Matches(DATE) validTo?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500) bearers?: string | null;
}

export class UnionQueryDto {
  @IsOptional() @IsUUID() legalEntityId?: string;
}

export class PositionDto {
  @IsString() @MinLength(2) @MaxLength(120) title!: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() incumbentEmployeeId?: string | null;
}

export class NominateDto {
  @IsUUID() employeeId!: string;
  @IsIn(['now', '1_2y', '3y']) readiness!: 'now' | '1_2y' | '3y';
}

// People menu registers (PPL-41 buddies, PPL-39 union register, PPL-26 succession). Keys, checked again in the service:
//   lifecycle.onboarding.view / manage   the buddy pool (manage: add and remove; assigning is PUT joiners/:id/buddy)
//   lifecycle.exit.manage                the union register of the legal entities it reaches (industrial relations)
//   succession.manage                    succession plans, company-wide holders only (Confidential)
@Controller('people')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PeopleRegistersController {
  constructor(private readonly registers: PeopleRegistersService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get('buddies')
  @RequireAnyPermission('lifecycle.onboarding.view', 'lifecycle.onboarding.manage')
  buddies(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.registers.buddies(ctx, this.user(req));
  }

  @Post('buddies')
  @RequirePermissions('lifecycle.onboarding.manage')
  addBuddy(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: BuddyPoolDto) {
    return this.registers.addBuddy(ctx, this.user(req), dto);
  }

  @Delete('buddies/:employeeId')
  @RequirePermissions('lifecycle.onboarding.manage')
  removeBuddy(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.registers.removeBuddy(ctx, this.user(req), employeeId);
  }

  @Get('unions')
  @RequirePermissions('lifecycle.exit.manage')
  unions(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: UnionQueryDto) {
    return this.registers.unions(ctx, this.user(req), q.legalEntityId);
  }

  @Post('unions')
  @RequirePermissions('lifecycle.exit.manage')
  addUnion(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: UnionDto) {
    return this.registers.saveUnion(ctx, this.user(req), null, dto);
  }

  @Put('unions/:id')
  @RequirePermissions('lifecycle.exit.manage')
  editUnion(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UnionDto) {
    return this.registers.saveUnion(ctx, this.user(req), id, dto);
  }

  @Get('succession')
  @RequirePermissions('succession.manage')
  positions(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.registers.positions(ctx, this.user(req));
  }

  @Post('succession')
  @RequirePermissions('succession.manage')
  addPosition(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PositionDto) {
    return this.registers.addPosition(ctx, this.user(req), dto);
  }

  @Put('succession/:id/successors')
  @RequirePermissions('succession.manage')
  nominate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NominateDto) {
    return this.registers.nominate(ctx, this.user(req), id, dto);
  }

  @Delete('succession/:id/successors/:employeeId')
  @RequirePermissions('succession.manage')
  removeSuccessor(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.registers.removeSuccessor(ctx, this.user(req), id, employeeId);
  }
}
