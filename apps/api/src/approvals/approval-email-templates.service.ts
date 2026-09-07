import { BadRequestException, Injectable } from '@nestjs/common';
import {
  TenantPrismaService,
  TenantContext,
  AuditService,
  APPROVAL_EMAIL_EVENT_TYPES,
  ApprovalEmailEventType,
  isApprovalEmailEventType,
} from '@exam-platform/shared';
import { UpsertApprovalEmailTemplateDto } from './dto/upsert-approval-email-template.dto';

export interface ApprovalEmailTemplateSlot {
  eventType: ApprovalEmailEventType;
  subject: string | null;
  body: string | null;
  enabled: boolean;
}

@Injectable()
export class ApprovalEmailTemplatesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  // Always returns all four event slots (org row, or a null/unset placeholder) so the UI can
  // render every slot without a client-side merge against the event-type constant.
  async list(context: TenantContext): Promise<ApprovalEmailTemplateSlot[]> {
    const rows = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.approvalEmailTemplate.findMany({
        where: { organizationId: context.organizationId as string, eventType: { in: [...APPROVAL_EMAIL_EVENT_TYPES] } },
      }),
    );
    const byEventType = new Map(rows.map((r) => [r.eventType as ApprovalEmailEventType, r]));
    return APPROVAL_EMAIL_EVENT_TYPES.map((eventType) => {
      const row = byEventType.get(eventType);
      return row
        ? { eventType, subject: row.subject, body: row.body, enabled: row.enabled }
        : { eventType, subject: null, body: null, enabled: true };
    });
  }

  async upsert(context: TenantContext, actorUserId: string, eventType: string, dto: UpsertApprovalEmailTemplateDto) {
    if (!isApprovalEmailEventType(eventType)) {
      throw new BadRequestException(`Unknown event type '${eventType}'`);
    }

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const organizationId = context.organizationId as string;
      const row = await tx.approvalEmailTemplate.upsert({
        where: { organizationId_eventType: { organizationId, eventType } },
        update: { subject: dto.subject, body: dto.body, ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}) },
        create: { organizationId, eventType, subject: dto.subject, body: dto.body, enabled: dto.enabled ?? true },
      });

      await this.audit.record(context, {
        actorUserId,
        action: 'approval_email_template.saved',
        entityType: 'approval_email_template',
        entityId: row.id,
        metadata: { eventType },
      });

      return row;
    });
  }
}
