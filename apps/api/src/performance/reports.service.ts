import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { ScopeUser, buildViewer, inScopeSql } from '../access/scope';
import { suppress, toCsv } from './calibration-rules';

// Performance batch PM6 (M06-BUILD-DESIGN §13; PM-6.03): reports of people in scope (perf.report.view), as JSON or CSV.
//   completion           reviews per department by where they are; totals equal the reviews (never suppressed)
//   distribution         bands per department; a cell under perf.report.min_cell people is suppressed
//   calibration-changes  every change with its reason (YX-PERF-08)
//   goal-alignment       person goals in the cycle's period per department and how many align to another goal;
//                        departments under the minimum are suppressed
//   pip-status           plans in the cycle's period per department and outcome; departments under the minimum are
//                        suppressed (PM8)

export type ReportKind = 'completion' | 'distribution' | 'calibration-changes' | 'goal-alignment' | 'pip-status';
const PIP_STATUSES = ['active', 'extended', 'met', 'not_met'] as const;
const STATUSES = ['open', 'in_calibration', 'ready', 'released', 'acknowledged', 'closed'] as const;

@Injectable()
export class PerformanceReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  private run<T>(ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>) {
    return inCompany(this.tenantPrisma, ctx, fn);
  }

  async report(ctx: TenantContext, user: ScopeUser, kind: ReportKind, cycleId: string) {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, ['perf.report.view']);
    if (!v.grants.has('perf.report.view') || v.actingForOther) throw new ForbiddenException('Performance reports need perf.report.view.');
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const cycle = await tx.reviewCycle.findFirst({ where: { organizationId: org, id: cycleId } });
      if (!cycle) throw new NotFoundException('No such cycle.');
      const today = todayIst();
      const me = v.userId ? ((await tx.employee.findFirst({ where: { organizationId: org, userId: v.userId }, select: { id: true } }))?.id ?? null) : null;
      const scope = inScopeSql(c, v, 'perf.report.view', Prisma.sql`r.employee_id`, Prisma.sql`${today}::date`, me);
      const min = Number(await settingFor(tx, c, 'perf.report.min_cell', { legalEntityId: '' }));
      const dept = Prisma.sql`COALESCE((SELECT d.name FROM employee_assignments a JOIN departments d ON d.organization_id = a.organization_id AND d.id = a.department_id
          WHERE a.organization_id = r.organization_id AND a.employee_id = r.employee_id AND a.superseded_at IS NULL AND a.valid_from <= ${today}::date
            AND (a.valid_to IS NULL OR a.valid_to >= ${today}::date) ORDER BY a.valid_from DESC LIMIT 1), 'No department')`;
      await audit(tx, c, 'perf.report.viewed', 'review_cycle', cycleId, { kind });

      if (kind === 'completion') {
        const rows = await tx.$queryRaw<{ department: string; status: string; n: bigint }[]>`
          SELECT ${dept} AS department, r.status, count(*) AS n FROM reviews r WHERE r.organization_id = ${org}::uuid AND r.cycle_id = ${cycleId}::uuid AND ${scope} GROUP BY 1, 2 ORDER BY 1`;
        const depts = [...new Set(rows.map((x) => x.department))];
        const data = depts.map((d) => ({ department: d, ...Object.fromEntries(STATUSES.map((s) => [s, Number(rows.find((x) => x.department === d && x.status === s)?.n ?? 0)])), total: rows.filter((x) => x.department === d).reduce((t, x) => t + Number(x.n), 0) }));
        return { kind, cycle: cycle.name, header: ['department', ...STATUSES, 'total'], rows: data.map((d) => [d.department, ...STATUSES.map((s) => (d as unknown as Record<string, number>)[s]), d.total]), total: data.reduce((t, d) => t + d.total, 0) };
      }

      if (kind === 'distribution') {
        const rows = await tx.$queryRaw<{ department: string; band: string | null; n: bigint }[]>`
          SELECT ${dept} AS department, r.band, count(*) AS n FROM reviews r WHERE r.organization_id = ${org}::uuid AND r.cycle_id = ${cycleId}::uuid AND r.band IS NOT NULL AND ${scope}
          GROUP BY 1, 2 ORDER BY 1, 2`;
        const cells = suppress(rows.map((x) => ({ department: x.department, band: x.band ?? '', count: Number(x.n) })), min);
        return { kind, cycle: cycle.name, min, header: ['department', 'band', 'people'], rows: cells.map((x) => [x.department, x.band, x.count]) };
      }

      if (kind === 'calibration-changes') {
        const rows = await tx.$queryRaw<{ employee: string; department: string; from_score: Prisma.Decimal | null; to_score: Prisma.Decimal; from_band: string | null; to_band: string | null; reason: string; by: string | null; at: Date }[]>`
          SELECT concat_ws(' ', COALESCE(NULLIF(e.preferred_name, ''), e.given_name), e.family_name) AS employee, ${dept} AS department, x.from_score, x.to_score, x.from_band, x.to_band, x.reason,
                 (SELECT u.name FROM users u WHERE u.id = x.by_user_id) AS by, x.at
          FROM calibration_changes x JOIN reviews r ON r.organization_id = x.organization_id AND r.id = x.review_id JOIN employees e ON e.organization_id = r.organization_id AND e.id = r.employee_id
          WHERE x.organization_id = ${org}::uuid AND r.cycle_id = ${cycleId}::uuid AND ${scope} ORDER BY x.at`;
        return { kind, cycle: cycle.name, header: ['employee', 'department', 'from', 'to', 'from band', 'to band', 'reason', 'by', 'at'], rows: rows.map((x) => [x.employee, x.department, x.from_score === null ? null : Number(x.from_score.toString()), Number(x.to_score.toString()), x.from_band, x.to_band, x.reason, x.by, x.at.toISOString()]) };
      }

      if (kind === 'goal-alignment') {
        const rows = await tx.$queryRaw<{ department: string; goals: bigint; aligned: bigint }[]>`
          SELECT ${dept} AS department, count(*) AS goals, count(g.parent_goal_id) AS aligned
          FROM goals g JOIN goal_periods p ON p.organization_id = g.organization_id AND p.id = g.period_id
          JOIN LATERAL (SELECT g.owner_employee_id AS employee_id, g.organization_id) r ON true
          WHERE g.organization_id = ${org}::uuid AND g.owner_type = 'person' AND g.status IN ('active', 'done')
            AND p.from_on <= ${cycle.periodTo} AND p.to_on >= ${cycle.periodFrom} AND ${scope}
          GROUP BY 1 ORDER BY 1`;
        const cells = suppress(rows.map((x) => ({ department: x.department, count: Number(x.goals), aligned: Number(x.aligned) })), min);
        return { kind, cycle: cycle.name, min, header: ['department', 'goals', 'aligned', 'aligned %'], rows: cells.map((x) => (x.count === null ? [x.department, null, null, null] : [x.department, x.count, x.aligned, Math.round((x.aligned / x.count) * 1000) / 10])) };
      }
      if (kind === 'pip-status') {
        const rows = await tx.$queryRaw<{ department: string; status: string; n: bigint }[]>`
          SELECT ${dept} AS department, r.status, count(*) AS n FROM pips r
          WHERE r.organization_id = ${org}::uuid AND r.status IN ('active', 'extended', 'met', 'not_met')
            AND r.starts_on <= ${cycle.periodTo} AND r.ends_on >= ${cycle.periodFrom} AND ${scope}
          GROUP BY 1, 2 ORDER BY 1`;
        const depts = [...new Set(rows.map((x) => x.department))];
        const cells = suppress(depts.map((d) => ({ department: d, count: rows.filter((x) => x.department === d).reduce((t, x) => t + Number(x.n), 0), by: PIP_STATUSES.map((s) => Number(rows.find((x) => x.department === d && x.status === s)?.n ?? 0)) })), min);
        return { kind, cycle: cycle.name, min, header: ['department', ...PIP_STATUSES, 'total'], rows: cells.map((x) => (x.count === null ? [x.department, ...PIP_STATUSES.map(() => null), null] : [x.department, ...x.by, x.count])) };
      }
      throw new BadRequestException('No such report.');
    });
  }

  /** The launched cycles a report can be run on. */
  async cycles(ctx: TenantContext, user: ScopeUser) {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, ['perf.report.view']);
    if (!v.grants.has('perf.report.view') || v.actingForOther) throw new ForbiddenException('Performance reports need perf.report.view.');
    return this.run(ctx, async (tx, c) => (await tx.reviewCycle.findMany({ where: { organizationId: c.organizationId, status: { not: 'draft' } }, orderBy: { periodTo: 'desc' } })).map((x) => ({ value: x.id, label: x.name })));
  }

  async csv(ctx: TenantContext, user: ScopeUser, kind: ReportKind, cycleId: string) {
    const r = await this.report(ctx, user, kind, cycleId);
    return toCsv(r.header, r.rows as unknown[][]);
  }
}
