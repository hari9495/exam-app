import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Candidate } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { TenantContext } from '@exam-platform/shared';
import { AuditService } from '@exam-platform/shared';
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

export interface CandidateDataExport {
  candidate: { id: string; email: string; name: string; phone: string | null; createdAt: Date };
  invitations: {
    id: string; examTitle: string; status: string; invitedAt: Date; expiresAt: Date; revokedAt: Date | null;
  }[];
  attempts: {
    id: string; examTitle: string; status: string; startedAt: Date; submittedAt: Date | null; deviceFingerprint: string | null;
    result: { score: number; maxScore: number; percentage: number; passFail: string | null } | null;
    answers: { questionText: string; selectedOptions: string[]; isCorrect: boolean | null; marksAwarded: number | null }[];
    proctoringEvents: { eventType: string; severity: string; occurredAt: Date; metadata: Record<string, unknown> | null }[];
    proctoringAnalysis: { status: string; riskLevel: string | null; summary: string | null } | null;
    insight: { status: string; summary: string | null } | null;
    messages: { body: string; sentAt: Date; readAt: Date | null }[];
  }[];
}

@Injectable()
export class CandidatesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

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

  async lookupByEmail(context: TenantContext, email: string): Promise<Candidate> {
    const candidate = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.candidate.findFirst({
        where: { organizationId: context.organizationId as string, email },
      }),
    );
    if (!candidate) {
      throw new NotFoundException(`No candidate found with email ${email}`);
    }
    return candidate;
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

  async exportData(context: TenantContext, actorUserId: string, candidateId: string): Promise<CandidateDataExport> {
    const exportPayload = await this.tenantPrisma.forTenant(context, async (tx) => {
      const candidate = await tx.candidate.findFirst({
        where: { id: candidateId, organizationId: context.organizationId as string },
      });
      if (!candidate) {
        throw new NotFoundException(`Candidate ${candidateId} not found`);
      }

      const invitations = await tx.invitation.findMany({
        where: { candidateId },
        orderBy: { invitedAt: 'desc' },
        include: {
          exam: { select: { title: true } },
          attempt: {
            include: {
              result: true,
              answers: { include: { question: { select: { text: true, options: { select: { id: true, text: true } } } } } },
              proctoringEvents: { orderBy: { occurredAt: 'asc' } },
              proctoringAnalysis: true,
              insight: true,
              messages: { orderBy: { sentAt: 'asc' } },
            },
          },
        },
      });

      return {
        candidate: {
          id: candidate.id, email: candidate.email, name: candidate.name, phone: candidate.phone, createdAt: candidate.createdAt,
        },
        invitations: invitations.map((invitation) => ({
          id: invitation.id, examTitle: invitation.exam.title, status: invitation.status,
          invitedAt: invitation.invitedAt, expiresAt: invitation.expiresAt, revokedAt: invitation.revokedAt,
        })),
        attempts: invitations
          .filter((invitation) => invitation.attempt !== null)
          .map((invitation) => {
            const attempt = invitation.attempt!;
            return {
              id: attempt.id, examTitle: invitation.exam.title, status: attempt.status,
              startedAt: attempt.startedAt, submittedAt: attempt.submittedAt, deviceFingerprint: attempt.deviceFingerprint,
              result: attempt.result
                ? { score: attempt.result.score, maxScore: attempt.result.maxScore, percentage: attempt.result.percentage, passFail: attempt.result.passFail }
                : null,
              answers: attempt.answers.map((answer) => {
                const selectedIds: string[] = JSON.parse(answer.selectedOptionIdsJson);
                const optionTextById = new Map(answer.question.options.map((option) => [option.id, option.text]));
                return {
                  questionText: answer.question.text,
                  selectedOptions: selectedIds.map((optionId) => optionTextById.get(optionId) ?? optionId),
                  isCorrect: answer.isCorrect,
                  marksAwarded: answer.marksAwarded,
                };
              }),
              proctoringEvents: attempt.proctoringEvents.map((event) => ({
                eventType: event.eventType, severity: event.severity, occurredAt: event.occurredAt,
                metadata: event.metadataJson ? JSON.parse(event.metadataJson) : null,
              })),
              proctoringAnalysis: attempt.proctoringAnalysis
                ? { status: attempt.proctoringAnalysis.status, riskLevel: attempt.proctoringAnalysis.riskLevel, summary: attempt.proctoringAnalysis.summary }
                : null,
              insight: attempt.insight ? { status: attempt.insight.status, summary: attempt.insight.summary } : null,
              messages: attempt.messages.map((message) => ({ body: message.body, sentAt: message.sentAt, readAt: message.readAt })),
            };
          }),
      };
    });

    await this.audit.record(context, {
      actorUserId,
      action: 'candidate.data_exported',
      entityType: 'candidate',
      entityId: candidateId,
    });

    return exportPayload;
  }

  async erase(context: TenantContext, actorUserId: string, candidateId: string): Promise<{ id: string; erasedAt: Date }> {
    const { erasedAt, didErase } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const candidate = await tx.candidate.findFirst({
        where: { id: candidateId, organizationId: context.organizationId as string },
      });
      if (!candidate) {
        throw new NotFoundException(`Candidate ${candidateId} not found`);
      }
      if (candidate.erasedAt) {
        return { erasedAt: candidate.erasedAt, didErase: false };
      }

      const invitations = await tx.invitation.findMany({ where: { candidateId }, select: { id: true } });
      const invitationIds = invitations.map((invitation) => invitation.id);
      const attempts = await tx.attempt.findMany({ where: { invitationId: { in: invitationIds } }, select: { id: true } });
      const attemptIds = attempts.map((attempt) => attempt.id);

      const now = new Date();
      await tx.candidate.update({
        where: { id: candidateId },
        data: { name: 'Redacted', email: `erased-${candidateId}@redacted.invalid`, phone: null, erasedAt: now },
      });
      await tx.attempt.updateMany({ where: { id: { in: attemptIds } }, data: { deviceFingerprint: null } });
      await tx.candidateMessage.updateMany({ where: { attemptId: { in: attemptIds } }, data: { body: '[redacted]' } });
      await tx.proctoringEvent.updateMany({ where: { attemptId: { in: attemptIds } }, data: { metadataJson: null } });
      await tx.proctoringAnalysis.updateMany({
        where: { attemptId: { in: attemptIds }, summary: { not: null } },
        data: { summary: '[redacted]' },
      });
      await tx.attemptInsight.updateMany({
        where: { attemptId: { in: attemptIds }, summary: { not: null } },
        data: { summary: '[redacted]' },
      });
      await tx.candidateRefreshToken.deleteMany({ where: { invitationId: { in: invitationIds } } });
      await tx.invitation.updateMany({
        where: { id: { in: invitationIds }, status: 'invited' },
        data: { status: 'revoked', revokedAt: now },
      });

      return { erasedAt: now, didErase: true };
    });

    if (didErase) {
      await this.audit.record(context, {
        actorUserId,
        action: 'candidate.erased',
        entityType: 'candidate',
        entityId: candidateId,
      });
    }

    return { id: candidateId, erasedAt };
  }
}
