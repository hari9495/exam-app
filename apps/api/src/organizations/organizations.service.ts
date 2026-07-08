import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Organization } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateBrandingColorsDto } from './dto/update-branding-colors.dto';

export interface BrandingResponse {
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrganizationDto): Promise<Organization> {
    const existing = await this.prisma.organization.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException(`Organization slug "${dto.slug}" is already taken`);
    }
    return this.prisma.organization.create({
      data: { name: dto.name, slug: dto.slug, region: dto.region, planId: dto.planId },
    });
  }

  async getBranding(context: TenantContext): Promise<BrandingResponse> {
    const organizationId = this.requireOrganizationId(context);
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    return this.toBrandingResponse(org!);
  }

  async updateBrandingColors(context: TenantContext, dto: UpdateBrandingColorsDto): Promise<BrandingResponse> {
    const organizationId = this.requireOrganizationId(context);
    const org = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { ...(dto.primaryColor !== undefined && { primaryColor: dto.primaryColor }), ...(dto.accentColor !== undefined && { accentColor: dto.accentColor }) },
    });
    return this.toBrandingResponse(org);
  }

  private requireOrganizationId(context: TenantContext): string {
    if (!context.organizationId) {
      throw new BadRequestException('No organization context for this account');
    }
    return context.organizationId;
  }

  private toBrandingResponse(org: Pick<Organization, 'logoPath' | 'primaryColor' | 'accentColor'>): BrandingResponse {
    return {
      logoUrl: org.logoPath ? `${process.env.API_ORIGIN}/uploads/${org.logoPath}` : null,
      primaryColor: org.primaryColor,
      accentColor: org.accentColor,
    };
  }
}
