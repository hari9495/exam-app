import { Body, Controller, Get, HttpCode, Ip, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { ownSession } from '../org-structure/org-structure.controller';
import type { RequestUser } from '../employee-history/employee-history.service';
import { ComplianceService } from './compliance.service';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class HoldingDto {
  @IsString() @MinLength(2) @MaxLength(160) security!: string;
  @IsInt() @Min(1) @Max(1_000_000_000) quantity!: number;
  @IsString() @MinLength(2) @MaxLength(80) how!: string;
}
export class RelatedDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsString() @MaxLength(20) relation!: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(10) pan?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(200) holdings?: string | null;
}
export class SaveDto {
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => HoldingDto) holdings!: HoldingDto[];
  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => RelatedDto) related!: RelatedDto[];
  @ValidateIf((_, v) => v !== null) @IsBoolean() coiHas!: boolean | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(2000) coiDetails?: string | null;
  @IsInt() @Min(1) version!: number;
}
export class SubmitDto {
  @Matches(/^\d{6}$/) code!: string;
  @IsBoolean() attest!: boolean;
}
export class DesignateDto {
  @IsUUID() employeeId!: string;
}
export class VersionDto {
  @IsInt() @Min(1) version!: number;
}
export class WindowDto {
  @Matches(DATE) from!: string;
  @Matches(DATE) to!: string;
  @IsString() @MinLength(3) @MaxLength(200) reason!: string;
}
export class PreclearDto {
  @IsString() @MinLength(2) @MaxLength(160) security!: string;
  @IsIn(['buy', 'sell']) side!: 'buy' | 'sell';
  @IsInt() @Min(1) @Max(1_000_000_000) quantity!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(100_000_000_000) value!: number;
  @IsBoolean() noUpsi!: boolean;
}
export class DecideDto {
  @IsBoolean() approve!: boolean;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500) note?: string | null;
  @IsInt() @Min(1) version!: number;
}
export class ReportDto {
  @Matches(DATE) tradedOn!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsUUID() contractNoteDocumentId!: string;
  @IsInt() @Min(1) version!: number;
}

// BFSI compliance (PPL-43, PPL-44): off unless the company switches it on. The person's own routes need only a
// session (the service checks they are a designated person); the officer's need compliance.officer company-wide.
@Controller('compliance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  private user(req: Request) {
    return req.user as RequestUser;
  }

  @Get('me')
  me(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.compliance.me(ctx, this.user(req));
  }

  @Put('me/declaration')
  save(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: SaveDto) {
    ownSession(req);
    return this.compliance.save(ctx, this.user(req), dto);
  }

  @Post('me/declaration/otp')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  otp(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Ip() ip: string) {
    ownSession(req);
    return this.compliance.sendOtp(ctx, this.user(req), ip ?? null);
  }

  @Post('me/declaration/submit')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  submit(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: SubmitDto) {
    ownSession(req);
    return this.compliance.submit(ctx, this.user(req), dto);
  }

  @Post('me/preclearance')
  request(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PreclearDto) {
    ownSession(req);
    return this.compliance.request(ctx, this.user(req), dto);
  }

  @Post('me/preclearance/:id/report')
  @HttpCode(200)
  report(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReportDto) {
    ownSession(req);
    return this.compliance.report(ctx, this.user(req), id, dto);
  }

  @Get('register')
  @RequirePermissions('compliance.officer')
  register(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.compliance.register(ctx, this.user(req));
  }

  @Post('designated')
  @RequirePermissions('compliance.officer')
  designate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: DesignateDto) {
    ownSession(req);
    return this.compliance.designate(ctx, this.user(req), dto.employeeId);
  }

  @Get('declarations/:id')
  @RequirePermissions('compliance.officer')
  declaration(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.compliance.declarationFor(ctx, this.user(req), id);
  }

  @Post('declarations/:id/review')
  @HttpCode(200)
  @RequirePermissions('compliance.officer')
  review(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    ownSession(req);
    return this.compliance.review(ctx, this.user(req), id, dto.version);
  }

  @Post('trading-windows')
  @RequirePermissions('compliance.officer')
  closeWindow(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: WindowDto) {
    ownSession(req);
    return this.compliance.closeWindow(ctx, this.user(req), dto);
  }

  @Get('preclearance')
  @RequirePermissions('compliance.officer')
  queue(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.compliance.queue(ctx, this.user(req));
  }

  @Post('preclearance/:id/decide')
  @HttpCode(200)
  @RequirePermissions('compliance.officer')
  decide(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideDto) {
    ownSession(req);
    return this.compliance.decide(ctx, this.user(req), id, dto);
  }
}
