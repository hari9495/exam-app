import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import type { ScopeUser } from '../access/scope';
import { CardCloseDto, CardExplainDto, CardImportDto, CardLinkDto, CardMatchDto, CardPeopleDto, CardPreviewDto, CardVersionDto } from './cards-dto';
import { CARD_MAX_MB, ExpenseCardsService } from './cards.service';

// EXP-08 card statements (founder answer 3 Nov 2026, option A). Finance routes need expense.payout.manage (the service
// asks for it company-wide); the employee's own card lines are open to the implicit grant (the service checks the line
// is theirs).
//   GET  card-statements                         statements, saved bank mappings, the match rules
//   POST card-statements/preview                 the file's columns and a few rows (nothing saved)
//   POST card-statements                         import: every row checked; same file or period refused
//   GET  card-statements/:id                     lines with suggestions (the view is audited)
//   POST card-statements/:id/lines/:lineId/match | chase      confirm or change a match; ask the employee
//   POST card-statements/:id/close               every line not matched goes to its holder
//   POST cards, GET cards/people                 link a card (last 4 digits) to an employee
//   GET  card-lines/mine, POST card-lines/:id/explain          the employee's lines to explain
const STATEMENT = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: CARD_MAX_MB * 1024 * 1024, files: 1, fields: 10, fieldSize: 16_384 } });

@Controller('expenses')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExpenseCardsController {
  constructor(private readonly cards: ExpenseCardsService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get('card-statements')
  @RequirePermissions('expense.payout.manage')
  list(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.cards.list(ctx, this.user(req));
  }

  @Post('card-statements/preview')
  @HttpCode(200)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @RequirePermissions('expense.payout.manage')
  @UseInterceptors(STATEMENT)
  preview(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: CardPreviewDto, @UploadedFile() file?: Express.Multer.File) {
    return this.cards.preview(ctx, this.user(req), file, dto.bankName);
  }

  @Post('card-statements')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @RequirePermissions('expense.payout.manage')
  @UseInterceptors(STATEMENT)
  importStatement(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: CardImportDto, @UploadedFile() file?: Express.Multer.File) {
    return this.cards.importStatement(ctx, this.user(req), file, dto);
  }

  @Get('card-statements/:id')
  @RequirePermissions('expense.payout.manage')
  get(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.cards.get(ctx, this.user(req), id);
  }

  @Post('card-statements/:id/lines/:lineId/match')
  @HttpCode(200)
  @RequirePermissions('expense.payout.manage')
  match(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('lineId', ParseUUIDPipe) lineId: string, @Body() dto: CardMatchDto) {
    return this.cards.match(ctx, this.user(req), id, lineId, dto.claimLineId, dto.version);
  }

  @Post('card-statements/:id/lines/:lineId/chase')
  @HttpCode(200)
  @RequirePermissions('expense.payout.manage')
  chase(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('lineId', ParseUUIDPipe) lineId: string, @Body() dto: CardVersionDto) {
    return this.cards.chase(ctx, this.user(req), id, lineId, dto.version);
  }

  @Post('card-statements/:id/close')
  @HttpCode(200)
  @RequirePermissions('expense.payout.manage')
  close(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CardCloseDto) {
    return this.cards.close(ctx, this.user(req), id, dto.version, dto.note);
  }

  @Post('cards')
  @RequirePermissions('expense.payout.manage')
  link(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: CardLinkDto) {
    return this.cards.linkCard(ctx, this.user(req), dto);
  }

  @Get('cards/people')
  @RequirePermissions('expense.payout.manage')
  people(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: CardPeopleDto) {
    return this.cards.people(ctx, this.user(req), q.q);
  }

  // Implicit: an employee's own card lines (the service refuses anyone else's as "not found").
  @Get('card-lines/mine')
  mine(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.cards.mine(ctx, this.user(req));
  }

  @Post('card-lines/:id/explain')
  @HttpCode(200)
  explain(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CardExplainDto) {
    return this.cards.explain(ctx, this.user(req), id, dto.choice, dto.version);
  }
}
