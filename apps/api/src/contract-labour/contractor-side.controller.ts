import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import type { Request, Response } from 'express';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import type { ScopeUser } from '../access/scope';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import { ContractorSideService } from './contractor-side.service';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const NO_TAGS = /^[^<>]*$/;
const UPLOAD = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
const who = (req: Request) => req.user as ScopeUser;
const file = (f: Express.Multer.File | undefined) => (f ? { name: f.originalname, data: f.buffer } : null);

class SiteDto {
  @IsUUID() clientId!: string;
  @trim() @IsString() @MinLength(2) @MaxLength(200) @Matches(NO_TAGS) name!: string;
  @Matches(/^IN-[A-Z]{2}$/, { message: 'Choose the state.' }) state!: string;
  @IsOptional() @trim() @IsString() @MaxLength(500) @Matches(NO_TAGS) address?: string;
  @trim() @IsString() @MinLength(2) @MaxLength(200) @Matches(NO_TAGS) principalName!: string;
  @trim() @IsString() @MinLength(3, { message: 'Give the client’s registration number for this establishment.' }) @MaxLength(60) @Matches(NO_TAGS) registrationNo!: string;
  @trim() @IsString() @MinLength(2) @MaxLength(100) @Matches(NO_TAGS) packChannel!: string;
  @IsOptional() @IsInt() @Min(1) @Max(28) packDueDay?: number;
}

/** Multipart: numbers and lists arrive as text. */
class OwnLicenceDto {
  @IsUUID() legalEntityId!: string;
  @IsOptional() @IsUUID() clientSiteId?: string;
  @trim() @IsString() @MinLength(3) @MaxLength(40) @Matches(NO_TAGS) licenceNo!: string;
  @trim() @IsString() @MinLength(3) @MaxLength(200) @Matches(NO_TAGS) scope!: string;
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.split(',').map((x: string) => x.trim()).filter(Boolean) : value)) @IsArray() @ArrayMaxSize(40) @Matches(/^IN-[A-Z]{2}$/, { each: true }) states?: string[];
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) maxWorkers!: number;
  @Matches(DAY) validFrom!: string;
  @Matches(DAY) validTo!: string;
  @IsOptional() @trim() @IsString() @MaxLength(200) @Matches(NO_TAGS) issuedBy?: string;
}

class PackDto {
  @IsUUID() clientSiteId!: string;
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Give the month as YYYY-MM.' }) month!: string;
  @IsOptional() @trim() @IsString() @MaxLength(500) reason?: string;
}

class UploadDto {
  @Matches(DAY, { message: 'Give the upload day.' }) uploadedOn!: string;
  @trim() @IsString() @MinLength(3, { message: 'Give the client portal’s reference.' }) @MaxLength(80) @Matches(NO_TAGS) reference!: string;
}

// Contract labour CL-8 (CLB-06 … 08, answers 638, 639): we are the contractor. Reads with the contract labour key,
// changes by its compliance owners (the service checks the whole-company grant and acting for someone else).
@Controller('contract-labour')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequireAnyPermission('clra.contractor.view', 'clra.contractor.manage')
export class ContractorSideController {
  constructor(private readonly side: ContractorSideService) {}

  @Get('client-sites')
  sites(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.side.sites(ctx, who(req));
  }

  @Post('client-sites')
  addSite(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: SiteDto) {
    return this.side.addSite(ctx, who(req), dto);
  }

  @Get('own-licences')
  licences(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.side.licences(ctx, who(req));
  }

  @Post('own-licences')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(UPLOAD)
  addLicence(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: OwnLicenceDto, @UploadedFile() f: Express.Multer.File | undefined) {
    return this.side.addLicence(ctx, who(req), dto, file(f));
  }

  @Get('client-packs')
  packs(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.side.packs(ctx, who(req));
  }

  @Post('client-packs')
  makePack(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PackDto) {
    return this.side.makePack(ctx, who(req), dto);
  }

  @Get('client-packs/:id/file')
  async packFile(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const f = await this.side.packFile(ctx, who(req), id);
    res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${f.name}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(f.file);
  }

  @Post('client-packs/:id/upload')
  @HttpCode(200)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(UPLOAD)
  upload(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UploadDto, @UploadedFile() f: Express.Multer.File | undefined) {
    return this.side.recordUpload(ctx, who(req), id, dto, file(f));
  }

  @Post('client-packs/:id/acknowledgement')
  @HttpCode(200)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(UPLOAD)
  ack(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() f: Express.Multer.File | undefined) {
    return this.side.recordAcknowledgement(ctx, who(req), id, file(f));
  }
}
