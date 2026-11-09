import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
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
import { OfferTemplatesService } from './offer-templates.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { CreateOfferTemplateDto } from './dto/create-offer-template.dto';
import { UpdateOfferTemplateDto } from './dto/update-offer-template.dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OffersController {
  constructor(
    private readonly offers: OffersService,
    private readonly offerTemplates: OfferTemplatesService,
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

  @Post('offers/:id/send')
  @RequirePermissions('pipeline:manage')
  sendOffer(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string, @Req() req: Request) {
    assertOwnSession(req);
    return this.offers.sendOffer(tenant, userId, id);
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
    // An older request (from before HIR-09) is cancelled on the older engine.
    if (!(await this.builder.cancelApproval(tenant, userId, id))) return this.offers.cancelOfferApproval(tenant, userId, id);
  }

  @Get('offer-template/default')
  @RequirePermissions('pipeline:manage')
  getDefaultTemplate(@CurrentTenant() tenant: TenantContext) {
    return this.offerTemplates.getDefault(tenant);
  }

  @Get('offer-template')
  @RequirePermissions('pipeline:manage')
  listTemplates(@CurrentTenant() tenant: TenantContext) {
    return this.offerTemplates.list(tenant);
  }

  @Post('offer-template')
  @RequirePermissions('pipeline:manage')
  createTemplate(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Body() dto: CreateOfferTemplateDto,
  ) {
    return this.offerTemplates.create(tenant, userId, dto);
  }

  @Patch('offer-template/:id')
  @RequirePermissions('pipeline:manage')
  updateTemplate(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOfferTemplateDto,
  ) {
    return this.offerTemplates.update(tenant, userId, id, dto);
  }

  @Delete('offer-template/:id')
  @RequirePermissions('pipeline:manage')
  removeTemplate(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.offerTemplates.remove(tenant, userId, id);
  }
}
