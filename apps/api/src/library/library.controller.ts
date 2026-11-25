import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { ownSession } from '../org-structure/org-structure.controller';
import type { ScopeUser } from '../access/scope';
import { LibraryService } from './library.service';
import { CompanyDocsService } from './company-docs.service';

export class FavouriteDto {
  @IsBoolean() on!: boolean;
}

export class FolderDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsIn(['everyone', 'managers']) audience!: 'everyone' | 'managers';
}

export class FolderQueryDto {
  @IsOptional() @IsUUID() folderId?: string;
}

// Multipart: every field arrives as text.
export class UploadDto {
  @IsUUID() folderId!: string;
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @IsOptional() @IsISO8601({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) expiresOn?: string;
  @IsOptional() @IsUUID() replaceId?: string;
}

const UPLOAD = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
const download = (res: Response, mime: string, name: string) =>
  res.set({ 'Content-Type': mime, 'Content-Disposition': `attachment; filename="${name.replace(/[^A-Za-z0-9._ -]/g, '_')}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });

// G4: the report library (ANL-06; each entry follows its area's own key) and company documents (item 21; the
// services decide who sees what: company.documents.manage company-wide, or everyone for "everyone" folders).
@Controller('library')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LibraryController {
  constructor(
    private readonly library: LibraryService,
    private readonly docs: CompanyDocsService,
  ) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get('reports')
  reports(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.library.reports(ctx, this.user(req));
  }

  @Post('reports/:id/favourite')
  @HttpCode(200)
  favourite(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: FavouriteDto) {
    ownSession(req);
    return this.library.favourite(ctx, this.user(req), String(id).slice(0, 60), dto.on);
  }

  @Get('documents')
  documents(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: FolderQueryDto) {
    return this.docs.list(ctx, this.user(req), q.folderId);
  }

  @Post('documents/folders')
  @RequirePermissions('company.documents.manage')
  addFolder(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: FolderDto) {
    ownSession(req);
    return this.docs.addFolder(ctx, this.user(req), dto);
  }

  @Post('documents/folders/:id/remove')
  @HttpCode(200)
  @RequirePermissions('company.documents.manage')
  removeFolder(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    return this.docs.removeFolder(ctx, this.user(req), id);
  }

  @Post('documents')
  @RequirePermissions('company.documents.manage')
  @UseInterceptors(UPLOAD)
  upload(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: UploadDto, @UploadedFile() file?: Express.Multer.File) {
    ownSession(req);
    return this.docs.upload(ctx, this.user(req), dto, file);
  }

  @Post('documents/:id/remove')
  @HttpCode(200)
  @RequirePermissions('company.documents.manage')
  remove(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    return this.docs.remove(ctx, this.user(req), id);
  }

  @Get('documents/:id/file')
  async file(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    const out = await this.docs.download(ctx, this.user(req), id);
    download(res, out.mime, out.name);
    return new StreamableFile(out.data);
  }
}
