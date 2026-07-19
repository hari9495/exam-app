import { Injectable } from '@nestjs/common';
import { TenantPrismaService, TenantContext } from '@exam-platform/shared';
import { ExamsService } from '../exams/exams.service';

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

export interface PublicInvitation {
  id: string;
  examId: string;
  candidateId: string;
  status: string;
  invitedAt: Date;
  expiresAt: Date;
}

export interface PublicResultRow {
  candidateId: string;
  candidateName: string;
  status: string;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passFail: string | null;
  submittedAt: Date | null;
}

export interface InvitationFilters {
  examId?: string;
  candidateId?: string;
  status?: string;
}

const CANDIDATE_SELECT = { id: true, name: true, email: true, createdAt: true } as const;
const EXAM_SELECT = { id: true, title: true, status: true, durationMinutes: true, passCriteriaPercent: true, createdAt: true } as const;

@Injectable()
export class PublicApiService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly examsService: ExamsService,
  ) {}

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

  async listInvitations(
    tenant: TenantContext,
    page: number,
    pageSize: number,
    filters: InvitationFilters,
  ): Promise<PaginatedResponse<PublicInvitation>> {
    const organizationId = tenant.organizationId as string;
    const where = {
      exam: { organizationId },
      ...(filters.examId !== undefined ? { examId: filters.examId } : {}),
      ...(filters.candidateId !== undefined ? { candidateId: filters.candidateId } : {}),
      ...(filters.status !== undefined ? { status: filters.status } : {}),
    };
    return this.tenantPrisma.forTenant(tenant, async (tx) => {
      const [data, total] = await Promise.all([
        tx.invitation.findMany({
          where,
          select: { id: true, examId: true, candidateId: true, status: true, invitedAt: true, expiresAt: true },
          orderBy: { invitedAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.invitation.count({ where }),
      ]);
      return { data, page, pageSize, total };
    });
  }

  // getResults() already enforces org-scoping (it 404s if the exam doesn't belong
  // to tenant.organizationId) and already settles any expired in-progress attempts
  // before returning -- reusing it here means the public results endpoint gets that
  // behavior for free and never needs its own duplicate query. Pagination is applied
  // in-memory afterward since getResults() returns the full list.
  async getExamResults(tenant: TenantContext, examId: string, page: number, pageSize: number): Promise<PaginatedResponse<PublicResultRow>> {
    const rows = await this.examsService.getResults(tenant, examId);
    const data: PublicResultRow[] = rows.map((row) => ({
      candidateId: row.candidateId,
      candidateName: row.candidateName,
      status: row.status,
      score: row.score,
      maxScore: row.maxScore,
      percentage: row.percentage,
      passFail: row.passFail,
      submittedAt: row.submittedAt,
    }));
    const start = (page - 1) * pageSize;
    return { data: data.slice(start, start + pageSize), page, pageSize, total: data.length };
  }
}
