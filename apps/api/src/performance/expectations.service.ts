import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { ScopeUser, buildViewer, covers, implicitPeriods, started } from '../access/scope';

// T2-C item 68 (answer 2842): "What is expected of me", read-only. The competencies set for the person's designation today
// (from the PRF-14 framework: the expected level, its behaviours), then the company's core values. No ratings. The person
// sees their own; a manager (the chain above, as for reviews) sees the same page for each report.

const lines = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean);
const name = (e: { givenName: string; familyName: string | null; preferredName: string | null }) => [e.preferredName || e.givenName, e.familyName].filter(Boolean).join(' ');

@Injectable()
export class PerformanceExpectationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  async expectations(ctx: TenantContext, user: ScopeUser, employeeId?: string) {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, []);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIst();
      const me = v.userId && !v.actingForOther ? ((await tx.employee.findFirst({ where: { organizationId: org, userId: v.userId }, select: { id: true } }))?.id ?? null) : null;
      const target = employeeId ?? me;
      // Someone else's page: only for the manager chain above them today (as their reviews are); else as if it did not exist.
      if (!target || (target !== me && !covers(started(await implicitPeriods(tx, c, me, target), today), today))) throw new NotFoundException('No such person.');
      const person = await tx.employee.findFirst({ where: { organizationId: org, id: target }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
      if (!person) throw new NotFoundException('No such person.');
      const [a] = await tx.$queryRaw<{ designation_id: string | null }[]>`
        SELECT a.designation_id::text FROM employee_assignments a WHERE a.organization_id = ${org}::uuid AND a.employee_id = ${target}::uuid
          AND a.superseded_at IS NULL AND a.valid_from <= ${today}::date AND (a.valid_to IS NULL OR a.valid_to >= ${today}::date) ORDER BY a.valid_from DESC LIMIT 1`;
      const designationId = a?.designation_id ?? null;
      const designation = designationId ? await tx.designation.findFirst({ where: { organizationId: org, id: designationId }, select: { name: true } }) : null;
      const day = new Date(`${today}T00:00:00Z`);
      const maps = designationId ? await tx.roleCompetencyMap.findMany({ where: { organizationId: org, designationId, validFrom: { lte: day }, OR: [{ validTo: null }, { validTo: { gte: day } }] } }) : [];
      const comps = await tx.competency.findMany({ where: { organizationId: org, id: { in: maps.map((m) => m.competencyId) }, status: 'active' } });
      const skills = new Map((await tx.companySkill.findMany({ where: { organizationId: org, id: { in: comps.map((x) => x.companySkillId) } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
      const levels = await tx.competencyLevel.findMany({ where: { organizationId: org, competencyId: { in: comps.map((x) => x.id) } }, orderBy: { level: 'asc' } });
      const competencies = comps
        .map((x) => {
          const expected = maps.find((m) => m.competencyId === x.id)!.expectedLevel;
          const at = levels.find((l) => l.competencyId === x.id && l.level === expected);
          return { id: x.id, name: skills.get(x.companySkillId) ?? '', group: x.group, description: x.description, expectedLevel: expected, levelLabel: at?.label ?? null, behaviours: at?.behaviours ?? null, levels: levels.filter((l) => l.competencyId === x.id).length };
        })
        .sort((p, q) => p.group.localeCompare(q.group) || p.name.localeCompare(q.name));
      // The manager's pick list: their direct reports today (each opens the same page).
      const reports = me
        ? await tx.$queryRaw<{ id: string; given_name: string; family_name: string | null; preferred_name: string | null }[]>`
            SELECT e.id::text, e.given_name, e.family_name, e.preferred_name FROM employee_assignments a JOIN employees e ON e.organization_id = a.organization_id AND e.id = a.employee_id
              WHERE a.organization_id = ${org}::uuid AND a.manager_employee_id = ${me}::uuid AND a.superseded_at IS NULL
                AND a.valid_from <= ${today}::date AND (a.valid_to IS NULL OR a.valid_to >= ${today}::date) ORDER BY e.given_name`
        : [];
      return {
        employee: { id: person.id, name: name(person), designation: designation?.name ?? null, mine: target === me },
        competencies,
        values: lines(await settingFor(tx, c, 'engage.values', { legalEntityId: '' })),
        reports: reports.map((r) => ({ value: r.id, label: name({ givenName: r.given_name, familyName: r.family_name, preferredName: r.preferred_name }) })),
      };
    });
  }
}
