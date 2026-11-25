import { Body, ConflictException, Controller, Delete, ForbiddenException, Get, GoneException, HttpCode, Param, ParseUUIDPipe, Patch, Post, Redirect, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ScopeUser } from '../access/scope';
import { assertOwnSession } from '../service-desk/desk-access';
import { OfferBuilderService } from './offer-builder.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { OffersService } from './offers.service';
import { CreateOfferDto } from './dto/create-offer.dto';

const TEMPLATES_MOVED = 'Offer templates moved to Settings › Letter templates. Add or change an offer letter there (letter type "offer").';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OffersController {
  constructor(
    private readonly offers: OffersService,
    private readonly builder: OfferBuilderService,
  ) {}

  /** HIR-09: offer pay only for holders of ats.offer.compensation.view; others get the offer without its pay text. */
  private async masked<T extends { compensation: string }>(req: Request, rows: T[]): Promise<(Omit<T, 'compensation'> & { compensation: string | null })[]> {
    if (await this.builder.canSeePay(req.user as ScopeUser)) return rows;
    return rows.map((r) => ({ ...r, compensation: null }));
  }

  @Post('pipeline/entries/:id/offers')
  @RequirePermissions('pipeline:manage')
  createOffer(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: CreateOfferDto,
  ) {
    return this.offers.createOffer(tenant, userId, id, dto);
  }

  @Get('pipeline/entries/:id/offers')
  @RequirePermissions('pipeline:manage')
  async listForEntry(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Req() req: Request) {
    return this.masked(req, await this.offers.listForEntry(tenant, id));
  }

  @Get('candidates/:id/offers')
  @RequirePermissions('pipeline:manage')
  async listForCandidate(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Req() req: Request) {
    return this.masked(req, await this.offers.listForCandidate(tenant, id));
  }

  @Get('offers/:id/pdf')
  @RequirePermissions('pipeline:manage')
  async previewPdf(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ): Promise<StreamableFile> {
    // The letter carries the pay.
    if (!(await this.builder.canSeePay(req.user as ScopeUser))) throw new ForbiddenException('The offer letter shows pay: it needs ats.offer.compensation.view.');
    const buffer = await this.offers.previewPdf(tenant, id);
    res.set({ 'Content-Type': 'application/pdf' });
    return new StreamableFile(buffer);
  }

  /** Answer 377: the sealed copy of an e-signed acceptance (the letter shows pay). */
  @Get('offers/:id/acceptance-copy')
  @RequirePermissions('pipeline:manage')
  async acceptanceCopy(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response, @Req() req: Request): Promise<StreamableFile> {
    if (!(await this.builder.canSeePay(req.user as ScopeUser))) throw new ForbiddenException('The offer letter shows pay: it needs ats.offer.compensation.view.');
    const f = await this.offers.sealedCopy(tenant, id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${f.name}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(f.file);
  }

  /** Answer 377: makes the sealed copy again when it could not be made at acceptance. */
  @Post('offers/:id/acceptance-copy')
  @HttpCode(200)
  @RequirePermissions('pipeline:manage')
  async remakeCopy(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    assertOwnSession(req);
    if (!(await this.builder.canSeePay(req.user as ScopeUser))) throw new ForbiddenException('The offer letter shows pay: it needs ats.offer.compensation.view.');
    return this.offers.sealCopy(tenant.organizationId as string, id);
  }

  @Post('offers/:id/send')
  @RequirePermissions('pipeline:manage')
  async sendOffer(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string, @Req() req: Request) {
    assertOwnSession(req);
    return this.offers.sendOffer(tenant, userId, id, { seesPay: await this.builder.canSeePay(req.user as ScopeUser) });
  }

  @Post('offers/:id/withdraw')
  @RequirePermissions('pipeline:manage')
  withdraw(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string, @Req() req: Request) {
    assertOwnSession(req);
    return this.offers.withdraw(tenant, userId, id);
  }

  @Post('offers/:id/submit')
  @RequirePermissions('pipeline:manage')
  submitOffer(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string, @Req() req: Request) {
    assertOwnSession(req);
    // HIR-09: offers go through the P03 engine (the company's offer chain plus the pay-range step); the sender never approves.
    return this.builder.submit(tenant, userId, id);
  }

  @Post('offers/:id/approval/cancel')
  @RequirePermissions('pipeline:manage')
  async cancelOfferApproval(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string, @Req() req: Request) {
    assertOwnSession(req);
    // P03 only: the older engine is retired and its waiting requests were moved (answer 2511).
    if (!(await this.builder.cancelApproval(tenant, userId, id))) throw new ConflictException('This offer is not waiting for approval.');
  }

  // Answer 2515: offer templates are Letters 'offer' templates now (Settings › Letter templates, 5.2).
  @Get(['offer-template', 'offer-template/default'])
  @RequirePermissions('pipeline:manage')
  @Redirect('/yx/settings/letters', 301)
  templatesMoved() {
    return undefined;
  }

  @Post('offer-template')
  @RequirePermissions('pipeline:manage')
  templateAddMoved() {
    throw new GoneException(TEMPLATES_MOVED);
  }

  @Patch('offer-template/:id')
  @RequirePermissions('pipeline:manage')
  templateChangeMoved() {
    throw new GoneException(TEMPLATES_MOVED);
  }

  @Delete('offer-template/:id')
  @RequirePermissions('pipeline:manage')
  templateRemoveMoved() {
    throw new GoneException(TEMPLATES_MOVED);
  }
}
