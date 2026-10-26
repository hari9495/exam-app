import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE, PUBLIC_API_THROTTLE } from '../rate-limit-tiers';
import type { ScopeUser } from '../access/scope';
import { DocumentDecisionDto, DocumentFileQueryDto, DocumentRequestDto, DocumentShareDto, DocumentUploadDto } from './dto';
import { DocumentsService } from './documents.service';
import { DocumentSharesService } from './shares.service';

// Person documents (lifecycle 6a, LIFE-1.03; P05 §4.2). Keys (P02 YX-SEC-01), checked again per person and data class:
//   document.view        a person's documents in scope (Personal / Confidential / Special also need their class key)
//   document.manage      ask for, upload for, verify or reject documents in scope (never one's own)
//   no key (self)        my documents and my uploads; the file route decides per document (self, or HR in scope)
//   no key (self)        PPL-30 share links to my own issued letters and pay documents (the service checks it is mine)
const UPLOAD = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } });

@Controller('documents')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly shares: DocumentSharesService,
  ) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get('types')
  types(@CurrentTenant() ctx: TenantContext) {
    return this.documents.typeList(ctx);
  }

  @Get('me')
  mine(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.documents.mine(ctx, this.user(req));
  }

  @Get('shares')
  myShares(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.shares.mine(ctx, this.user(req));
  }

  @Post('shares')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  share(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: DocumentShareDto) {
    return this.shares.create(ctx, this.user(req), dto);
  }

  @Post('shares/:id/revoke')
  @HttpCode(200)
  revokeShare(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.shares.revoke(ctx, this.user(req), id);
  }

  /** PPL-03: a manager's read-only view of a team member's documents below Confidential (decided by the service). */
  @Get('team/:personId')
  forTeam(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('personId', ParseUUIDPipe) personId: string) {
    return this.documents.forTeam(ctx, this.user(req), personId);
  }

  @Get('people/:personId')
  @RequireAnyPermission('document.view', 'document.manage')
  forPerson(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('personId', ParseUUIDPipe) personId: string) {
    return this.documents.forPerson(ctx, this.user(req), personId);
  }

  @Post('people/:personId/:typeKey')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(UPLOAD)
  upload(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('personId', ParseUUIDPipe) personId: string, @Param('typeKey') typeKey: string, @Body() dto: DocumentUploadDto, @UploadedFile() file: Express.Multer.File) {
    return this.documents.upload(ctx, this.user(req), personId, typeKey.slice(0, 40), file, dto.expiresOn);
  }

  @Post('requests')
  @HttpCode(200)
  @RequirePermissions('document.manage')
  request(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: DocumentRequestDto) {
    return this.documents.request(ctx, this.user(req), dto);
  }

  @Get('queue')
  @RequirePermissions('document.manage')
  queue(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.documents.queue(ctx, this.user(req));
  }

  @Post(':id/decision')
  @HttpCode(200)
  @RequirePermissions('document.manage')
  decide(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DocumentDecisionDto) {
    return this.documents.verify(ctx, this.user(req), id, dto);
  }

  @Get(':id/file')
  async file(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: DocumentFileQueryDto) {
    const out = await this.documents.file(ctx, this.user(req), id, q.version);
    res.set({
      'Content-Type': out.contentType,
      'Content-Disposition': `attachment; filename="${out.name.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    return new StreamableFile(out.file);
  }
}

/** PPL-30: a shared link, opened by anyone who has it (no sign-in). One document, read-only, while the link works. */
@Controller('public/shares')
export class PublicSharesController {
  constructor(private readonly shares: DocumentSharesService) {}

  @Get(':org/:token')
  @Throttle(PUBLIC_API_THROTTLE)
  async open(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Param('org') org: string, @Param('token') token: string) {
    const out = await this.shares.open(org, token.slice(0, 100), req.ip ?? null);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${out.name}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    return new StreamableFile(out.file);
  }
}
