import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Organization } from '@prisma/client';
import { dirname, join } from 'path';
import * as fs from 'fs/promises';
import { PrismaService } from '@exam-platform/shared';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateBrandingColorsDto } from './dto/update-branding-colors.dto';
import { UPLOADS_ROOT } from './uploads-path';

export interface BrandingResponse {
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
}

export interface AiCreditUsageResponse {
  aiCreditLimit: number;
  totalUsed: number;
  breakdown: { questionGeneration: number; insightGeneration: number };
}

const ALLOWED_LOGO_MIME_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/svg+xml': '.svg',
};
const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

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

  async uploadLogo(context: TenantContext, file: Express.Multer.File): Promise<BrandingResponse> {
    const organizationId = this.requireOrganizationId(context);

    const extension = ALLOWED_LOGO_MIME_TYPES[file.mimetype];
    if (!extension) {
      throw new BadRequestException('Logo must be a PNG, JPEG, or SVG image');
    }
    if (file.size > MAX_LOGO_SIZE_BYTES) {
      throw new BadRequestException('Logo file must be 2MB or smaller');
    }

    const logoPath = `logos/${organizationId}${extension}`;
    const fullPath = join(UPLOADS_ROOT, logoPath);
    await fs.mkdir(dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, file.buffer);

    const org = await this.prisma.organization.update({ where: { id: organizationId }, data: { logoPath } });
    return this.toBrandingResponse(org);
  }

  async getPublicBrandingBySlug(slug: string): Promise<BrandingResponse> {
    const org = await this.prisma.organization.findUnique({ where: { slug } });
    if (!org) {
      throw new NotFoundException(`Organization "${slug}" not found`);
    }
    return this.toBrandingResponse(org);
  }

  async getUsage(context: TenantContext): Promise<AiCreditUsageResponse> {
    const organizationId = this.requireOrganizationId(context);

    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, include: { plan: true } });

    const grouped = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.aiCreditUsage.groupBy({ by: ['source'], where: { organizationId }, _sum: { credits: true } }),
    );

    const breakdown = { questionGeneration: 0, insightGeneration: 0 };
    for (const row of grouped) {
      const credits = row._sum.credits ?? 0;
      if (row.source === 'question_generation') {
        breakdown.questionGeneration = credits;
      } else if (row.source === 'insight_generation') {
        breakdown.insightGeneration = credits;
      }
    }

    return {
      aiCreditLimit: org!.plan.aiCreditLimit,
      totalUsed: breakdown.questionGeneration + breakdown.insightGeneration,
      breakdown,
    };
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
