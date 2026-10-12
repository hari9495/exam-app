import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { Request, Response } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import type { ScopeUser } from '../access/scope';
import { ApproveAmountDto, ClaimDto, DecideDto, FlagDto, LineDto, ListQueryDto, ReceiptQueryDto, SubmitDto } from './claims-dto';
import { ExpenseClaimsService } from './claims.service';

// Expenses batch E2 (M05-BUILD-DESIGN §18 "Claims"). Every route is open to the implicit grants: the service decides
// per claim (the claimant; the approver whose task it is; expense.claim.view in scope; expense.finance.review for the
// entity). The scope and finance lists need their keys.
const RECEIPT = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

@Controller('expenses')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExpenseClaimsController {
  constructor(private readonly claims: ExpenseClaimsService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get('me/home')
  home(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.claims.home(ctx, this.user(req));
  }

  @Get('claims')
  list(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: ListQueryDto) {
    return this.claims.list(ctx, this.user(req), q.view);
  }

  @Post('claims')
  create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ClaimDto) {
    return this.claims.create(ctx, this.user(req), dto);
  }

  @Get('claims/:id')
  get(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.claims.get(ctx, this.user(req), id);
  }

  @Put('claims/:id')
  rename(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ClaimDto) {
    return this.claims.rename(ctx, this.user(req), id, dto);
  }

  @Post('claims/:id/receipts')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(RECEIPT)
  receipt(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: ReceiptQueryDto, @UploadedFile() file?: Express.Multer.File) {
    return this.claims.addReceipt(ctx, this.user(req), id, file, q.lineId);
  }

  @Post('claims/:id/lines')
  addLine(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LineDto) {
    return this.claims.addLine(ctx, this.user(req), id, dto);
  }

  @Put('claims/:id/lines/:lineId')
  updateLine(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('lineId', ParseUUIDPipe) lineId: string, @Body() dto: LineDto) {
    return this.claims.updateLine(ctx, this.user(req), id, lineId, dto);
  }

  @Delete('claims/:id/lines/:lineId')
  removeLine(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('lineId', ParseUUIDPipe) lineId: string) {
    return this.claims.removeLine(ctx, this.user(req), id, lineId);
  }

  @Get('claims/:id/lines/:lineId/receipt')
  async receiptFile(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('lineId', ParseUUIDPipe) lineId: string) {
    const out = await this.claims.receipt(ctx, this.user(req), id, lineId);
    res.set({
      'Content-Type': out.contentType,
      'Content-Disposition': `inline; filename="${out.name.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; sandbox",
    });
    return new StreamableFile(out.file);
  }

  @Post('claims/:id/check')
  @HttpCode(200)
  check(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.claims.check(ctx, this.user(req), id);
  }

  @Post('claims/:id/submit')
  @HttpCode(200)
  submit(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitDto) {
    return this.claims.submit(ctx, this.user(req), id, dto.version);
  }

  @Post('claims/:id/withdraw')
  @HttpCode(200)
  withdraw(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.claims.withdraw(ctx, this.user(req), id);
  }

  @Patch('claims/:id/lines/:lineId/approve-amount')
  approveAmount(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('lineId', ParseUUIDPipe) lineId: string, @Body() dto: ApproveAmountDto) {
    return this.claims.approveAmount(ctx, this.user(req), id, lineId, dto);
  }

  @Post('claims/:id/decide')
  @HttpCode(200)
  decide(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideDto) {
    return this.claims.decide(ctx, this.user(req), id, dto.decision, dto.reason);
  }

  @Post('flags/:id')
  @HttpCode(200)
  @RequirePermissions('expense.finance.review')
  flag(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FlagDto) {
    return this.claims.decideFlag(ctx, this.user(req), id, dto.decision, dto.note);
  }
}
