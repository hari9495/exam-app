import { Body, Controller, Delete, Get, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateBrandingColorsDto } from './dto/update-branding-colors.dto';
import { UpdateSmtpSettingsDto } from './dto/update-smtp-settings.dto';
import { UpdateAiKeyDto } from './dto/update-ai-key.dto';
import { UpdateWebhookUrlDto } from './dto/update-webhook-url.dto';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';

@Controller('organizations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @RequirePermissions('platform:manage_organizations')
  create(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(tenant, userId, dto);
  }

  @Get()
  @RequirePermissions('platform:manage_organizations')
  list() {
    return this.organizationsService.list();
  }

  @Get('branding')
  @RequirePermissions('org:manage_settings')
  getBranding(@CurrentTenant() tenant: TenantContext) {
    return this.organizationsService.getBranding(tenant);
  }

  @Get('usage')
  @RequirePermissions('org:manage_settings')
  getUsage(@CurrentTenant() tenant: TenantContext) {
    return this.organizationsService.getUsage(tenant);
  }

  @Get('integrations')
  @RequirePermissions('org:manage_settings')
  getIntegrations(@CurrentTenant() tenant: TenantContext) {
    return this.organizationsService.getIntegrations(tenant);
  }

  @Patch('integrations/smtp')
  @RequirePermissions('org:manage_settings')
  updateSmtpSettings(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: UpdateSmtpSettingsDto) {
    return this.organizationsService.updateSmtpSettings(tenant, userId, dto);
  }

  @Patch('integrations/ai-key')
  @RequirePermissions('org:manage_settings')
  updateAiKey(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: UpdateAiKeyDto) {
    return this.organizationsService.updateAiKey(tenant, userId, dto);
  }

  @Post('integrations/api-key')
  @RequirePermissions('org:manage_settings')
  generateApiKey(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.organizationsService.generateApiKey(tenant, userId);
  }

  @Delete('integrations/api-key')
  @RequirePermissions('org:manage_settings')
  revokeApiKey(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.organizationsService.revokeApiKey(tenant, userId);
  }

  @Patch('integrations/webhook')
  @RequirePermissions('org:manage_settings')
  updateWebhookUrl(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: UpdateWebhookUrlDto) {
    return this.organizationsService.updateWebhookUrl(tenant, userId, dto);
  }

  @Post('integrations/webhook-secret')
  @RequirePermissions('org:manage_settings')
  generateWebhookSecret(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.organizationsService.generateWebhookSecret(tenant, userId);
  }

  @Get('integrations/webhook-deliveries')
  @RequirePermissions('org:manage_settings')
  listWebhookDeliveries(@CurrentTenant() tenant: TenantContext) {
    return this.organizationsService.listWebhookDeliveries(tenant);
  }

  @Patch('branding')
  @RequirePermissions('org:manage_settings')
  updateBrandingColors(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: UpdateBrandingColorsDto) {
    return this.organizationsService.updateBrandingColors(tenant, userId, dto);
  }

  @Post('branding/logo')
  @RequirePermissions('org:manage_settings')
  @UseInterceptors(FileInterceptor('file'))
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  uploadLogo(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @UploadedFile() file: Express.Multer.File) {
    return this.organizationsService.uploadLogo(tenant, userId, file);
  }
}
