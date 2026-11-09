import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { buildViewer, tenantWide, type ScopeUser } from '../access/scope';
import { inCompany } from '../org-structure/org-structure.service';
import { OrgSettingsService } from '../org-structure/org-settings.service';
import { SETTINGS } from '../org-structure/settings-registry';
import { assertDefaultRecruiter, recruiterKeyHolders } from './recruiter-key';

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
  // HIR-13 (founder decision 6): who can apply for internal jobs, and when the current manager is told.
  'hiring.internal.after_probation',
  'hiring.internal.months_in_role',
  'hiring.internal.tell_manager',
] as const;
export type HiringSettingKey = (typeof HIRING_SETTING_KEYS)[number];
const EDIT_KEYS = ['ats.settings.manage', 'org.settings.manage'] as const;

@Injectable()
export class HiringSettingsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly settings: OrgSettingsService,
  ) {}

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
    for (const ch of changes) await this.settings.set(ctx, { key: ch.key, scopeType: 'tenant', value: ch.value } as Parameters<OrgSettingsService['set']>[1]);
    return this.read(ctx, user);
  }
}
