import { BadRequestException, Injectable } from '@nestjs/common';
import { TenantPrismaService, TenantContext, AuditService } from '@exam-platform/shared';
import {
  INTERVIEW_EMAIL_EVENT_TYPES,
  InterviewEmailEventType,
  isInterviewEmailEventType,
  INTERVIEW_EMAIL_DEFAULTS,
  InterviewEmailCopy,
} from './interview-email-types';
import { UpsertInterviewEmailTemplateDto } from './dto/upsert-interview-email-template.dto';

export interface InterviewEmailTemplateSlot {
  eventType: InterviewEmailEventType;
  subject: string | null;
  body: string | null;
  enabled: boolean;
}

// A resolved template for one event: either the org's (enabled) copy or the built-in default.
export type ResolvedInterviewTemplate = InterviewEmailCopy;

@Injectable()
export class InterviewEmailTemplatesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  // All slots (org row or an unset placeholder), so the settings UI renders every event without a
  // client-side merge against the event-type constant.
  async list(context: TenantContext): Promise<InterviewEmailTemplateSlot[]> {
    const rows = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.interviewEmailTemplate.findMany({
        where: { organizationId: context.organizationId as string, eventType: { in: [...INTERVIEW_EMAIL_EVENT_TYPES] } },
      }),
    );
    const byEventType = new Map(rows.map((r) => [r.eventType as InterviewEmailEventType, r]));
    return INTERVIEW_EMAIL_EVENT_TYPES.map((eventType) => {
      const row = byEventType.get(eventType);
      return row
        ? { eventType, subject: row.subject, body: row.body, enabled: row.enabled }
        : { eventType, subject: null, body: null, enabled: true };
    });
  }

  async upsert(context: TenantContext, actorUserId: string, eventType: string, dto: UpsertInterviewEmailTemplateDto) {
    if (!isInterviewEmailEventType(eventType)) {
      throw new BadRequestException(`Unknown event type '${eventType}'`);
    }
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const organizationId = context.organizationId as string;
      const row = await tx.interviewEmailTemplate.upsert({
        where: { organizationId_eventType: { organizationId, eventType } },
        update: { subject: dto.subject, body: dto.body, ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}) },
        create: { organizationId, eventType, subject: dto.subject, body: dto.body, enabled: dto.enabled ?? true },
      });
      await this.audit.record(context, {
        actorUserId,
        action: 'interview_email_template.saved',
        entityType: 'interview_email_template',
        entityId: row.id,
        metadata: { eventType },
      });
      return row;
    });
  }

  // Resolve every event to the copy the send site should use: the org's enabled template, else the
  // built-in default. A disabled or missing row falls back — behavior-preserving. Callers render the
  // returned {subject, body} with renderTemplateString + their own vars.
  async resolveMap(context: TenantContext): Promise<Record<InterviewEmailEventType, ResolvedInterviewTemplate>> {
    const rows = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.interviewEmailTemplate.findMany({
        where: { organizationId: context.organizationId as string, eventType: { in: [...INTERVIEW_EMAIL_EVENT_TYPES] } },
      }),
    );
    const byEventType = new Map(rows.map((r) => [r.eventType as InterviewEmailEventType, r]));
    const out = {} as Record<InterviewEmailEventType, ResolvedInterviewTemplate>;
    for (const eventType of INTERVIEW_EMAIL_EVENT_TYPES) {
      const row = byEventType.get(eventType);
      out[eventType] = row?.enabled ? { subject: row.subject, body: row.body } : INTERVIEW_EMAIL_DEFAULTS[eventType];
    }
    return out;
  }
}
