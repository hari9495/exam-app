import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { ResolveSettingQueryDto, SettingDto } from './dto';
import { asDate, isoDate, todayIst } from './org-validation';
import { audit, CompanyContext, inCompany, Tx } from './org-structure.service';
import { ScopeContext, ScopeType, SETTINGS, SettingDef, SettingRow, resolveSetting } from './settings-registry';

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

@Injectable()
export class OrgSettingsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

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
      return { registry: SETTINGS, overrides: rows.map(rowView) };
    });
  }

  set(ctx: TenantContext, dto: SettingDto) {
    const def = definition(dto.key);
    const scopeType = dto.scopeType as ScopeType;
    if (!def.scopes.includes(scopeType)) throw new BadRequestException(`${def.label} cannot be set per ${scopeType.replace('_', ' ')}.`);
    if (!def.values.includes(dto.value)) throw new BadRequestException(`${def.label} is one of: ${def.values.join(', ')}`);
    // YX-ORG-18: a dated setting always carries its start date; a plain one never does.
    if (def.dated && !dto.validFrom) throw new BadRequestException(`${def.label} is dated: give the date it applies from.`);
    if (!def.dated && dto.validFrom) throw new BadRequestException(`${def.label} is not dated.`);
    if (scopeType === 'tenant' && dto.scopeId) throw new BadRequestException('A company-wide setting has no scope id.');
    if (scopeType !== 'tenant' && !dto.scopeId) throw new BadRequestException('Say which record the setting is for.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const scopeId = scopeType === 'tenant' ? c.organizationId : dto.scopeId!;
      if (scopeType !== 'tenant') await this.scopeExists(tx, c, scopeType, scopeId, true);
      const validFrom = dto.validFrom ? asDate(dto.validFrom) : null;
      const where = { organizationId: c.organizationId, key: dto.key, scopeType, scopeId, validFrom };
      const existing = await tx.setting.findFirst({ where });
      if (existing && def.dated && dto.validFrom! <= todayIst()) {
        throw new ConflictException('That value is already in force. Add the new value from a later date instead (YX-HIS-07).');
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

  /** Back to the inherited value. A dated value already in force stays (YX-HIS-07). */
  remove(ctx: TenantContext, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const row = await tx.setting.findFirst({ where: { id, organizationId: c.organizationId } });
      if (!row) throw new NotFoundException('Setting not found');
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
