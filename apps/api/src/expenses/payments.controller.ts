import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { CancelBatchDto, ClaimIdsDto, JournalQueryDto, PayoutDto, PayoutResultsDto, ReleaseDto } from './payments-dto';
import { ExpensePaymentsService } from './payments.service';
import { EntityFilterDto } from '../common/entity-filter.dto';

// Expenses batch E3 (M05-BUILD-DESIGN §10, §12, §18 "Payment"). Every route needs expense.payout.manage; the service
// limits it to the legal entities it is granted for and never to one's own claim. ⚡ = a fresh second sign-in step.
//   GET  to-pay                          approved claims to pay, in payroll, queued, failed, and recently paid; the batches
//   POST to-pay/payroll                  move unpaid claims to the next payroll
//   POST payouts                         a bank file for claims of one legal entity
//   GET  payouts/:id/file                the bank file (download recorded with its hash)
//   POST payouts/:id/release ⚡           released by someone else, with the typed phrase
//   POST payouts/:id/cancel              a file not released yet; its claims wait again
//   POST payouts/:id/results             the bank's results
//   GET  journal, POST journal/export, POST journal/:id/posted   the month's expense journal
@Controller('expenses')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExpensePaymentsController {
  constructor(private readonly payments: ExpensePaymentsService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get('to-pay')
  @RequirePermissions('expense.payout.manage')
  toPay(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityFilterDto) {
    return this.payments.toPay(ctx, this.user(req), q.legalEntityId);
  }

  @Post('to-pay/payroll')
  @HttpCode(200)
  @RequirePermissions('expense.payout.manage')
  toPayroll(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ClaimIdsDto) {
    return this.payments.routeToPayroll(ctx, this.user(req), dto.claimIds);
  }

  @Post('payouts')
  @RequirePermissions('expense.payout.manage')
  createBatch(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PayoutDto) {
    return this.payments.createBatch(ctx, this.user(req), dto);
  }

  @Get('payouts/:id/file')
  @RequirePermissions('expense.payout.manage')
  async batchFile(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    const out = await this.payments.batchFile(ctx, this.user(req), id);
    res.set({ 'Content-Type': out.contentType, 'Content-Disposition': `attachment; filename="${out.name.replace(/[^A-Za-z0-9._-]/g, '_')}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(out.file);
  }

  @Post('payouts/:id/release')
  @HttpCode(200)
  @RequirePermissions('expense.payout.manage')
  @RequireStepUp()
  release(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReleaseDto) {
    return this.payments.releaseBatch(ctx, this.user(req), id, dto);
  }

  @Post('payouts/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('expense.payout.manage')
  cancel(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelBatchDto) {
    return this.payments.cancelBatch(ctx, this.user(req), id, dto.reason);
  }

  @Post('payouts/:id/results')
  @HttpCode(200)
  @RequirePermissions('expense.payout.manage')
  results(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PayoutResultsDto) {
    return this.payments.results(ctx, this.user(req), id, dto.rows);
  }

  @Get('journal')
  @RequirePermissions('expense.payout.manage')
  journal(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: JournalQueryDto) {
    return this.payments.journal(ctx, this.user(req), q.entityId, q.month);
  }

  @Post('journal/export')
  @HttpCode(200)
  @RequirePermissions('expense.payout.manage')
  exportJournal(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: JournalQueryDto) {
    return this.payments.exportJournal(ctx, this.user(req), dto.entityId, dto.month);
  }

  @Post('journal/:id/posted')
  @HttpCode(200)
  @RequirePermissions('expense.payout.manage')
  posted(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.markPosted(ctx, this.user(req), id);
  }
}
