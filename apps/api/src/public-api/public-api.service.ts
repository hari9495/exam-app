import { Injectable } from '@nestjs/common';
import { TenantPrismaService, TenantContext } from '@exam-platform/shared';

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PublicCandidate {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export interface PublicExam {
  id: string;
  title: string;
  status: string;
  durationMinutes: number;
  passCriteriaPercent: number;
  createdAt: Date;
}

const CANDIDATE_SELECT = { id: true, name: true, email: true, createdAt: true } as const;
const EXAM_SELECT = { id: true, title: true, status: true, durationMinutes: true, passCriteriaPercent: true, createdAt: true } as const;

@Injectable()
export class PublicApiService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async listCandidates(tenant: TenantContext, page: number, pageSize: number): Promise<PaginatedResponse<PublicCandidate>> {
    const organizationId = tenant.organizationId as string;
    return this.tenantPrisma.forTenant(tenant, async (tx) => {
      const [data, total] = await Promise.all([
        tx.candidate.findMany({ where: { organizationId }, select: CANDIDATE_SELECT, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
        tx.candidate.count({ where: { organizationId } }),
      ]);
      return { data, page, pageSize, total };
    });
  }

  async getCandidate(tenant: TenantContext, id: string): Promise<PublicCandidate | null> {
    const organizationId = tenant.organizationId as string;
    return this.tenantPrisma.forTenant(tenant, (tx) =>
      tx.candidate.findFirst({ where: { id, organizationId }, select: CANDIDATE_SELECT }),
    );
  }

  async listExams(tenant: TenantContext, page: number, pageSize: number): Promise<PaginatedResponse<PublicExam>> {
    const organizationId = tenant.organizationId as string;
    return this.tenantPrisma.forTenant(tenant, async (tx) => {
      const [data, total] = await Promise.all([
        tx.exam.findMany({ where: { organizationId }, select: EXAM_SELECT, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
        tx.exam.count({ where: { organizationId } }),
      ]);
      return { data, page, pageSize, total };
    });
  }

  async getExam(tenant: TenantContext, id: string): Promise<PublicExam | null> {
    const organizationId = tenant.organizationId as string;
    return this.tenantPrisma.forTenant(tenant, (tx) =>
      tx.exam.findFirst({ where: { id, organizationId }, select: EXAM_SELECT }),
    );
  }
}
