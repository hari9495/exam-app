import { ConflictException, Injectable } from '@nestjs/common';
import { Candidate } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { TenantContext } from '../prisma/tenant-context';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { parseCandidateCsv } from './csv-parser';

interface CandidateFilters {
  limit?: number;
  cursor?: string;
}

export interface BulkUploadResult {
  created: number;
  updated: number;
  errors: { row: number; reason: string }[];
}

@Injectable()
export class CandidatesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(context: TenantContext, dto: CreateCandidateDto): Promise<Candidate> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.candidate.findFirst({
        where: { organizationId: context.organizationId as string, email: dto.email },
      });
      if (existing) {
        throw new ConflictException(`A candidate with email ${dto.email} already exists`);
      }
      return tx.candidate.create({
        data: {
          organizationId: context.organizationId as string,
          email: dto.email,
          name: dto.name,
          phone: dto.phone,
        },
      });
    });
  }

  async list(context: TenantContext, filters: CandidateFilters): Promise<Candidate[]> {
    const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 20;
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.candidate.findMany({
        where: { organizationId: context.organizationId as string },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      }),
    );
  }

  async bulkUpload(context: TenantContext, csvContent: string): Promise<BulkUploadResult> {
    const { rows, errors } = parseCandidateCsv(csvContent);

    return this.tenantPrisma.forTenant(context, async (tx) => {
      let created = 0;
      let updated = 0;

      for (const row of rows) {
        const existing = await tx.candidate.findFirst({
          where: { organizationId: context.organizationId as string, email: row.email },
        });
        if (existing) {
          await tx.candidate.update({
            where: { id: existing.id },
            data: { name: row.name, phone: row.phone },
          });
          updated += 1;
        } else {
          await tx.candidate.create({
            data: {
              organizationId: context.organizationId as string,
              email: row.email,
              name: row.name,
              phone: row.phone,
            },
          });
          created += 1;
        }
      }

      return { created, updated, errors };
    });
  }
}
