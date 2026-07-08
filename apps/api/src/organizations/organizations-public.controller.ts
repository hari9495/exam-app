import { Controller, Get, Param } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
export class OrganizationsPublicController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('by-slug/:slug/branding')
  getPublicBranding(@Param('slug') slug: string) {
    return this.organizationsService.getPublicBrandingBySlug(slug);
  }
}
