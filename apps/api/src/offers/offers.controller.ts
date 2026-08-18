import { Body, Controller, Get, Param, Post, Put, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { OffersService } from './offers.service';
import { OfferTemplatesService } from './offer-templates.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpsertOfferTemplateDto } from './dto/upsert-offer-template.dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OffersController {
  constructor(
    private readonly offers: OffersService,
    private readonly offerTemplates: OfferTemplatesService,
  ) {}

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
  listForEntry(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.offers.listForEntry(tenant, id);
  }

  @Get('candidates/:id/offers')
  @RequirePermissions('pipeline:manage')
  listForCandidate(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.offers.listForCandidate(tenant, id);
  }

  @Get('offers/:id/pdf')
  @RequirePermissions('pipeline:manage')
  async previewPdf(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buffer = await this.offers.previewPdf(tenant, id);
    res.set({ 'Content-Type': 'application/pdf' });
    return new StreamableFile(buffer);
  }

  @Get('offer-template')
  @RequirePermissions('pipeline:manage')
  getTemplate(@CurrentTenant() tenant: TenantContext) {
    return this.offerTemplates.getWithDefault(tenant);
  }

  @Put('offer-template')
  @RequirePermissions('pipeline:manage')
  upsertTemplate(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Body() dto: UpsertOfferTemplateDto,
  ) {
    return this.offerTemplates.upsert(tenant, userId, dto);
  }
}
