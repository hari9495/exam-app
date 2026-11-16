import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService, resolvePermissionGrants } from '@exam-platform/shared';
import { NotificationsService } from '../../notifications/notifications.service';
import { escapeHtml } from '../../notifications/notification-email-render';
import { todayIst } from '../../org-structure/org-validation';
import { companySetting } from './queue';

type Tx = Prisma.TransactionClient;
/** The bank writers' keys (the YukthiX key and its older alias). */
export const BANK_KEYS = ['asmt.bank.manage', 'question_bank:manage'];
const LOOKUP: TenantContext = { organizationId: null, isSuperAdmin: true };
const KEEP_DAYS = 30;

/** "1 question waits" / "3 questions and 1 translation wait": the note's words. */
export function waitingText(changes: number, translations: number): string {
  const parts = [changes ? `${changes} question${changes === 1 ? '' : 's'}` : '', translations ? `${translations} translation${translations === 1 ? '' : 's'}` : ''].filter(Boolean);
  const verb = changes + translations === 1 ? 'waits' : 'wait';
  return `${parts.join(' and ')} ${verb} for your review in the question bank. Open Hire › Assessments › Question review.`;
}

/**
 * Answer 2129: once a day, every bank writer who has questions or translations waiting for their review (someone
 * else's, not one they already gave the first approval to) gets one bell note, in companies that have assessments and
 * asmt.bank.review_reminders on (both on by default). Idempotent: the (person, India day) mark is inserted first and the
 * note goes only when the insert happened, so a re-run, a retry or a second server sends nothing more.
 */
@Injectable()
export class QuestionReviewNudgesService {
  private readonly logger = new Logger(QuestionReviewNudgesService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Active people of the company who may hold a bank key (by role, profile or grant), checked again one by one. */
  private async candidates(tx: Tx, org: string, day: string) {
    const likes = BANK_KEYS.map((k) => `%"${k}"%`);
    return tx.$queryRaw<{ id: string; role: string; permission_profile_id: string | null }[]>`
      SELECT u.id::text, u.role, u.permission_profile_id::text FROM users u
      WHERE u.organization_id = ${org}::uuid AND u.status = 'active' AND (
        u.role IN (SELECT rp.role FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE p.key = ANY(${BANK_KEYS}::text[]))
        OR u.permission_profile_id IN (SELECT p.id FROM permission_profiles p WHERE p.organization_id = ${org}::uuid AND (p.permissions_json LIKE ${likes[0]} OR p.permissions_json LIKE ${likes[1]}))
        OR u.id IN (SELECT g.user_id FROM role_grants g JOIN permission_profiles p ON p.organization_id = g.organization_id AND p.id = g.permission_profile_id
                    WHERE g.organization_id = ${org}::uuid AND g.status = 'active' AND (p.permissions_json LIKE ${likes[0]} OR p.permissions_json LIKE ${likes[1]})
                      AND g.valid_from <= ${day}::date AND (g.valid_to IS NULL OR g.valid_to >= ${day}::date)))`;
  }

  async sweep(now = new Date(), only?: string[]): Promise<number> {
    const day = todayIst(now);
    const orgs = await this.tenantPrisma.forTenant(LOOKUP, async (tx) => {
      await tx.questionReviewNudge.deleteMany({ where: { day: { lt: new Date(Date.parse(`${day}T00:00:00Z`) - KEEP_DAYS * 86_400_000) } } });
      const a = await tx.questionRevision.groupBy({ by: ['organizationId'], where: { state: 'in_review', ...(only ? { organizationId: { in: only } } : {}) } });
      const b = await tx.questionTranslation.groupBy({ by: ['organizationId'], where: { state: 'in_review', ...(only ? { organizationId: { in: only } } : {}) } });
      return [...new Set([...a, ...b].map((r) => r.organizationId))];
    });
    let sent = 0;
    for (const org of orgs) {
      try {
        sent += await this.company(org, day);
      } catch (e) {
        this.logger.error(`Question review notes failed for ${org}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return sent;
  }

  private async company(org: string, day: string): Promise<number> {
    const ctx: TenantContext = { organizationId: org, isSuperAdmin: false };
    const plan = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      if ((await companySetting(tx, org, 'assessments.enabled')) !== 'on' || (await companySetting(tx, org, 'asmt.bank.review_reminders')) !== 'on') return null;
      const changes = await tx.questionRevision.findMany({ where: { organizationId: org, state: 'in_review' }, select: { authorId: true, reviewerId: true } });
      const translations = await tx.questionTranslation.findMany({ where: { organizationId: org, state: 'in_review' }, select: { authorId: true } });
      return { changes, translations, people: await this.candidates(tx, org, day) };
    });
    if (!plan) return 0;
    let sent = 0;
    for (const p of plan.people) {
      const keys = await resolvePermissionGrants(this.prisma, this.tenantPrisma, { role: p.role, organizationId: org, permissionProfileId: p.permission_profile_id, userId: p.id }, BANK_KEYS);
      if (!BANK_KEYS.some((k) => keys.has(k))) continue;
      // Never their own; a change they gave the first approval to waits for someone else.
      const changes = plan.changes.filter((c) => c.authorId !== p.id && c.reviewerId !== p.id).length;
      const translations = plan.translations.filter((t) => t.authorId !== p.id).length;
      if (!changes && !translations) continue;
      const claimed = await this.tenantPrisma.forTenant(ctx, (tx) => tx.$executeRaw`INSERT INTO question_review_nudges (organization_id, user_id, day, waiting) VALUES (${org}::uuid, ${p.id}::uuid, ${day}::date, ${changes + translations}) ON CONFLICT DO NOTHING`);
      if (!claimed) continue;
      const text = waitingText(changes, translations);
      await this.notifications
        .notifySystem(ctx, [p.id], 'asmt.question.review_waiting', { entityType: 'question_review', entityId: p.id, contextText: text, linkPath: '/yx/hiring/assessments/reviews' }, { subject: 'Questions wait for your review', html: `<p>${escapeHtml(text)}</p>` })
        .catch((e: unknown) => this.logger.error(e));
      sent++;
    }
    return sent;
  }
}
