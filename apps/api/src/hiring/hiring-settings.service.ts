import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { buildViewer, tenantWide, type ScopeUser } from '../access/scope';
import { audit, inCompany } from '../org-structure/org-structure.service';
import { NotificationsService } from '../notifications/notifications.service';
import { escapeHtml } from '../notifications/notification-email-render';
import { OrgSettingsService } from '../org-structure/org-settings.service';
import { SETTINGS } from '../org-structure/settings-registry';
import { assertDefaultRecruiter, isRecruiter, recruiterKeyHolders } from './recruiter-key';
import { todayIst } from '../org-structure/org-validation';
import { holdersOf } from '../time/time-core';

/** Answer 332: the band approver may be a named person who holds the offer-pay key (they decide on pay). */
const OFFER_PAY_KEY = 'ats.offer.compensation.view';
const NONE = '00000000-0000-0000-0000-000000000000';
const LETTER_ESIGN = 'offer_template.esign';

/**
 * Settings 6.1 Hiring: the company hiring settings the design has a place for (answers 291, 302 and 341). Every value is a scoped company setting with a default (org-settings.service), audited there
 * as org.setting.changed with before and after.
 */
export const HIRING_SETTING_KEYS = [
  'ats.retention_months',
  'hiring.reject.email_candidate',
  'ats.referral.bonus_inr',
  'ats.referral.qualify_days',
  'hiring.requisition.default_recruiter',
  // Founder answer 341: the seven settings drawn into 6.1 (company-wide values; pay range and pay history can still
  // differ for a legal entity or location, set through the company settings API).
  'ats.headcount_plan',
  'ats.headcount_plan.manager_view',
  'ats.referral.self_apply_days',
  'hiring.pay_range.show',
  'hiring.pay_history.ask',
  'hiring.rediscovery.ai',
  'hiring.rehire_flag.blocks_screening',
  // HIR-09 answers 332 and 334: who approves above the range, and how a joining bonus is repaid.
  'hiring.offer.band_approver',
  'hiring.offer.clawback_basis',
  // Founder answer 362: who decides a BGV discrepancy.
  'hiring.bgv.decider_other_person',
  // HIR-27: the interview day's slot length and how Auto-assign fills it.
  'hiring.interview_day.slot_minutes',
  'hiring.interview_day.assign',
  // HIR-13 (founder decision 6): who can apply for internal jobs, and when the current manager is told.
  'hiring.internal.after_probation',
  'hiring.internal.months_in_role',
  'hiring.internal.tell_manager',
  // HIR-25 (founder decision 2): the notetaker, the AI draft and how long transcripts are kept.
  'hiring.notetaker.enabled',
  'hiring.notetaker.ai_draft',
  'hiring.notetaker.keep_days',
] as const;
export type HiringSettingKey = (typeof HIRING_SETTING_KEYS)[number];
const EDIT_KEYS = ['ats.settings.manage', 'org.settings.manage'] as const;
const DEFAULT_RECRUITER = 'hiring.requisition.default_recruiter';
export const STALE_NOTICE = 'hiring.default_recruiter.stale_notified';

@Injectable()
export class HiringSettingsService {
  private readonly logger = new Logger(HiringSettingsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly settings: OrgSettingsService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /**
   * Founder answer 385 (scheduled, hourly): a company's default recruiter who has left or lost the recruiter key is
   * reported to the people who may change the hiring settings, once for each saved value (a new save that goes stale
   * again is reported again). The marker is an audit row, claimed before the notice is sent, so a rerun never repeats it.
   */
  async staleRecruiterSweep(): Promise<number> {
    const rows = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.setting.findMany({ where: { key: DEFAULT_RECRUITER, scopeType: 'tenant' }, select: { id: true, organizationId: true, value: true, updatedAt: true } }));
    let sent = 0;
    for (const r of rows) {
      if (String(r.value) === 'none') continue;
      try {
        if (await this.noticeStaleRecruiter({ ...r, value: String(r.value) })) sent++;
      } catch (e) {
        this.logger.error(`Default recruiter check failed for ${r.organizationId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return sent;
  }

  /** One company's default recruiter: true when a notice went out now. */
  async noticeStaleRecruiter(row: { id: string; organizationId: string; value: string; updatedAt: Date }): Promise<boolean> {
    const org = row.organizationId;
    if (await isRecruiter(this.prisma, this.tenantPrisma, org, row.value)) return false;
    const ctx: TenantContext = { organizationId: org, isSuperAdmin: false };
    const saved = row.updatedAt.toISOString();
    const claimed = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const done = await tx.auditLog.findFirst({ where: { organizationId: org, action: STALE_NOTICE, entityType: 'setting', entityId: row.id, metadataJson: { contains: `"saved":"${saved}"` } }, select: { id: true } });
      if (done) return null;
      const person = await tx.user.findFirst({ where: { organizationId: org, id: row.value }, select: { name: true, email: true, status: true } });
      const left = !person || person.status !== 'active';
      await audit(tx, c, STALE_NOTICE, 'setting', row.id, { value: row.value, saved, left });
      return { name: person?.name || person?.email || 'The default recruiter', left };
    });
    if (!claimed) return false;
    const people = await inCompany(this.tenantPrisma, ctx, (tx) => tx.user.findMany({ where: { organizationId: org, status: 'active' }, take: 1000, select: { id: true, role: true, permissionProfileId: true } }));
    const to: string[] = [];
    for (let i = 0; i < people.length; i += 10) {
      const batch = people.slice(i, i + 10);
      const can = await Promise.all(batch.map((u) => this.canEdit({ userId: u.id, role: u.role, organizationId: org, permissionProfileId: u.permissionProfileId })));
      to.push(...batch.filter((_, k) => can[k]).map((u) => u.id));
    }
    const why = claimed.left ? 'has left the company' : 'no longer holds the recruiter key';
    const text = `${claimed.name} ${why}, so new requisitions start with no recruiter. Choose another default recruiter in Settings › Hiring.`;
    await this.notifications?.notifySystem(ctx, to.filter((id) => id !== row.value), 'hiring.default_recruiter.stale', { entityType: 'setting', entityId: row.id, contextText: text, linkPath: '/yx/settings/hiring' }, { subject: 'Choose a new default recruiter', html: `<p>${escapeHtml(text)}</p>` }, row.value);
    return true;
  }

  /** The hiring settings key or HR's settings key, held for the whole company (a narrower grant confers nothing). */
  async canEdit(user: ScopeUser): Promise<boolean> {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, [...EDIT_KEYS]);
    return EDIT_KEYS.some((k) => tenantWide(v, k));
  }

  async read(ctx: TenantContext, user: ScopeUser) {
    const canEdit = await this.canEdit(user);
    const { active, chosenName, ...out } = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const rows = await tx.setting.findMany({ where: { organizationId: org, key: { in: [...HIRING_SETTING_KEYS] }, scopeType: 'tenant', scopeId: org } });
      const values = Object.fromEntries(HIRING_SETTING_KEYS.map((k) => [k, String(rows.find((r) => r.key === k)?.value ?? SETTINGS[k]!.default)])) as Record<HiringSettingKey, string>;
      const last = rows.filter((r) => r.updatedBy).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
      const by = last ? await tx.user.findFirst({ where: { organizationId: org, id: last.updatedBy! }, select: { name: true, email: true } }) : null;
      const pipelines = await tx.pipeline.findMany({
        where: { organizationId: org, deletedAt: null },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        select: { id: true, name: true, isDefault: true, _count: { select: { jobs: true } }, stages: { orderBy: { position: 'asc' }, select: { id: true, name: true, category: true, daysTarget: true, stageLimit: true } } },
      });
      // Answer 345: the scorecard templates with what their editor needs (a used one is copied, never changed).
      const scorecards = await tx.scorecardTemplate.findMany({ where: { organizationId: org, archivedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, scaleMax: true, passBar: true, items: { orderBy: { position: 'asc' }, select: { id: true, label: true, guidance: true, weight: true, competencyId: true } } } });
      const used = await tx.scorecard.groupBy({ by: ['templateId'], where: { organizationId: org, templateId: { in: scorecards.map((s) => s.id) } }, _count: { _all: true } });
      const active = await tx.user.findMany({ where: { organizationId: org, status: 'active' }, orderBy: [{ name: 'asc' }, { email: 'asc' }], take: 1000, select: { id: true, name: true, email: true, role: true, permissionProfileId: true } });
      const chosen = values['hiring.requisition.default_recruiter'];
      const chosenUser = chosen === 'none' ? null : await tx.user.findFirst({ where: { organizationId: org, id: chosen }, select: { name: true, email: true } });
      return {
        active,
        chosenName: chosenUser?.name || chosenUser?.email || 'Someone who is no longer in the company',
        // Answer 332: the people who may approve above the range hold the offer-pay key; answer 337: each letter's e-sign switch.
        offerApprovers: await (async () => {
          const holders = new Set(await holdersOf(tx, org, OFFER_PAY_KEY, NONE, todayIst()));
          return active.filter((u) => holders.has(u.id)).map((u) => ({ id: u.id, name: u.name || u.email }));
        })(),
        offerLetters: await tx.offerTemplate.findMany({ where: { organizationId: org }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }], select: { id: true, name: true, esign: true } }),
        values,
        defaults: Object.fromEntries(HIRING_SETTING_KEYS.map((k) => [k, SETTINGS[k]!.default])),
        choices: Object.fromEntries(HIRING_SETTING_KEYS.map((k) => [k, SETTINGS[k]!.values])),
        lastChange: last ? { by: by?.name || by?.email || 'Someone', at: last.updatedAt, what: `Changed ${SETTINGS[last.key]!.label.replace(/^Hiring: /, '').toLowerCase()}` } : null,
        pipelines: pipelines
          .map((p) => ({ id: p.id, name: p.name, isDefault: p.isDefault, jobs: p._count.jobs, stages: p.stages.filter((s) => s.category !== 'archived').map((s) => ({ id: s.id, name: s.name, category: s.category, daysTarget: s.daysTarget, limit: s.stageLimit })) })),
        scorecards: scorecards.map((s) => ({ id: s.id, name: s.name, scaleMax: s.scaleMax, passBar: Number(s.passBar), inUse: used.some((u) => u.templateId === s.id), items: s.items })),
      };
    });
    // Answers 291 and 348: the default recruiter's choices are the active people who hold the recruiter key (resolved
    // outside the read transaction). A default who no longer qualifies (left, or lost the key) is treated as none, with
    // a warning naming them.
    const people = await recruiterKeyHolders(this.prisma, this.tenantPrisma, ctx.organizationId!, active);
    const chosen = out.values['hiring.requisition.default_recruiter'];
    const stale = chosen !== 'none' && !people.some((p) => p.id === chosen);
    if (stale) out.values['hiring.requisition.default_recruiter'] = 'none';
    return { canEdit, people: people.map((u) => ({ id: u.id, name: u.name || u.email })), staleRecruiter: stale ? chosenName : null, ...out };
  }

  /**
   * Saves several settings at once. Every key and value is checked before anything is written, so a bad value saves
   * nothing; each change is then a normal company setting (audited with before and after).
   */
  async save(ctx: TenantContext, user: ScopeUser, changes: { key: string; value: string }[]) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    if (!(await this.canEdit(user))) throw new ForbiddenException('Only people with the hiring settings key for the whole company can change these settings.');
    // Answer 337: an offer letter's e-sign switch rides along as 'offer_template.esign' = '<template id>:on|off'.
    const letters = changes.filter((ch) => ch.key === LETTER_ESIGN).map((ch) => {
      const m = /^([0-9a-f-]{36}):(on|off)$/i.exec(ch.value);
      if (!m) throw new BadRequestException('An offer letter switch is "<letter>:on" or "<letter>:off".');
      return { id: m[1]!, esign: m[2] === 'on' };
    });
    changes = changes.filter((ch) => ch.key !== LETTER_ESIGN);
    const seen = new Set<string>();
    for (const ch of changes) {
      if (!(HIRING_SETTING_KEYS as readonly string[]).includes(ch.key)) throw new BadRequestException(`${ch.key} is not a hiring setting on this page.`);
      if (seen.has(ch.key)) throw new BadRequestException(`${SETTINGS[ch.key]!.label} is in the list twice.`);
      seen.add(ch.key);
      const def = SETTINGS[ch.key]!;
      if (!def.oneOf && !def.values.includes(ch.value)) throw new BadRequestException(`${def.label} is one of: ${def.values.join(', ')}`);
    }
    // Answer 348 (checked again by each company setting write): before anything is written, so a bad choice saves nothing.
    const recruiter = changes.find((ch) => ch.key === 'hiring.requisition.default_recruiter');
    if (recruiter) await assertDefaultRecruiter(this.prisma, this.tenantPrisma, ctx.organizationId!, recruiter.value);
    const approver = changes.find((ch) => ch.key === 'hiring.offer.band_approver' && !SETTINGS['hiring.offer.band_approver']!.values.includes(ch.value));
    if (approver)
      await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
        const ok = /^[0-9a-f-]{36}$/i.test(approver.value) && (await tx.user.findFirst({ where: { organizationId: c.organizationId, id: approver.value, status: 'active' }, select: { id: true } }));
        if (!ok) throw new NotFoundException('That person is not an active user of your company. Choose someone from the list.');
        if (!(await holdersOf(tx, c.organizationId, OFFER_PAY_KEY, NONE, todayIst())).includes(approver.value)) throw new BadRequestException('That person cannot see offer pay, so cannot approve it. Choose someone with the offer-pay key.');
      });
    if (letters.length)
      await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
        for (const l of letters) {
          const t = await tx.offerTemplate.findFirst({ where: { organizationId: c.organizationId, id: l.id }, select: { id: true, esign: true, name: true } });
          if (!t) throw new NotFoundException('That offer letter is not one of your company’s.');
          if (t.esign === l.esign) continue;
          await tx.offerTemplate.update({ where: { id: t.id }, data: { esign: l.esign } });
          await audit(tx, c, 'offer_template.updated', 'offer_template', t.id, { name: t.name, esign: l.esign });
        }
      });
    for (const ch of changes) await this.settings.set(ctx, { key: ch.key, scopeType: 'tenant', value: ch.value } as Parameters<OrgSettingsService['set']>[1]);
    return this.read(ctx, user);
  }
}
