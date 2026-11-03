import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE, STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';
import { assertOwnSession } from '../service-desk/desk-access';
import { AcknowledgeDto, DraftDto, NewPolicyDto, PendingQueryDto, PolicyChangeDto, RemindDto, SendBackDto, SubmitDto } from './dto';
import { PoliciesService } from './policies.service';

// HLP-10 / HLP-11 company policies (rules: docs/yukthix/helpdesk-design-map.md section 4d). Keys (P02 YX-SEC-01):
//   policy.manage     policies, versions, audience, completion, pending people, reminders, evidence (company-wide)
//   policy.publish    publish or send back a waiting version (never one's own while the company asks for a second person)
//   no key (self)     the signed-in person's own policies: read the current version and acknowledge it; refused while
//                     acting for someone else (the record is the person's own act)
const UPLOAD = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
const out = (res: Response, f: { file: Buffer | string; name: string; contentType: string }) => {
  res.set({ 'Content-Type': f.contentType, 'Content-Disposition': `attachment; filename="${f.name.replace(/[^A-Za-z0-9._-]/g, '_')}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
  return new StreamableFile(typeof f.file === 'string' ? Buffer.from(f.file, 'utf8') : f.file);
};

@Controller('desk/policies')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PoliciesAdminController {
  constructor(private readonly policies: PoliciesService) {}

  @Get()
  @RequireAnyPermission('policy.manage', 'policy.publish')
  list(@CurrentTenant() ctx: TenantContext) {
    return this.policies.list(ctx);
  }

  @Get('options')
  @RequirePermissions('policy.manage')
  options(@CurrentTenant() ctx: TenantContext) {
    return this.policies.options(ctx);
  }

  @Post()
  @RequirePermissions('policy.manage')
  create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: NewPolicyDto) {
    assertOwnSession(req);
    return this.policies.create(ctx, dto);
  }

  @Get(':id')
  @RequireAnyPermission('policy.manage', 'policy.publish')
  detail(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.policies.detail(ctx, id);
  }

  @Get(':id/pending')
  @RequireAnyPermission('policy.manage', 'policy.publish')
  pending(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: PendingQueryDto) {
    return this.policies.pending(ctx, id, q.departmentId);
  }

  @Patch(':id')
  @RequirePermissions('policy.manage')
  update(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PolicyChangeDto) {
    assertOwnSession(req);
    return this.policies.update(ctx, id, dto);
  }

  @Put(':id/draft')
  @RequirePermissions('policy.manage')
  draft(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DraftDto) {
    assertOwnSession(req);
    return this.policies.saveDraft(ctx, id, dto);
  }

  @Post(':id/draft/files')
  @RequirePermissions('policy.manage')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(UPLOAD)
  addFile(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File | undefined) {
    assertOwnSession(req);
    return this.policies.addFile(ctx, id, file ? { name: file.originalname, data: file.buffer } : null);
  }

  @Post(':id/draft/files/:fileId/remove')
  @RequirePermissions('policy.manage')
  removeFile(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('fileId', ParseUUIDPipe) fileId: string) {
    assertOwnSession(req);
    return this.policies.removeFile(ctx, id, fileId);
  }

  @Post(':id/submit')
  @RequirePermissions('policy.manage')
  submit(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitDto) {
    assertOwnSession(req);
    return this.policies.submit(ctx, id, dto);
  }

  @Post(':id/publish')
  @RequirePermissions('policy.publish')
  publish(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitDto) {
    assertOwnSession(req);
    return this.policies.publish(ctx, id, dto);
  }

  @Post(':id/send-back')
  @RequirePermissions('policy.publish')
  sendBack(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendBackDto) {
    assertOwnSession(req);
    return this.policies.sendBack(ctx, id, dto);
  }

  @Post(':id/remind')
  @RequirePermissions('policy.manage')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  remind(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RemindDto) {
    assertOwnSession(req);
    return this.policies.remind(ctx, id, dto);
  }

  @Get(':id/evidence')
  @RequirePermissions('policy.manage')
  async evidence(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const f = await this.policies.evidence(ctx, id);
    return out(res, { file: f.csv, name: f.name, contentType: 'text/csv; charset=utf-8' });
  }

  @Get(':id/files/:fileId')
  @RequireAnyPermission('policy.manage', 'policy.publish')
  async file(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('fileId', ParseUUIDPipe) fileId: string, @Res({ passthrough: true }) res: Response) {
    return out(res, await this.policies.file(ctx, id, fileId));
  }
}

@Controller('desk/my/policies')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MyPoliciesController {
  constructor(private readonly policies: PoliciesService) {}

  @Get()
  mine(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    assertOwnSession(req);
    return this.policies.myList(ctx);
  }

  @Get(':id')
  one(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.policies.myPolicy(ctx, id);
  }

  @Get(':id/files/:fileId')
  async myFile(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('fileId', ParseUUIDPipe) fileId: string, @Res({ passthrough: true }) res: Response) {
    assertOwnSession(req);
    return out(res, await this.policies.myFile(ctx, id, fileId));
  }

  @Post(':id/versions/:versionId/code')
  @Throttle(STRICT_AUTH_THROTTLE)
  code(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('versionId', ParseUUIDPipe) versionId: string) {
    assertOwnSession(req);
    return this.policies.myCode(ctx, id, versionId, req.ip ?? null);
  }

  @Post(':id/acknowledge')
  @Throttle(STRICT_AUTH_THROTTLE)
  acknowledge(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AcknowledgeDto) {
    assertOwnSession(req);
    return this.policies.acknowledge(ctx, id, dto, { ip: req.ip ?? null, device: String(req.headers['user-agent'] ?? '').slice(0, 300) || null });
  }
}
