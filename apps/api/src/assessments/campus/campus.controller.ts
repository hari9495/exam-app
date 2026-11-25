import { Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OwnSessionChangesGuard } from '../../auth/own-session.guard';
import { CurrentTenant } from '../../auth/current-tenant.decorator';
import { CurrentUserId } from '../../auth/current-user-id.decorator';
import { PermissionsGuard } from '../../rbac/permissions.guard';
import { RequirePermissions } from '../../rbac/permissions.decorator';
import { STRICT_WALK_IN_THROTTLE } from '../../rate-limit-tiers';
import { CampusService, type Visibility } from './campus.service';
import type { CampusSettings, FieldMode } from './campus-rules';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const MODES = ['off', 'optional', 'required'];

export class InstitutionDto {
  @trim() @IsString() @MinLength(2) @MaxLength(300) name!: string;
  @trim() @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsOptional() @trim() @IsString() @MaxLength(120) city?: string | null;
  @IsOptional() @trim() @IsString() @MaxLength(200) coordinatorName?: string | null;
  @IsOptional() @Transform(({ value }) => (value === '' ? null : value)) @IsEmail() @MaxLength(320) coordinatorEmail?: string | null;
  @IsIn(['none', 'aggregate', 'per_candidate']) resultsVisibility!: Visibility;
  @IsOptional() @IsBoolean() archived?: boolean;
}

class FieldsDto {
  @IsIn(MODES) phone!: FieldMode;
  @IsIn(MODES) branch!: FieldMode;
  @IsIn(MODES) graduationYear!: FieldMode;
  @IsIn(MODES) cgpa!: FieldMode;
}

export class CampusSettingsDto implements CampusSettings {
  @ValidateNested() @Type(() => FieldsDto) fields!: FieldsDto;
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(120, { each: true }) branches!: string[];
  @IsOptional() @IsInt() @Min(2000) @Max(2100) graduationYear!: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) minCgpa!: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(100000) cap!: number | null;
  @IsBoolean() tellIneligible!: boolean;
}

export class SaveCampusDto {
  /** null turns the campus form off for this drive. */
  @IsOptional() @ValidateNested() @Type(() => CampusSettingsDto) settings!: CampusSettingsDto | null;
}

/** Answer 2241: a CSV of institutions; `commit` false only checks the rows. */
export class InstitutionImportDto {
  @IsString() @MinLength(1) @MaxLength(262_144) csv!: string;
  @IsBoolean() commit!: boolean;
}

export class MergeDto {
  @IsUUID() intoId!: string;
}

export class CoordinatorLinkDto {
  @IsUUID() institutionId!: string;
}

// Assessments AS-3 part 2 (PRC-29): the people who invite candidates run campus drives (candidate:manage, as PRC-07).
@Controller('asmt')
@UseGuards(JwtAuthGuard, OwnSessionChangesGuard, PermissionsGuard)
export class CampusController {
  constructor(private readonly campus: CampusService) {}

  @Get('institutions')
  @RequirePermissions('candidate:manage')
  institutions(@CurrentTenant() ctx: TenantContext) {
    return this.campus.institutions(ctx);
  }

  @Post('institutions')
  @RequirePermissions('candidate:manage')
  createInstitution(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Body() dto: InstitutionDto) {
    return this.campus.saveInstitution(ctx, userId, null, dto);
  }

  @Post('institutions/import')
  @HttpCode(200)
  @RequirePermissions('candidate:manage')
  importInstitutions(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Body() dto: InstitutionImportDto) {
    return this.campus.importInstitutions(ctx, userId, dto.csv, dto.commit);
  }

  @Put('institutions/:id')
  @RequirePermissions('candidate:manage')
  updateInstitution(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: InstitutionDto) {
    return this.campus.saveInstitution(ctx, userId, id, dto);
  }

  @Get('drives/:id/campus')
  @RequirePermissions('candidate:manage')
  view(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.campus.campus(ctx, id);
  }

  @Put('drives/:id/campus')
  @RequirePermissions('candidate:manage')
  save(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveCampusDto) {
    return this.campus.saveSettings(ctx, userId, id, dto.settings ?? null);
  }

  @Post('drives/:id/coordinator-link')
  @HttpCode(200)
  @RequirePermissions('candidate:manage')
  link(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CoordinatorLinkDto) {
    return this.campus.sendCoordinatorLink(ctx, userId, id, dto.institutionId);
  }

  @Post('registrants/:id/merge')
  @HttpCode(200)
  @RequirePermissions('candidate:manage')
  merge(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MergeDto) {
    return this.campus.merge(ctx, userId, id, dto.intoId);
  }

  @Post('registrants/:id/not-duplicate')
  @HttpCode(200)
  @RequirePermissions('candidate:manage')
  notDuplicate(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.campus.notDuplicate(ctx, userId, id);
  }
}

// The college coordinator's read-only view, by the link emailed to them (no sign-in; the token is kept only as a hash).
@Controller('public/campus')
@Throttle(STRICT_WALK_IN_THROTTLE)
export class CampusPublicController {
  constructor(private readonly campus: CampusService) {}

  @Get('coordinator/:token')
  coordinator(@Param('token') token: string) {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw new NotFoundException('This link has expired or was replaced. Ask the company for a new one.');
    return this.campus.coordinatorView(token);
  }
}
