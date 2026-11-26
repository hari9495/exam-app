import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantPrismaService } from '@exam-platform/shared';
import { companyContext } from '../org-structure/org-structure.service';
import { POLICY_TYPES, declaredFields } from './approval-policies';

type Tx = Prisma.TransactionClient;
type Ctx = { organizationId: string | null; userId?: string | null };

// E2 part 7 (answer 2648, review item 11): a company's own notice text per approval event, for the two hiring request
// types only. Merge fields are the request's title, who asked, the step and the link, never the request's summary
// (approvers may see pay there; cards stay neutral). Every value is HTML-escaped by the email renderer, and text is
// checked at save for unknown fields and markup.

export const NOTICE_TYPES = ['ats.requisition', 'ats.offer'] as const;
export const NOTICE_EVENTS = ['requested', 'reminder', 'escalated', 'approved', 'turned_down', 'sent_back'] as const;
export type NoticeEvent = (typeof NOTICE_EVENTS)[number];
export const MERGE_FIELDS = ['title', 'requester', 'step', 'link'] as const;
const EVENT_LABEL: Record<NoticeEvent, string> = { requested: 'Approval needed', reminder: 'Reminder', escalated: 'Escalated', approved: 'Approved', turned_down: 'Turned down', sent_back: 'Sent back' };
const FIELD = /\{([a-z_]+)\}/g;

/** The text with its merge fields filled in; anything else in braces stays as typed. */
export function mergeNotice(text: string, vars: Record<(typeof MERGE_FIELDS)[number], string>): string {
  return text.replace(FIELD, (all, k: string) => ((MERGE_FIELDS as readonly string[]).includes(k) ? vars[k as keyof typeof vars] : all));
}

/** The company's text for this request type and event, or null to use the standard notice. */
export async function noticeTextFor(tx: Tx, org: string, type: string, event: NoticeEvent | null) {
  if (!event || !(NOTICE_TYPES as readonly string[]).includes(type)) return null;
  return tx.approvalNoticeText.findFirst({ where: { organizationId: org, requestType: type, event }, select: { subject: true, body: true } });
}

function check(subject: string, body: string) {
  const s = subject.trim();
  const b = body.trim();
  if (s.length < 2 || s.length > 150 || /[\r\n]/.test(s)) throw new BadRequestException('Write a subject of 2 to 150 characters on one line.');
  if (b.length < 2 || b.length > 2000) throw new BadRequestException('Write a message of 2 to 2,000 characters.');
  if (/[<>]/.test(s + b)) throw new BadRequestException('Use plain text, without < or >.');
  const unknown = [...(s + b).matchAll(FIELD)].map((m) => m[1]).find((k) => !(MERGE_FIELDS as readonly string[]).includes(k));
  if (unknown) throw new BadRequestException(`{${unknown}} is not a merge field. Use {title}, {requester}, {step} or {link}.`);
  return { subject: s, body: b };
}

@Injectable()
export class ApprovalNotices {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private guard(type: string, event?: string) {
    if (!(NOTICE_TYPES as readonly string[]).includes(type)) throw new NotFoundException('Only requisitions and offers have their own notice text.');
    if (event !== undefined && !(NOTICE_EVENTS as readonly string[]).includes(event)) throw new NotFoundException('There is no such notice.');
  }

  async list(ctx: Ctx, type: string) {
    this.guard(type);
    const c = companyContext({ organizationId: ctx.organizationId, isSuperAdmin: false, userId: ctx.userId ?? null });
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const rows = await tx.approvalNoticeText.findMany({ where: { organizationId: c.organizationId, requestType: type } });
      return { fields: MERGE_FIELDS, events: NOTICE_EVENTS.map((e) => ({ event: e, label: EVENT_LABEL[e], ...(rows.find((r) => r.event === e) ? { subject: rows.find((r) => r.event === e)!.subject, body: rows.find((r) => r.event === e)!.body, own: true } : { subject: null, body: null, own: false }) })) };
    });
  }

  async save(ctx: Ctx, type: string, event: string, input: { subject: string; body: string }) {
    this.guard(type, event);
    if (!ctx.userId) throw new ForbiddenException('Sign in to change notices.');
    const v = check(input.subject, input.body);
    const c = companyContext({ organizationId: ctx.organizationId, isSuperAdmin: false, userId: ctx.userId });
    await this.tenantPrisma.forTenant(c, async (tx) => {
      const before = await tx.approvalNoticeText.findFirst({ where: { organizationId: c.organizationId, requestType: type, event } });
      if (before) await tx.approvalNoticeText.update({ where: { id: before.id }, data: { ...v, updatedBy: ctx.userId!, updatedAt: new Date() } });
      else await tx.approvalNoticeText.create({ data: { organizationId: c.organizationId, requestType: type, event, ...v, updatedBy: ctx.userId! } });
      await AuditService.recordIn(tx, c, { actorUserId: ctx.userId!, action: 'workflow.notice.changed', entityType: 'approval_notice_text', entityId: `${type}:${event}`, metadata: { type, event, before: before ? { subject: before.subject, body: before.body } : null, after: v } });
    });
    return this.list(ctx, type);
  }

  async reset(ctx: Ctx, type: string, event: string) {
    this.guard(type, event);
    if (!ctx.userId) throw new ForbiddenException('Sign in to change notices.');
    const c = companyContext({ organizationId: ctx.organizationId, isSuperAdmin: false, userId: ctx.userId });
    await this.tenantPrisma.forTenant(c, async (tx) => {
      const before = await tx.approvalNoticeText.findFirst({ where: { organizationId: c.organizationId, requestType: type, event } });
      if (!before) return;
      await tx.approvalNoticeText.delete({ where: { id: before.id } });
      await AuditService.recordIn(tx, c, { actorUserId: ctx.userId!, action: 'workflow.notice.reset', entityType: 'approval_notice_text', entityId: `${type}:${event}`, metadata: { type, event, before: { subject: before.subject, body: before.body }, after: null } });
    });
    return this.list(ctx, type);
  }

  /** "Try it" on a past request: the latest 20 of the type (that kept their values, when the type sends any). */
  async pastRequests(ctx: Ctx, type: string) {
    if (!POLICY_TYPES.some((t) => t.key === type)) throw new NotFoundException('This request type has no approval policy here.');
    const c = companyContext({ organizationId: ctx.organizationId, isSuperAdmin: false, userId: ctx.userId ?? null });
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const rows = await tx.wfRequest.findMany({ where: { organizationId: c.organizationId, requestType: type, ...(declaredFields(type).length ? { NOT: { payload: { equals: {} } } } : {}) }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, title: true, createdAt: true } });
      return rows.map((r) => ({ id: r.id, title: r.title, submittedAt: r.createdAt.toISOString() }));
    });
  }
}
