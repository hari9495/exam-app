import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import type { ScopeUser } from '../access/scope';
import { CertificateDto, DeclarationsDto, IssueCertificateDto, PanStatusDto, PerquisiteDto, ProofDecisionDto, ProofQueueDto, RegimeOverrideDto, WorkspaceListDto, WorkspacePatchDto } from './dto-5e';
import { TaxService } from './tax.service';

// Payroll batch 5e, income tax (M03-BUILD-DESIGN §14.5). Every route declares its key (YX-SEC-01) or is the signed-in
// person's own (no key: their workspace, declarations, proofs, tax sheet and certificates, checked against their employee
// records by the pay guard); the service checks the key's legal entities again and refuses one's own tax.
//   tax.workspace.view          employees' tax workspaces
//   tax.proof.verify            proof queue and decisions, PAN status, perquisites (Form 12BA)
//   tax.regime.override         the regime after the cut-off, with a reason
//   payroll.document.issue ⚡    the year-end certificate (Form 16 / Form 130)

const send = (res: Response, out: { file: Buffer; name: string; contentType: string }) => {
  res.set({
    'Content-Type': out.contentType,
    'Content-Disposition': `attachment; filename="${out.name.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  return new StreamableFile(out.file);
};

@Controller('tax')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TaxController {
  constructor(private readonly tax: TaxService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  // ------------------------------------------------------------------------------------------ the employee's own

  @Get('me/workspace')
  myWorkspace(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.tax.myWorkspace(ctx, this.user(req));
  }

  @Patch('me/workspace')
  patchWorkspace(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: WorkspacePatchDto) {
    return this.tax.patchWorkspace(ctx, this.user(req), dto);
  }

  @Post('me/regime-compare')
  @HttpCode(200)
  compare(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.tax.compare(ctx, this.user(req));
  }

  @Get('me/tax-sheet')
  taxSheet(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.tax.taxSheet(ctx, this.user(req));
  }

  @Get('me/declarations')
  declarations(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.tax.declarations(ctx, this.user(req));
  }

  @Post('me/declarations')
  @HttpCode(200)
  declare(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: DeclarationsDto) {
    return this.tax.declare(ctx, this.user(req), dto.lines);
  }

  @Post('me/proofs/:lineId')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  proof(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('lineId', ParseUUIDPipe) lineId: string, @UploadedFile() file?: { buffer: Buffer; originalname?: string }) {
    return this.tax.addProof(ctx, this.user(req), lineId, file);
  }

  @Get('me/certificates')
  myCertificates(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.tax.myCertificates(ctx, this.user(req));
  }

  @Get('me/certificates/:id/part-a')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  async myPartA(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return send(res, await this.tax.myPartA(ctx, this.user(req), id));
  }

  // ------------------------------------------------------------------------------------------ payroll

  @Get('workspaces')
  @RequirePermissions('tax.workspace.view')
  workspaces(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: WorkspaceListDto) {
    return this.tax.workspaces(ctx, this.user(req), q.employeeId);
  }

  @Post('workspaces/:id/regime')
  @HttpCode(200)
  @RequirePermissions('tax.regime.override')
  overrideRegime(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RegimeOverrideDto) {
    return this.tax.overrideRegime(ctx, this.user(req), id, dto.regime, dto.reason);
  }

  @Post('workspaces/:id/pan-status')
  @HttpCode(200)
  @RequirePermissions('tax.proof.verify')
  panStatus(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PanStatusDto) {
    return this.tax.panStatus(ctx, this.user(req), id, dto.status, dto.reason);
  }

  @Get('proofs')
  @RequirePermissions('tax.proof.verify')
  proofQueue(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: ProofQueueDto) {
    return this.tax.proofQueue(ctx, this.user(req), q.status);
  }

  @Get('proofs/:workspaceId/lines/:lineId/files/:n')
  @RequirePermissions('tax.proof.verify')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  async proofFile(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentTenant() ctx: TenantContext,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('lineId', ParseUUIDPipe) l: string,
    @Param('n', ParseIntPipe) n: number,
  ) {
    return send(res, await this.tax.proofFile(ctx, this.user(req), w, l, n));
  }

  @Post('proofs/:workspaceId/lines/:lineId/decision')
  @HttpCode(200)
  @RequirePermissions('tax.proof.verify')
  decide(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('lineId', ParseUUIDPipe) l: string, @Body() dto: ProofDecisionDto) {
    return this.tax.decide(ctx, this.user(req), w, l, dto);
  }

  @Get('perquisites')
  @RequirePermissions('tax.proof.verify')
  perquisites(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: WorkspaceListDto) {
    return this.tax.perquisites(ctx, this.user(req), q.employeeId);
  }

  @Post('perquisites')
  @RequirePermissions('tax.proof.verify')
  addPerquisite(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PerquisiteDto) {
    return this.tax.addPerquisite(ctx, this.user(req), dto);
  }

  @Post('perquisites/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('tax.proof.verify')
  cancelPerquisite(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.tax.cancelPerquisite(ctx, this.user(req), id);
  }

  @Post('certificates')
  @RequirePermissions('payroll.document.issue')
  prepare(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: CertificateDto) {
    return this.tax.prepareCertificate(ctx, this.user(req), dto.employeeId, dto.taxYear);
  }

  @Post('certificates/:id/part-a')
  @HttpCode(200)
  @RequirePermissions('payroll.document.issue')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  partA(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: { buffer: Buffer }) {
    return this.tax.attachPartA(ctx, this.user(req), id, file?.buffer);
  }

  @Post('certificates/:id/issue')
  @HttpCode(200)
  @RequirePermissions('payroll.document.issue')
  @RequireStepUp()
  issue(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: IssueCertificateDto) {
    return this.tax.issueCertificate(ctx, this.user(req), id, dto.confirmation);
  }
}
