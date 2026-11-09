import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { buildViewer, tenantWide, type ScopeUser } from '../access/scope';
import { inCompany } from '../org-structure/org-structure.service';
import { OrgSettingsService } from '../org-structure/org-settings.service';
import { SETTINGS } from '../org-structure/settings-registry';

/**
 * Settings 6.1 Hiring: the company hiring settings the design has a place for (the others stay where they are and are
 * founder questions 341+). Every value is a scoped company setting with a default (org-settings.service), audited there
 * as org.setting.changed with before and after.
 */
export const HIRING_SETTING_KEYS = ['ats.retention_months', 'hiring.reject.email_candidate', 'ats.referral.bonus_inr', 'ats.referral.qualify_days', 'hiring.requisition.default_recruiter'] as const;
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
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
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
      const scorecards = await tx.scorecardTemplate.findMany({ where: { organizationId: org, archivedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, scaleMax: true, items: { orderBy: { position: 'asc' }, select: { label: true } } } });
      // Answer 291: the people a requisition's recruiter can be (any active person of the company, as on a job).
      const people = await tx.user.findMany({ where: { organizationId: org, status: 'active' }, orderBy: [{ name: 'asc' }, { email: 'asc' }], take: 1000, select: { id: true, name: true, email: true } });
      return {
        canEdit,
        people: people.map((u) => ({ id: u.id, name: u.name || u.email })),
        values,
        defaults: Object.fromEntries(HIRING_SETTING_KEYS.map((k) => [k, SETTINGS[k]!.default])),
        choices: Object.fromEntries(HIRING_SETTING_KEYS.map((k) => [k, SETTINGS[k]!.values])),
        lastChange: last ? { by: by?.name || by?.email || 'Someone', at: last.updatedAt, what: `Changed ${SETTINGS[last.key]!.label.replace(/^Hiring: /, '').toLowerCase()}` } : null,
        pipelines: pipelines
          .map((p) => ({ id: p.id, name: p.name, isDefault: p.isDefault, jobs: p._count.jobs, stages: p.stages.filter((s) => s.category !== 'archived').map((s) => ({ id: s.id, name: s.name, category: s.category, daysTarget: s.daysTarget, limit: s.stageLimit })) })),
        scorecards: scorecards.map((s) => ({ id: s.id, name: s.name, scaleMax: s.scaleMax, items: s.items.map((i) => i.label) })),
      };
    });
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
    const recruiter = changes.find((ch) => ch.key === 'hiring.requisition.default_recruiter' && ch.value !== 'none');
    if (recruiter)
      await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
        if (!/^[0-9a-f-]{36}$/i.test(recruiter.value) || !(await tx.user.findFirst({ where: { organizationId: c.organizationId, id: recruiter.value, status: 'active' }, select: { id: true } })))
          throw new NotFoundException('That person is not an active user of your company. Choose someone from the list.');
      });
    for (const ch of changes) await this.settings.set(ctx, { key: ch.key, scopeType: 'tenant', value: ch.value } as Parameters<OrgSettingsService['set']>[1]);
    return this.read(ctx, user);
  }
}
