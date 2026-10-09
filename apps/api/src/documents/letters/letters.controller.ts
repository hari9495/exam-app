import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentTenant } from '../../auth/current-tenant.decorator';
import { RequireStepUp } from '../../auth/step-up.decorator';
import { PermissionsGuard } from '../../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE, STRICT_AUTH_THROTTLE } from '../../rate-limit-tiers';
import type { ScopeUser } from '../../access/scope';
import { IssueLetterDto, LetterFileQueryDto, LetterPreviewDto, SignLetterDto, SignatoryDto, StarterLetterDto, TemplateUploadDto } from './dto';
import { LettersService } from './letters.service';

// Letters (lifecycle 6b, LIFE-2.04 … 2.07; P05 §4.3 / §4.4). Keys (P02 YX-SEC-01), checked again per person and class:
//   letter.template.manage      Word templates: upload, starters, sample preview, switch on / off, download
//   letter.issue                preview and issue letters to people in scope; the register; the company's DSC upload
//   letter.signatory.manage ⚡  who signs for each legal entity, with the signature image
//   no key (self)               my letters, my acceptance; the file route decides per letter (self, or HR in scope)
const PDF_UPLOAD = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } });
const out = (res: Response, f: { file: Buffer; name: string; contentType: string }) => {
  res.set({ 'Content-Type': f.contentType, 'Content-Disposition': `attachment; filename="${f.name.replace(/[^A-Za-z0-9._-]/g, '_')}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
  return new StreamableFile(f.file);
};
const meta = (req: Request) => ({ ip: req.ip ?? null, device: String(req.headers['user-agent'] ?? '').slice(0, 200) || null, assurance: 'Signed in to YukthiX, then a one-time code' });

@Controller('letters')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LettersController {
  constructor(private readonly letters: LettersService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get('templates')
  @RequireAnyPermission('letter.template.manage', 'letter.issue')
  templates(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.letters.templates(ctx, this.user(req));
  }

  @Post('templates')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @RequirePermissions('letter.template.manage')
  @UseInterceptors(PDF_UPLOAD)
  upload(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: TemplateUploadDto, @UploadedFile() file: Express.Multer.File) {
    return this.letters.uploadTemplate(ctx, this.user(req), dto, file);
  }

  @Post('templates/starter')
  @RequirePermissions('letter.template.manage')
  starter(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: StarterLetterDto) {
    return this.letters.useStarter(ctx, this.user(req), dto.letterType);
  }

  @Get('templates/:id/preview')
  @RequirePermissions('letter.template.manage')
  async templatePreview(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return out(res, await this.letters.templatePreview(ctx, this.user(req), id));
  }

  @Get('templates/:id/docx')
  @RequirePermissions('letter.template.manage')
  async templateDocx(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return out(res, await this.letters.templateDocx(ctx, this.user(req), id));
  }

  @Post('templates/:id/activate')
  @HttpCode(200)
  @RequirePermissions('letter.template.manage')
  activate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.letters.setTemplateStatus(ctx, this.user(req), id, 'active');
  }

  @Post('templates/:id/retire')
  @HttpCode(200)
  @RequirePermissions('letter.template.manage')
  retire(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.letters.setTemplateStatus(ctx, this.user(req), id, 'retired');
  }

  @Get('signatories')
  @RequireAnyPermission('letter.signatory.manage', 'letter.issue')
  signatories(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.letters.signatories(ctx, this.user(req));
  }

  @Get('signatories/people')
  @RequirePermissions('letter.signatory.manage')
  signatoryPeople(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.letters.signatoryCandidates(ctx, this.user(req));
  }

  @Post('signatories')
  @RequireStepUp()
  @RequirePermissions('letter.signatory.manage')
  @UseInterceptors(PDF_UPLOAD)
  addSignatory(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: SignatoryDto, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.letters.addSignatory(ctx, this.user(req), dto, file);
  }

  @Post('signatories/:id/remove')
  @HttpCode(200)
  @RequireStepUp()
  @RequirePermissions('letter.signatory.manage')
  removeSignatory(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.letters.removeSignatory(ctx, this.user(req), id);
  }

  @Post('preview')
  @HttpCode(200)
  @RequirePermissions('letter.issue')
  async preview(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Body() dto: LetterPreviewDto) {
    return out(res, await this.letters.previewLetter(ctx, this.user(req), dto));
  }

  @Post('issue')
  @RequirePermissions('letter.issue')
  issue(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: IssueLetterDto) {
    return this.letters.issue(ctx, this.user(req), dto);
  }

  @Get('issued')
  @RequirePermissions('letter.issue')
  register(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('personId') personId?: string) {
    return this.letters.register(ctx, this.user(req), personId && /^[0-9a-f-]{36}$/i.test(personId) ? personId : undefined);
  }

  @Post(':id/signature')
  @HttpCode(200)
  @RequirePermissions('letter.issue')
  @UseInterceptors(PDF_UPLOAD)
  attachSignature(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.letters.attachSignature(ctx, this.user(req), id, file?.buffer);
  }

  @Get('me')
  mine(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.letters.mine(ctx, this.user(req));
  }

  @Get(':id/file')
  async file(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: LetterFileQueryDto) {
    return out(res, await this.letters.file(ctx, this.user(req), id, q.which ?? 'letter'));
  }

  @Post(':id/sign/code')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  signCode(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.letters.signCode(ctx, this.user(req), id, req.ip ?? null);
  }

  @Post(':id/sign')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  sign(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SignLetterDto) {
    return this.letters.sign(ctx, this.user(req), id, dto, meta(req));
  }
}
