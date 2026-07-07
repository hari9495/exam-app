import { ConflictException, Injectable } from '@nestjs/common';
import { Organization } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';

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
}
