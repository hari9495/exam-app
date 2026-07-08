import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ProctoringEvent } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { TenantContext } from '../prisma/tenant-context';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AttemptsAdminService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly attemptSettlement: AttemptSettlementService,
    private readonly audit: AuditService,
  ) {}

  async listProctoringEvents(context: TenantContext, attemptId: string): Promise<ProctoringEvent[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const attempt = await tx.attempt.findFirst({
        where: { id: attemptId, invitation: { exam: { organizationId: context.organizationId as string } } },
      });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${attemptId} not found`);
      }
      return tx.proctoringEvent.findMany({ where: { attemptId }, orderBy: { occurredAt: 'asc' } });
    });
  }

  async forceSubmit(context: TenantContext, attemptId: string, actorUserId: string): Promise<{ status: string }> {
    const finalized = await this.tenantPrisma.forTenant(context, async (tx) => {
      const attempt = await tx.attempt.findFirst({
        where: { id: attemptId, invitation: { exam: { organizationId: context.organizationId as string } } },
        include: { invitation: { include: { exam: true } } },
      });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${attemptId} not found`);
      }
      if (attempt.status !== 'in_progress') {
        throw new BadRequestException(`Attempt ${attemptId} cannot be force-submitted from status "${attempt.status}"`);
      }

      const exam = attempt.invitation.exam;
      return this.attemptSettlement.finalize(tx, exam, attempt, 'force_submitted');
    });

    await this.audit.record(context, {
      actorUserId,
      action: 'attempt.force_submit',
      entityType: 'attempt',
      entityId: attemptId,
    });

    return { status: finalized.status };
  }
}
