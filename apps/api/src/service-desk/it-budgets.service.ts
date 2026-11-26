import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';

// GLPI 7 (answer 2719): each department's yearly IT budget (the financial year from April, as the training budgets) with
// what IT desks spent on it: logged time at the rate kept on each entry, plus fixed and material cost lines not taken
// off, each charged to the department kept with it. Costs with no department (outside requesters) show as one row.

const fyOf = (iso: string) => (Number(iso.slice(5, 7)) >= 4 ? Number(iso.slice(0, 4)) : Number(iso.slice(0, 4)) - 1);

@Injectable()
export class ItBudgetsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** The year's budgets with spent (time and cost lines) and left, for every department that has a budget or a cost. */
  budgets(ctx: TenantContext, year?: number) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const fy = year ?? fyOf(todayIst());
      const from = `${fy}-04-01`;
      const to = `${fy + 1}-03-31`;
      const time = await tx.$queryRaw<{ department_id: string | null; amount: Prisma.Decimal }[]>`
        SELECT e.department_id::text AS department_id, sum(e.hourly_rate * e.minutes / 60.0)::numeric(14,2) AS amount
        FROM sd_time_entries e JOIN sd_desks d ON d.organization_id = e.organization_id AND d.id = e.desk_id AND d.kind = 'it'
        WHERE e.organization_id = ${org}::uuid AND e.hourly_rate IS NOT NULL AND e.worked_on BETWEEN ${from}::date AND ${to}::date
        GROUP BY 1`;
      const lines = await tx.$queryRaw<{ department_id: string | null; amount: Prisma.Decimal }[]>`
        SELECT l.department_id::text AS department_id, sum(l.amount)::numeric(14,2) AS amount
        FROM sd_cost_lines l WHERE l.organization_id = ${org}::uuid AND l.removed_at IS NULL AND l.cost_on BETWEEN ${from}::date AND ${to}::date
        GROUP BY 1`;
      const plans = await tx.sdItBudget.findMany({ where: { organizationId: org, year: fy } });
      const depts = await tx.department.findMany({ where: { organizationId: org }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
      const spentOf = (id: string | null) => [...time, ...lines].filter((r) => r.department_id === id).reduce((s, r) => s.add(r.amount ?? 0), new Prisma.Decimal(0));
      const timeOf = (id: string | null) => time.filter((r) => r.department_id === id).reduce((s, r) => s.add(r.amount ?? 0), new Prisma.Decimal(0));
      const rows = depts
        .map((d) => {
          const budget = plans.find((p) => p.departmentId === d.id)?.amount ?? null;
          const spent = spentOf(d.id);
          return { departmentId: d.id, department: d.name, budget: budget?.toFixed(2) ?? null, time: timeOf(d.id).toFixed(2), lines: spent.sub(timeOf(d.id)).toFixed(2), spent: spent.toFixed(2), left: budget ? budget.sub(spent).toFixed(2) : null };
        })
        .filter((r) => r.budget !== null || Number(r.spent) > 0);
      const none = spentOf(null);
      return {
        year: fy,
        rows,
        noDepartment: none.gt(0) ? { time: timeOf(null).toFixed(2), lines: none.sub(timeOf(null)).toFixed(2), spent: none.toFixed(2) } : null,
        departments: depts.map((d) => ({ value: d.id, label: d.name })),
      };
    });
  }

  async setBudget(ctx: TenantContext, dto: { departmentId: string; year: number; amount: string }) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      if (!(await tx.department.count({ where: { organizationId: org, id: dto.departmentId } }))) throw new BadRequestException('Choose a department of this company.');
      const was = await tx.sdItBudget.findFirst({ where: { organizationId: org, departmentId: dto.departmentId, year: dto.year } });
      await tx.sdItBudget.upsert({
        where: { departmentId_year: { departmentId: dto.departmentId, year: dto.year } },
        create: { organizationId: org, departmentId: dto.departmentId, year: dto.year, amount: dto.amount, updatedBy: c.userId! },
        update: { amount: dto.amount, updatedBy: c.userId!, updatedAt: new Date() },
      });
      await audit(tx, c, 'desk.it_budget.set', 'department', dto.departmentId, { year: dto.year, from: was?.amount.toFixed(2) ?? null, to: dto.amount });
      return { ok: true };
    });
  }
}
