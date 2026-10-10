import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, Viewer, tenantWide } from '../access/scope';
import { SETTINGS } from '../org-structure/settings-registry';
import { settingFor } from '../people/probation';
import { displayName } from '../employee-history/employee-history.service';
import { LettersService } from '../documents/letters/letters.service';
import { joinerInScope } from '../documents/person-access';
import { JoinersService } from './joiners.service';
import { LifecycleJourneysService } from './journeys.service';

// Lifecycle batch 6e, the onboarding special cases (M01 §3.5; design §16.5):
//   rehire   (LIFE-5.01, YX-LC-11 / 18) someone who worked here before joins on the same employee record; the
//            company's rehire policy gives every option a default and HR may change one for this rehire with a
//            reason (audited); the impact preview says what each choice means before joining;
//   batches  (LIFE-5.02, PPL-14) a campus batch joins on one day: moving the batch's day moves every member and their
//            checklist; engagement touchpoints; a letter of intent to every member;
//   buddy    (LIFE-5.03, PPL-41) a colleague who helps the joiner settle in: never the manager or the joiner; the
//            checklist's buddy tasks (the day-30 check-in) go to them.

const iso = (d: Date) => d.toISOString().slice(0, 10);
export const REHIRE_OPTIONS = ['code', 'pf', 'same_fy_tax', 'service', 'gratuity', 'leave', 'probation', 'prior_records'] as const;
type RehireOption = (typeof REHIRE_OPTIONS)[number];
const MEANING: Record<string, string> = {
  'code:reuse': 'Keeps their old employee code.',
  'code:new': 'Gets a new employee code.',
  'pf:continue': 'Keeps the same UAN and PF membership.',
  'pf:transfer': 'Keeps the same UAN; the old PF balance is transferred (Form 13).',
  'pf:fresh': 'Keeps the same UAN; PF starts fresh.',
  'same_fy_tax:combine': 'Same entity and financial year: income and TDS are combined into one Form 16.',
  'same_fy_tax:previous_employer': 'The earlier spell is treated like a previous employer (Form 12B).',
  'service:fresh': 'Service counts from the new joining day.',
  'service:continuous': 'Service continues from the first joining day.',
  'service:break_counted': 'Earlier service counts; the break does not.',
  'gratuity:fresh': 'Gratuity service starts fresh.',
  'gratuity:add_prior': 'Earlier service counts for gratuity (if it was not paid out).',
  'leave:fresh': 'Leave starts fresh.',
  'leave:carry': 'Leave left at exit carries forward.',
  'probation:normal': 'Probation as for any joiner.',
  'probation:skip_if_break_lt_6m': 'No probation when the break was under 6 months.',
  'probation:never': 'No probation.',
  'prior_records:hr_only': 'Earlier warnings and PIPs: HR only.',
  'prior_records:manager': 'Earlier warnings and PIPs: the new manager sees them.',
  'prior_records:hidden': 'Earlier warnings and PIPs: hidden.',
};
const monthsBetween = (a: string, b: string) => {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am) - (bd < ad ? 1 : 0);
};
const fyOf = (d: string) => (Number(d.slice(5, 7)) >= 4 ? Number(d.slice(0, 4)) : Number(d.slice(0, 4)) - 1);

export interface BatchInput {
  name: string;
  legalEntityId: string;
  joiningOn: string;
  touchpoints?: { title: string; on: string }[];
}

@Injectable()
export class OnboardingExtrasService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly journeys: LifecycleJourneysService,
    private readonly joiners: JoinersService,
    private readonly letters: LettersService,
  ) {}

  private viewer(user: ScopeUser) {
    return this.journeys.viewer(user);
  }

  private async joiner(tx: Tx, c: CompanyContext, v: Viewer, id: string, key = 'lifecycle.onboarding.manage') {
    const r = await tx.preboarding.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!r || v.actingForOther || !(await joinerInScope(tx, c, v, key, r))) throw new NotFoundException('No such joiner.');
    return r;
  }

  // ------------------------------------------------------------------------------------------ rehire (LIFE-5.01)

  /** The policy default of each option, this rehire's choice, and what it means (the impact preview). */
  async rehireOptionsIn(tx: Tx, c: CompanyContext, pb: Prisma.PreboardingGetPayload<object>) {
    const prev = await tx.employment.findFirstOrThrow({ where: { organizationId: c.organizationId, id: pb.rehireOf! } });
    const overrides = (pb.rehireOverrides ?? {}) as Record<string, { value: string; reason: string }>;
    const options = [];
    for (const key of REHIRE_OPTIONS) {
      const policy = await settingFor(tx, c, `rehire.${key}`, { legalEntityId: pb.legalEntityId });
      const value = overrides[key]?.value ?? policy;
      options.push({ key, label: SETTINGS[`rehire.${key}`].label.replace(/^Rehire( in the same financial year)?: /, ''), choices: [...SETTINGS[`rehire.${key}`].values], policy, value, overridden: value !== policy, reason: overrides[key]?.reason ?? null, meaning: MEANING[`${key}:${value}`] ?? value });
    }
    const exitedOn = iso(prev.exitedOn!);
    const joining = iso(pb.joiningOn);
    return { prev, exitedOn, breakMonths: monthsBetween(exitedOn, joining), sameEntityFy: prev.legalEntityId === pb.legalEntityId && fyOf(exitedOn) === fyOf(joining), options };
  }

  async rehire(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const pb = await this.joiner(tx, c, v, id);
      if (pb.personType !== 'rehire') throw new NotFoundException('This joiner is not a rehire.');
      const o = await this.rehireOptionsIn(tx, c, pb);
      const k = await tx.exitCase.findFirst({ where: { organizationId: c.organizationId, employmentId: o.prev.id }, orderBy: { createdAt: 'desc' } });
      // YX-LC-29: HR sees whether they are eligible for rehire (yes / no; the reasons stay with the confidential key).
      let eligible: boolean | null = null;
      if (k) {
        await tx.$executeRaw`SELECT set_config('app.lifecycle_confidential', 'on', true)`;
        eligible = (await tx.exitCaseHr.findUnique({ where: { exitCaseId: k.id }, select: { rehireEligible: true } }))?.rehireEligible ?? null;
        await tx.$executeRaw`SELECT set_config('app.lifecycle_confidential', 'off', true)`;
      }
      return {
        previous: { employeeCode: o.prev.employeeCode, joinedOn: iso(o.prev.joinedOn), exitedOn: o.exitedOn, exitType: k?.exitType ?? null, rehireEligible: eligible, breakMonths: o.breakMonths, sameEntityFy: o.sameEntityFy },
        options: o.options,
        version: pb.version,
      };
    });
  }

  async setRehire(ctx: TenantContext, user: ScopeUser, id: string, dto: { overrides: Record<string, { value: string; reason?: string | null }>; version: number }) {
    const v = await this.viewer(user);
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const pb = await this.joiner(tx, c, v, id);
      if (pb.personType !== 'rehire' || pb.status !== 'invited') throw new ConflictException('Only a rehire waiting to join has rehire options.');
      if (pb.version !== dto.version) throw new ConflictException('Someone else changed this joiner. Reload it.');
      const next: Record<string, { value: string; reason: string }> = {};
      for (const [key, x] of Object.entries(dto.overrides)) {
        if (!(REHIRE_OPTIONS as readonly string[]).includes(key) || !SETTINGS[`rehire.${key}`].values.includes(x.value)) throw new BadRequestException(`No such rehire choice: ${key}.`);
        const policy = await settingFor(tx, c, `rehire.${key}`, { legalEntityId: pb.legalEntityId });
        if (x.value === policy) continue;
        if (!x.reason || x.reason.trim().length < 3) throw new BadRequestException(`Say why "${key.replace(/_/g, ' ')}" differs from the company policy.`);
        next[key] = { value: x.value, reason: x.reason.trim().slice(0, 300) };
      }
      await tx.preboarding.update({ where: { id }, data: { rehireOverrides: next, version: { increment: 1 } } });
      await audit(tx, c, 'preboarding.rehire.options', 'preboarding', id, { overrides: Object.fromEntries(Object.entries(next).map(([k, x]) => [k, { value: x.value, reason: x.reason }])) });
    });
    return this.rehire(ctx, user, id);
  }

  /** At joining: the options in force (snapshot), the code to reuse and whether probation applies. */
  async rehireAtJoining(tx: Tx, c: CompanyContext, pb: Prisma.PreboardingGetPayload<object>) {
    const o = await this.rehireOptionsIn(tx, c, pb);
    const val = (k: RehireOption) => o.options.find((x) => x.key === k)!.value;
    const skipProbation = val('probation') === 'never' || (val('probation') === 'skip_if_break_lt_6m' && o.breakMonths < 6);
    const snapshot = Object.fromEntries(o.options.map((x) => [x.key, { value: x.value, overridden: x.overridden, reason: x.reason }]));
    return { rehireOf: o.prev.id, employeeCode: val('code') === 'reuse' ? o.prev.employeeCode : null, skipProbation, snapshot };
  }

  // ------------------------------------------------------------------------------------------ buddy (LIFE-5.03)

  async setBuddy(ctx: TenantContext, user: ScopeUser, id: string, dto: { employeeId: string | null; version: number }) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const pb = await this.joiner(tx, c, v, id);
      if (pb.version !== dto.version) throw new ConflictException('Someone else changed this joiner. Reload it.');
      let userId: string | null = null;
      if (dto.employeeId) {
        if (dto.employeeId === pb.managerEmployeeId) throw new BadRequestException('The manager cannot also be the buddy. Choose a colleague.');
        const e = await tx.employee.findFirst({ where: { organizationId: org, id: dto.employeeId } });
        if (!e || e.personId === pb.personId || !(await tx.employment.findFirst({ where: { organizationId: org, employeeId: e.id, exitedOn: null }, select: { id: true } }))) throw new BadRequestException('Choose a current employee as the buddy.');
        userId = e.userId;
      }
      await tx.preboarding.update({ where: { id }, data: { buddyEmployeeId: dto.employeeId, version: { increment: 1 } } });
      // The buddy's checklist tasks follow (the HR owner holds them while there is no buddy or the buddy has no login).
      const j = await tx.journey.findFirst({ where: { organizationId: org, subjectType: 'preboarding', subjectId: id } });
      if (j) await tx.journeyTask.updateMany({ where: { organizationId: org, journeyId: j.id, ownerType: 'buddy', status: { in: ['open', 'waiting'] } }, data: { assigneeUserId: userId ?? j.ownerUserId, version: { increment: 1 } } });
      await audit(tx, c, 'preboarding.buddy', 'preboarding', id, { buddyEmployeeId: dto.employeeId });
      return { buddyEmployeeId: dto.employeeId };
    });
  }

  // ------------------------------------------------------------------------------------------ campus batches (LIFE-5.02)

  private async mayManageEntity(v: Viewer, legalEntityId: string) {
    if (!v.grants.has('lifecycle.onboarding.manage') || v.actingForOther) throw new ForbiddenException('You cannot manage joiners.');
    if (tenantWide(v, 'lifecycle.onboarding.manage')) return;
    if (!(v.scopes.get('lifecycle.onboarding.manage') ?? []).some((s) => s.type === 'legal_entity' && s.id === legalEntityId)) throw new ForbiddenException('You cannot manage joiners of that legal entity.');
  }

  async batches(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    if (!v.grants.has('lifecycle.onboarding.view') && !v.grants.has('lifecycle.onboarding.manage')) throw new ForbiddenException('You cannot see joiners.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.joinerBatch.findMany({ where: { organizationId: c.organizationId }, orderBy: { joiningOn: 'desc' }, take: 200 });
      const out = [];
      for (const b of rows) {
        const members = await tx.preboarding.findMany({ where: { organizationId: c.organizationId, batchId: b.id, status: { not: 'cancelled' } } });
        const visible = [];
        for (const m of members) {
          const sees = (await joinerInScope(tx, c, v, 'lifecycle.onboarding.view', m)) || (await joinerInScope(tx, c, v, 'lifecycle.onboarding.manage', m));
          if (sees) visible.push(m);
        }
        const people = await tx.person.findMany({ where: { organizationId: c.organizationId, id: { in: visible.map((m) => m.personId) } } });
        out.push({
          id: b.id,
          name: b.name,
          legalEntityId: b.legalEntityId,
          joiningOn: iso(b.joiningOn),
          touchpoints: b.touchpoints,
          status: b.status,
          version: b.version,
          members: visible.map((m) => ({ id: m.id, personId: m.personId, name: displayName(people.find((p) => p.id === m.personId)!), status: m.status, joiningOn: iso(m.joiningOn) })),
        });
      }
      return { today: todayIst(), rows: out };
    });
  }

  async saveBatch(ctx: TenantContext, user: ScopeUser, id: string | null, dto: BatchInput & { reason?: string; version?: number }) {
    const v = await this.viewer(user);
    await this.mayManageEntity(v, dto.legalEntityId);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      if (dto.joiningOn < todayIst()) throw new BadRequestException('The batch joins today or later.');
      for (const t of dto.touchpoints ?? []) if (t.on > dto.joiningOn) throw new BadRequestException('Touchpoints are before the joining day.');
      if (!(await tx.legalEntity.findFirst({ where: { organizationId: org, id: dto.legalEntityId }, select: { id: true } }))) throw new BadRequestException('No such legal entity.');
      if (!id) {
        const b = await tx.joinerBatch.create({ data: { organizationId: org, name: dto.name.trim(), legalEntityId: dto.legalEntityId, joiningOn: new Date(`${dto.joiningOn}T00:00:00Z`), touchpoints: (dto.touchpoints ?? []) as Prisma.InputJsonValue, createdBy: c.userId ?? null } });
        await audit(tx, c, 'batch.created', 'joiner_batch', b.id, { joiningOn: dto.joiningOn });
        return { id: b.id, moved: 0 };
      }
      const b = await tx.joinerBatch.findFirst({ where: { organizationId: org, id } });
      if (!b) throw new NotFoundException('No such batch.');
      if (b.version !== dto.version) throw new ConflictException('Someone else changed this batch. Reload it.');
      await tx.joinerBatch.update({ where: { id }, data: { name: dto.name.trim(), joiningOn: new Date(`${dto.joiningOn}T00:00:00Z`), touchpoints: (dto.touchpoints ?? []) as Prisma.InputJsonValue, version: { increment: 1 } } });
      // A new batch day moves every member waiting to join, and their checklists (YX-LC-13).
      let moved = 0;
      if (iso(b.joiningOn) !== dto.joiningOn) {
        if (!dto.reason || dto.reason.trim().length < 3) throw new BadRequestException('Say why the batch joining day moves.');
        for (const m of await tx.preboarding.findMany({ where: { organizationId: org, batchId: id, status: 'invited' } })) {
          await this.joiners.moveIn(tx, c, m, dto.joiningOn, `Batch day moved: ${dto.reason}`);
          moved++;
        }
      }
      await audit(tx, c, 'batch.updated', 'joiner_batch', id, { joiningOn: dto.joiningOn, moved });
      return { id, moved };
    });
  }

  async addMembers(ctx: TenantContext, user: ScopeUser, id: string, preboardingIds: string[]) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const b = await tx.joinerBatch.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!b) throw new NotFoundException('No such batch.');
      await this.mayManageEntity(v, b.legalEntityId);
      let n = 0;
      for (const pid of preboardingIds) {
        const pb = await this.joiner(tx, c, v, pid);
        if (pb.status !== 'invited') continue;
        if (pb.legalEntityId !== b.legalEntityId) throw new BadRequestException('A batch member joins the batch’s legal entity.');
        await tx.preboarding.update({ where: { id: pid }, data: { batchId: id, version: { increment: 1 } } });
        if (iso(pb.joiningOn) !== iso(b.joiningOn)) await this.joiners.moveIn(tx, c, { ...pb, version: pb.version + 1 }, iso(b.joiningOn), 'Joined the batch');
        n++;
      }
      await audit(tx, c, 'batch.members_added', 'joiner_batch', id, { count: n });
      return { added: n };
    });
  }

  /** A letter of intent to every member waiting to join (each through the ordinary letter issue, checks included). */
  async sendLoi(ctx: TenantContext, user: ScopeUser, id: string) {
    const members = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const b = await tx.joinerBatch.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!b) throw new NotFoundException('No such batch.');
      return tx.preboarding.findMany({ where: { organizationId: c.organizationId, batchId: id, status: 'invited' }, select: { id: true, personId: true } });
    });
    const out = { issued: 0, failed: [] as { preboardingId: string; message: string }[] };
    for (const m of members) {
      try {
        await this.letters.issue(ctx, user, { letterType: 'letter_of_intent', personId: m.personId, subjectType: 'preboarding', subjectId: m.id });
        out.issued++;
      } catch (e) {
        out.failed.push({ preboardingId: m.id, message: (e as Error).message });
      }
    }
    return out;
  }
}
