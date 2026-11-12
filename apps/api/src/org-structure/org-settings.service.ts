import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { assertDefaultRecruiter } from '../hiring/recruiter-key';
import { ResolveSettingQueryDto, SettingDto } from './dto';
import { asDate, isoDate, todayIst } from './org-validation';
import { audit, CompanyContext, inCompany, Tx } from './org-structure.service';
import { PAYROLL_APPROVAL_KEYS, ScopeContext, ScopeType, SECOND_PERSON_KEY, SETTINGS, SettingDef, SettingRow, resolveSetting } from './settings-registry';

// P01 §4.6 scoped settings (YX-ORG-12, YX-ORG-18): overrides per scope, resolved most-specific first, every
// value shown with where it comes from.

/** The table behind each scope that exists today; pay groups arrive with M03. */
const SCOPE_MODEL: Partial<Record<ScopeType, 'legalEntity' | 'location' | 'department' | 'employmentType' | 'grade' | 'designation' | 'employee'>> = {
  legal_entity: 'legalEntity',
  location: 'location',
  department: 'department',
  employment_type: 'employmentType',
  grade: 'grade',
  designation: 'designation',
  employee: 'employee',
};

type Row = { id: string; scopeType: string; scopeId: string; key: string; value: unknown; validFrom: Date | null; updatedAt: Date };
const rowView = (r: Row): SettingRow & { key: string; updatedAt: Date } => ({
  id: r.id,
  key: r.key,
  scopeType: r.scopeType,
  scopeId: r.scopeId,
  value: r.value,
  validFrom: r.validFrom ? isoDate(r.validFrom) : null,
  updatedAt: r.updatedAt,
});

function definition(key: string): SettingDef {
  const def = SETTINGS[key];
  if (!def) throw new BadRequestException(`Unknown setting ${key}`);
  return def;
}

/**
 * YX-ORG-16: switching how employee codes are unique re-keys every employment, so one unique index keeps
 * serving both modes. Company-wide uniqueness is refused while two employments share a code; the clashes are
 * listed so they can be fixed first.
 */
async function rekeyEmployeeCodes(tx: Tx, c: CompanyContext, scope: unknown): Promise<void> {
  if (scope === 'tenant') {
    const clashes = await tx.$queryRaw<{ code: string; employees: { id: string; name: string; legalEntity: string }[] }[]>`
      SELECT m.employee_code::text AS code,
             json_agg(json_build_object('id', e.id, 'name', concat_ws(' ', e.given_name, e.family_name), 'legalEntity', le.name) ORDER BY le.name) AS employees
      FROM employments m
      JOIN employees e ON e.organization_id = m.organization_id AND e.id = m.employee_id
      JOIN legal_entities le ON le.organization_id = m.organization_id AND le.id = m.legal_entity_id
      WHERE m.organization_id = ${c.organizationId}::uuid
      GROUP BY m.employee_code HAVING count(*) > 1 ORDER BY 1 LIMIT 100`;
    if (clashes.length) {
      throw new ConflictException({ statusCode: 409, code: 'EMPLOYEE_CODE_CLASHES', message: 'Some employee codes are used in more than one legal entity. Change them first (YX-ORG-16).', clashes });
    }
    await tx.$executeRaw`UPDATE employments SET code_scope_key = organization_id, updated_at = now() WHERE organization_id = ${c.organizationId}::uuid AND code_scope_key <> organization_id`;
  } else {
    await tx.$executeRaw`UPDATE employments SET code_scope_key = legal_entity_id, updated_at = now() WHERE organization_id = ${c.organizationId}::uuid AND code_scope_key <> legal_entity_id`;
  }
}

/** Founder 30 Oct 2026: the lowest bonus rate may not be saved above the highest (and the reverse), at the same scope or
 * against the company-wide value it inherits. Refused at save, not only when the bonus is worked out. */
const RATE_PAIR: Record<string, string> = { 'payroll.bonus.min_rate': 'payroll.bonus.max_rate', 'payroll.bonus.max_rate': 'payroll.bonus.min_rate' };
async function bonusRatesInOrder(tx: Tx, org: string, key: string, value: string, scopeType: ScopeType, scopeId: string) {
  const other = RATE_PAIR[key];
  if (!other) return;
  const here = await tx.setting.findFirst({ where: { organizationId: org, key: other, scopeType, scopeId } });
  const company = here ?? (scopeType === 'tenant' ? null : await tx.setting.findFirst({ where: { organizationId: org, key: other, scopeType: 'tenant' } }));
  const otherValue = Number(company?.value ?? SETTINGS[other].default);
  const [min, max] = key === 'payroll.bonus.min_rate' ? [Number(value), otherValue] : [otherValue, Number(value)];
  if (min > max)
    throw new BadRequestException(
      key === 'payroll.bonus.min_rate' ? `The lowest bonus rate (${value}%) can't be above the highest (${otherValue}%). Lower it, or raise the highest first.` : `The highest bonus rate (${value}%) can't be below the lowest (${otherValue}%). Raise it, or lower the lowest first.`,
    );
}


/** Answer 1324: the legal floor or ceiling of a setting, from the country's rule set (YukthiX sets it, never the company). */
export type SettingLimit = { min?: number; max?: number; act: string };
export const LIMITS_STATUTE = 'IN.SETTINGS.LIMITS';
export async function settingLimits(tx: Tx): Promise<Record<string, SettingLimit>> {
  const today = asDate(todayIst());
  const rs = await tx.statutoryRuleSet.findFirst({ where: { statute: LIMITS_STATUTE, jurisdiction: 'IN', status: 'published', validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }] }, orderBy: [{ validFrom: 'desc' }, { publishedAt: 'desc' }] }); // versions from the same day: the latest published
  return ((rs?.values ?? {}) as { limits?: Record<string, SettingLimit> }).limits ?? {};
}

/** The refusal for a value past its legal limit, naming the Act; null when the law allows it (more generous is fine). */
export function pastLimit(label: string, value: string, limit: SettingLimit | undefined): string | null {
  const n = Number(value);
  if (!limit || value.trim() === '' || Number.isNaN(n)) return null;
  if (limit.max != null && n > limit.max) return `${label} can be at most ${limit.max} by law (${limit.act}). Choose ${limit.max} or less.`;
  if (limit.min != null && n < limit.min) return `${label} must be at least ${limit.min} by law (${limit.act}). Choose ${limit.min} or more.`;
  return null;
}

/** Answer 1325: whether a change to this setting waits for a second person (payroll settings, while the switch is on). */
async function secondPersonNeeded(tx: Tx, org: string, key: string): Promise<boolean> {
  if (!PAYROLL_APPROVAL_KEYS.has(key)) return false;
  const row = await tx.setting.findFirst({ where: { organizationId: org, key: SECOND_PERSON_KEY, scopeType: 'tenant', validFrom: null } });
  return String(row?.value ?? SETTINGS[SECOND_PERSON_KEY]!.default) === 'on';
}

/** The registry with the platform lists filled in (HLP-14: the industries a company may choose). */
async function withLists(tx: Tx): Promise<Record<string, SettingDef>> {
  const industries = await tx.policyIndustry.findMany({ where: { active: true }, orderBy: [{ sort: 'asc' }, { label: 'asc' }] });
  const out: Record<string, SettingDef> = { ...SETTINGS };
  for (const [k, def] of Object.entries(SETTINGS))
    if (def.oneOf === 'policy_industries') out[k] = { ...def, values: [...def.values, ...industries.map((i) => i.code)], labels: { ...def.labels, ...Object.fromEntries(industries.map((i) => [i.code, i.label])) } };
  return out;
}

@Injectable()
export class OrgSettingsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
  ) {}

  private async scopeExists(tx: Tx, c: CompanyContext, scopeType: ScopeType, scopeId: string, mustBeActive: boolean): Promise<{ legalEntityId?: string }> {
    const model = SCOPE_MODEL[scopeType];
    if (!model) throw new BadRequestException(`Settings for ${scopeType.replace('_', ' ')} are not available yet.`);
    const row = (await (tx[model] as unknown as { findFirst(a: unknown): Promise<{ archivedAt: Date | null; legalEntityId?: string } | null> }).findFirst({
      where: { id: scopeId, organizationId: c.organizationId },
    }));
    if (!row) throw new NotFoundException(`No such ${scopeType.replace('_', ' ')} in this company`);
    if (mustBeActive && row.archivedAt) throw new BadRequestException(`That ${scopeType.replace('_', ' ')} is archived.`);
    return { legalEntityId: row.legalEntityId };
  }

  /** The registry with every override, for the settings screens. */
  list(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.setting.findMany({ where: { organizationId: c.organizationId }, orderBy: [{ key: 'asc' }, { scopeType: 'asc' }, { validFrom: 'asc' }] });
      // Answer 1325: payroll changes waiting for a second person, with who asked (mine: the viewer asked, so may only withdraw).
      const waiting = await tx.settingChangeRequest.findMany({ where: { organizationId: c.organizationId, status: 'pending' }, orderBy: { requestedAt: 'asc' } });
      const names = new Map((await tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: waiting.map((w) => w.requestedBy) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
      const pending = waiting.map((w) => ({ id: w.id, key: w.key, scopeType: w.scopeType, scopeId: w.scopeId, from: w.previous, to: w.value, by: names.get(w.requestedBy) ?? 'Someone', at: w.requestedAt, mine: w.requestedBy === c.userId }));
      // Answer 151: a location's own Factories Act value is no longer needed once the location is a registered factory.
      const flagged = new Set((await tx.location.findMany({ where: { organizationId: c.organizationId, registeredFactory: true }, select: { id: true } })).map((l) => l.id));
      return { registry: await withLists(tx), limits: await settingLimits(tx), pending, overrides: rows.map((r) => ({ ...rowView(r), ...(r.key === 'attendance.factories_act' && r.scopeType === 'location' && flagged.has(r.scopeId) ? { noLongerNeeded: 'registered_factory' as const } : {}) })) };
    });
  }

  async set(ctx: TenantContext, dto: SettingDto) {
    const def = definition(dto.key);
    if (def.platform) throw new ForbiddenException(`Only YukthiX changes "${def.label}": it comes with your plan. Ask YukthiX support.`);
    // Answer 348: the default recruiter is none or an active person of the company who holds the recruiter key (400).
    if (def.oneOf === 'company_users' && dto.key === 'hiring.requisition.default_recruiter' && ctx.organizationId) await assertDefaultRecruiter(this.prisma, this.tenantPrisma, ctx.organizationId, dto.value);
    const scopeType = dto.scopeType as ScopeType;
    if (!def.scopes.includes(scopeType)) throw new BadRequestException(`${def.label} cannot be set per ${scopeType.replace('_', ' ')}.`);
    if (def.text) {
      dto.value = dto.value.replace(/\r\n?/g, '\n').trim();
      if (!dto.value) throw new BadRequestException(`Write what goes in "${def.label}", one thing a line.`);
      if (dto.value.length > def.text.maxLength) throw new BadRequestException(`"${def.label}" is ${dto.value.length} characters. Keep it to ${def.text.maxLength} or fewer.`);
    } else if (def.oneOf) {
      // Checked against the platform list below, inside the company's transaction.
    } else {
      const parts = def.multi ? (dto.value ? dto.value.split(',') : []) : [dto.value];
      if (!parts.every((p) => def.values.includes(p)) || new Set(parts).size !== parts.length) throw new BadRequestException(`${def.label} is ${def.multi ? 'any of' : 'one of'}: ${def.values.join(', ')}`);
    }
    // YX-ORG-18: a dated setting always carries its start date; a plain one never does.
    if (def.dated && !dto.validFrom) throw new BadRequestException(`${def.label} is dated: give the date it applies from.`);
    if (!def.dated && dto.validFrom) throw new BadRequestException(`${def.label} is not dated.`);
    if (scopeType === 'tenant' && dto.scopeId) throw new BadRequestException('A company-wide setting has no scope id.');
    if (scopeType !== 'tenant' && !dto.scopeId) throw new BadRequestException('Say which record the setting is for.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if (def.oneOf === 'company_users' && dto.key !== 'hiring.requisition.default_recruiter') {
        // Answer 332: one of the setting's own words ("HR head", "hiring manager") or an active person of this company
        // (the default recruiter is checked above, answer 348).
        if (!def.values.includes(dto.value) && !(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dto.value) && (await tx.user.findFirst({ where: { organizationId: c.organizationId, id: dto.value, status: 'active' }, select: { id: true } }))))
          throw new NotFoundException('That person is not an active user of your company. Choose someone from the list.');
      } else if (def.oneOf && def.oneOf !== 'company_users' && !(await withLists(tx))[dto.key].values.includes(dto.value)) throw new BadRequestException(`Choose ${def.label.toLowerCase()} from the list.`);
      const tooFar = pastLimit(def.label, dto.value, (await settingLimits(tx))[dto.key]);
      if (tooFar) throw new BadRequestException(tooFar);
      const scopeId = scopeType === 'tenant' ? c.organizationId : dto.scopeId!;
      if (scopeType !== 'tenant') await this.scopeExists(tx, c, scopeType, scopeId, true);
      const validFrom = dto.validFrom ? asDate(dto.validFrom) : null;
      const where = { organizationId: c.organizationId, key: dto.key, scopeType, scopeId, validFrom };
      const existing = await tx.setting.findFirst({ where });
      await bonusRatesInOrder(tx, c.organizationId, dto.key, dto.value, scopeType, scopeId);
      if (existing && def.dated && dto.validFrom! <= todayIst()) {
        throw new ConflictException('That value is already in force. Add the new value from a later date instead (YX-HIS-07).');
      }
      // Answer 1325: a payroll setting waits for a second person; nothing changes until they approve.
      if (await secondPersonNeeded(tx, c.organizationId, dto.key)) {
        if (await tx.settingChangeRequest.findFirst({ where: { organizationId: c.organizationId, key: dto.key, scopeType, scopeId, status: 'pending' } }))
          throw new ConflictException(`A change to "${def.label}" is already waiting for a second person. Approve or reject it first.`);
        const r = await tx.settingChangeRequest.create({ data: { organizationId: c.organizationId, key: dto.key, scopeType, scopeId, value: dto.value, ...(existing ? { previous: existing.value as Prisma.InputJsonValue } : {}), requestedBy: c.userId! } });
        await audit(tx, c, 'org.setting.change_requested', 'setting_change_request', r.id, { key: dto.key, scopeType, scopeId, from: existing?.value ?? null, to: dto.value });
        return { pending: true as const, id: r.id, key: dto.key };
      }
      const row = existing
        ? await tx.setting.update({ where: { id: existing.id }, data: { value: dto.value, updatedBy: c.userId } })
        : await tx.setting.create({ data: { ...where, value: dto.value, updatedBy: c.userId } });
      if (dto.key === 'employee_code.scope') await rekeyEmployeeCodes(tx, c, dto.value);
      // A guarded key loosens an approval, retro, access or fraud control: recorded as a control change (P08).
      await audit(tx, c, 'org.setting.changed', 'setting', row.id, { key: dto.key, scopeType, scopeId, validFrom: dto.validFrom ?? null, from: existing?.value ?? null, to: dto.value, control: Boolean(SETTINGS[dto.key]?.guard) });
      return rowView(row);
    });
  }

  /** The setting and scope a waiting change is for (the controller checks the keys for it). */
  request(ctx: TenantContext, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await tx.settingChangeRequest.findFirst({ where: { id, organizationId: c.organizationId, status: 'pending' } });
      if (!r) throw new NotFoundException('No change with this reference is waiting for approval.');
      return { key: r.key, scopeType: r.scopeType, scopeId: r.scopeId, value: String(r.value), requestedBy: r.requestedBy };
    });
  }

  /** Answer 1325: a second person approves; the value applies now, checked against the law again. Never the person who asked. */
  approve(ctx: TenantContext, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await tx.settingChangeRequest.findFirst({ where: { id, organizationId: c.organizationId } });
      if (!r || r.status !== 'pending') throw new NotFoundException('No change with this reference is waiting for approval.');
      if (r.requestedBy === c.userId) throw new ForbiddenException("You asked for this change: another person with HR's settings key approves it.");
      const def = definition(r.key);
      const value = String(r.value);
      const tooFar = pastLimit(def.label, value, (await settingLimits(tx))[r.key]);
      if (tooFar) throw new BadRequestException(tooFar);
      const done = await tx.settingChangeRequest.updateMany({ where: { id, status: 'pending' }, data: { status: 'approved', decidedBy: c.userId, decidedAt: new Date() } });
      if (!done.count) throw new ConflictException('This change was already decided.');
      const where = { organizationId: c.organizationId, key: r.key, scopeType: r.scopeType, scopeId: r.scopeId, validFrom: null };
      const existing = await tx.setting.findFirst({ where });
      const row = existing ? await tx.setting.update({ where: { id: existing.id }, data: { value, updatedBy: c.userId } }) : await tx.setting.create({ data: { ...where, value, updatedBy: c.userId } });
      await audit(tx, c, 'org.setting.change_approved', 'setting_change_request', id, { key: r.key, to: value, requestedBy: r.requestedBy });
      await audit(tx, c, 'org.setting.changed', 'setting', row.id, { key: r.key, scopeType: r.scopeType, scopeId: r.scopeId, validFrom: null, from: existing?.value ?? null, to: value, control: Boolean(def.guard), requestedBy: r.requestedBy, approvedBy: c.userId, requestId: id });
      return rowView(row);
    });
  }

  /** Answer 1325: anyone with the key rejects a waiting change; the person who asked withdraws it the same way. */
  reject(ctx: TenantContext, id: string, note?: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await tx.settingChangeRequest.findFirst({ where: { id, organizationId: c.organizationId } });
      if (!r || r.status !== 'pending') throw new NotFoundException('No change with this reference is waiting for approval.');
      const done = await tx.settingChangeRequest.updateMany({ where: { id, status: 'pending' }, data: { status: 'rejected', decidedBy: c.userId, decidedAt: new Date(), note: note?.trim() || null } });
      if (!done.count) throw new ConflictException('This change was already decided.');
      await audit(tx, c, 'org.setting.change_rejected', 'setting_change_request', id, { key: r.key, to: r.value, requestedBy: r.requestedBy, withdrawn: r.requestedBy === c.userId, note: note?.trim() || null });
    });
  }

  /** Back to the inherited value. A dated value already in force stays (YX-HIS-07). */
  remove(ctx: TenantContext, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const row = await tx.setting.findFirst({ where: { id, organizationId: c.organizationId } });
      if (!row) throw new NotFoundException('Setting not found');
      if (SETTINGS[row.key]?.platform) throw new ForbiddenException(`Only YukthiX changes "${SETTINGS[row.key]!.label}": it comes with your plan. Ask YukthiX support.`);
      if (row.validFrom && isoDate(row.validFrom) <= todayIst()) {
        throw new ConflictException('That value is already in force. Add a new value from a later date instead (YX-HIS-07).');
      }
      await tx.setting.delete({ where: { id } });
      if (row.key === 'employee_code.scope') await rekeyEmployeeCodes(tx, c, SETTINGS['employee_code.scope'].default);
      await audit(tx, c, 'org.setting.removed', 'setting', id, { key: row.key, scopeType: row.scopeType, scopeId: row.scopeId, validFrom: row.validFrom ? isoDate(row.validFrom) : null, value: row.value, control: Boolean(SETTINGS[row.key]?.guard) });
    });
  }

  /**
   * The value in force for a context (YX-ORG-12 / 18). A location brings its legal entity. A dated key
   * needs the date being processed: it is never resolved "as of today" by default.
   */
  resolve(ctx: TenantContext, q: ResolveSettingQueryDto) {
    const def = definition(q.key);
    if (def.dated && !q.asOf) throw new BadRequestException(`${def.label} is dated: give the date being processed (asOf).`);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const context: ScopeContext = { tenant: c.organizationId };
      if (q.employeeId) {
        if (q.legalEntityId || q.locationId || q.departmentId || q.employmentTypeId || q.gradeId || q.designationId) {
          throw new BadRequestException('Give the employee or the scopes, not both.');
        }
        // YX-ORG-18: the employee's scopes are read from the assignment in force on the as-of date.
        const on = asDate(q.asOf ?? todayIst());
        const a = await tx.employeeAssignment.findFirst({
          where: { organizationId: c.organizationId, employeeId: q.employeeId, supersededAt: null, validFrom: { lte: on }, OR: [{ validTo: null }, { validTo: { gte: on } }] },
        });
        if (!a) throw new NotFoundException('That employee has no assignment on that date.');
        Object.assign(context, {
          employee: q.employeeId,
          designation: a.designationId,
          grade: a.gradeId ?? undefined,
          employment_type: a.employmentTypeId,
          department: a.departmentId,
          location: a.locationId,
          legal_entity: a.legalEntityId,
        });
      }
      const given: [ScopeType, string | undefined][] = [
        ['legal_entity', q.legalEntityId],
        ['location', q.locationId],
        ['department', q.departmentId],
        ['employment_type', q.employmentTypeId],
        ['grade', q.gradeId],
        ['designation', q.designationId],
      ];
      for (const [scopeType, id] of given) {
        if (!id) continue;
        const { legalEntityId } = await this.scopeExists(tx, c, scopeType, id, false);
        context[scopeType] = id;
        if (scopeType === 'location') {
          if (q.legalEntityId && q.legalEntityId !== legalEntityId) throw new BadRequestException('That location belongs to another legal entity.');
          context.legal_entity = legalEntityId;
        }
      }
      const rows = (await tx.setting.findMany({ where: { organizationId: c.organizationId, key: q.key } })).map(rowView);
      return { key: q.key, asOf: q.asOf ?? null, ...resolveSetting(def, rows, context, q.asOf ?? null) };
    });
  }
}
