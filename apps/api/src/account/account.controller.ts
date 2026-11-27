import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { ownSession } from '../org-structure/org-structure.controller';
import { AccountService, type AccountUser } from './account.service';
import { ScheduledExportService } from './scheduled-export.service';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class ClosureRequestDto {
  @trim()
  @IsString()
  @Length(1, 200)
  companyName!: string;

  @trim()
  @IsString()
  @Length(3, 500)
  @Matches(/^[^<>]*$/, { message: 'Leave out < and >.' })
  reason!: string;
}

/** T2-G 45: the company's storage for the scheduled export. Each kind's fields are checked in the service. */
export class ExportDestinationDto {
  @IsIn(['s3', 'azure_blob', 'google_drive'])
  kind!: 's3' | 'azure_blob' | 'google_drive';

  @IsOptional() @IsString() @Length(0, 100) bucket?: string;
  @IsOptional() @IsString() @Length(0, 40) region?: string;
  @IsOptional() @IsString() @Length(0, 40) accountName?: string;
  @IsOptional() @IsString() @Length(0, 100) container?: string;
  @IsOptional() @IsString() @Length(0, 200) prefix?: string;
  @IsOptional() @IsString() @Length(0, 120) folderId?: string;
  @IsOptional() @IsString() @Length(0, 200) accessKeyId?: string;
  @IsOptional() @IsString() @Length(0, 200) secretAccessKey?: string;
  @IsOptional() @IsString() @Length(0, 200) accountKey?: string;
  @IsOptional() @IsString() @Length(0, 200) clientEmail?: string;
  @IsOptional() @IsString() @Length(0, 5000) privateKey?: string;

  @IsString()
  @Length(12, 128)
  zipPassword!: string;
}

/**
 * Settings group 8 (S-9, answers 1328 and 1332). Billing is read-only (no payment here); the export and the closure
 * request are for System Admins with the security key, never while acting for someone else.
 */
@Controller('account')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly scheduled: ScheduledExportService,
  ) {}

  private user(req: Request) {
    return req.user as AccountUser;
  }

  // Answer 1884: finance people read it with billing.view; export and closure stay with the System Admin's billing key.
  @Get('billing')
  @RequireAnyPermission('org:manage_billing', 'billing.view')
  billing(@CurrentTenant() ctx: TenantContext) {
    return this.account.billing(ctx);
  }

  @Get('data')
  @RequirePermissions('org:manage_billing')
  overview(@CurrentTenant() ctx: TenantContext) {
    return this.account.overview(ctx);
  }

  @Post('exports')
  @RequirePermissions('org:manage_billing')
  @RequireStepUp()
  startExport(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    ownSession(req);
    return this.account.startExport(ctx, this.user(req));
  }

  @Get('exports/:id/file')
  @RequirePermissions('org:manage_billing')
  async file(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    const out = await this.account.download(ctx, this.user(req), id);
    res.set({ 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="${out.name}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(out.file);
  }

  @Post('closure')
  @RequirePermissions('org:manage_billing')
  @RequireStepUp()
  requestClosure(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ClosureRequestDto) {
    ownSession(req);
    return this.account.requestClosure(ctx, this.user(req), dto);
  }

  // T2-G 45 (answer 2744): the scheduled export to the company's own storage (System Admins, security key).
  @Get('export-destination')
  @RequirePermissions('org:manage_billing')
  destination(@CurrentTenant() ctx: TenantContext) {
    return this.scheduled.view(ctx);
  }

  @Put('export-destination')
  @RequirePermissions('org:manage_billing')
  @RequireStepUp()
  setDestination(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ExportDestinationDto) {
    ownSession(req);
    return this.scheduled.set(ctx, this.user(req), dto);
  }

  @Delete('export-destination')
  @HttpCode(204)
  @RequirePermissions('org:manage_billing')
  @RequireStepUp()
  async removeDestination(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    ownSession(req);
    await this.scheduled.remove(ctx, this.user(req));
  }

  @Post('export-destination/send')
  @HttpCode(200)
  @RequirePermissions('org:manage_billing')
  @RequireStepUp()
  sendNow(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    ownSession(req);
    return this.scheduled.runNow(ctx, this.user(req));
  }

  @Post('closure/withdraw')
  @HttpCode(204)
  @RequirePermissions('org:manage_billing')
  async withdrawClosure(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    ownSession(req);
    await this.account.withdrawClosure(ctx, this.user(req));
  }
}
