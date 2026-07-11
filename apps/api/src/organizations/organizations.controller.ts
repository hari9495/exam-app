import { Body, Controller, Get, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateBrandingColorsDto } from './dto/update-branding-colors.dto';

@Controller('organizations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @RequirePermissions('platform:manage_organizations')
  create(@Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(dto);
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

  @Patch('branding')
  @RequirePermissions('org:manage_settings')
  updateBrandingColors(@CurrentTenant() tenant: TenantContext, @Body() dto: UpdateBrandingColorsDto) {
    return this.organizationsService.updateBrandingColors(tenant, dto);
  }

  @Post('branding/logo')
  @RequirePermissions('org:manage_settings')
  @UseInterceptors(FileInterceptor('file'))
  uploadLogo(@CurrentTenant() tenant: TenantContext, @UploadedFile() file: Express.Multer.File) {
    return this.organizationsService.uploadLogo(tenant, file);
  }
}
