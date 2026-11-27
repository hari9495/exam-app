import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, inCompany, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { buildViewer, tenantWide, type ScopeUser } from '../access/scope';
import { toCsv } from '../performance/calibration-rules';
import { MIN_GROUP, figures, monthEnds, splitBy, type ExitRow, type HeadRow, type Split } from './attrition';

export const ATTRITION_KEY = 'people.analytics.view';
const SPLIT_WORDS: Record<Split, string> = { entity: 'Legal entity', department: 'Department', location: 'Location', grade: 'Grade' };

/** The period asked for: YYYY-MM to YYYY-MM, at most 24 months, never past the current month. Default: the last 12 complete months. */
export function period(from?: string, to?: string): { from: string; to: string } {
  const now = todayIst().slice(0, 7);
  const back = (ym: string, n: number) => {
    const [y, m] = ym.split('-').map(Number) as [number, number];
    const d = new Date(Date.UTC(y, m - 1 - n, 1));
    return d.toISOString().slice(0, 7);
  };
  const t = to ?? back(now, 1);
  const f = from ?? back(t, 11);
  if (f > t) throw new BadRequestException('The period starts after it ends. Choose an earlier start.');
  if (t > now) throw new BadRequestException('Choose months up to this month.');
  if (monthEnds(f, t).length > 24) throw new BadRequestException('Choose at most 24 months.');
  return { from: f, to: t };
}

@Injectable()
export class AttritionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  /** Company-wide only: a narrower grant of the key sees nothing (the figures are the whole company's). */
  private async must(user: ScopeUser) {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, [ATTRITION_KEY]);
    if (!tenantWide(v, ATTRITION_KEY)) throw new ForbiddenException('Headcount and attrition need the people analytics key for the whole company.');
  }

  private async rows(tx: Tx, org: string, days: string[]) {
    const first = `${days[0]!.slice(0, 7)}-01`;
    const last = days[days.length - 1]!;
    const heads = await tx.$queryRaw<{ day: Date; entity: string | null; department: string | null; location: string | null; grade: string | null }[]>`
      SELECT DISTINCT ON (m.day, em.id) m.day, a.legal_entity_id::text AS entity, a.department_id::text AS department, a.location_id::text AS location, a.grade_id::text AS grade
      FROM unnest(${days}::date[]) AS m(day)
      JOIN employments em ON em.organization_id = ${org}::uuid AND em.joined_on <= m.day AND (em.exited_on IS NULL OR em.exited_on > m.day)
      JOIN employee_assignments a ON a.organization_id = em.organization_id AND a.employment_id = em.id AND a.superseded_at IS NULL
        AND a.valid_from <= m.day AND (a.valid_to IS NULL OR a.valid_to >= m.day)
      ORDER BY m.day, em.id, a.valid_from DESC`;
    const exits = await tx.$queryRaw<{ entity: string | null; department: string | null; location: string | null; grade: string | null; initiated_by: string | null }[]>`
      SELECT a.legal_entity_id::text AS entity, a.department_id::text AS department, a.location_id::text AS location, a.grade_id::text AS grade, ec.initiated_by
      FROM employments em
      LEFT JOIN LATERAL (SELECT * FROM employee_assignments x WHERE x.organization_id = em.organization_id AND x.employment_id = em.id AND x.superseded_at IS NULL
        AND x.valid_from <= em.exited_on ORDER BY x.valid_from DESC LIMIT 1) a ON TRUE
      LEFT JOIN LATERAL (SELECT c.initiated_by FROM exit_cases c WHERE c.organization_id = em.organization_id AND c.employment_id = em.id AND c.status NOT IN ('withdrawn', 'rejected') ORDER BY c.created_at DESC LIMIT 1) ec ON TRUE
      WHERE em.organization_id = ${org}::uuid AND em.exited_on BETWEEN ${first}::date AND ${last}::date`;
    return {
      heads: heads.map((h): HeadRow => ({ ...h, day: h.day.toISOString().slice(0, 10) })),
      exits: exits.map((e): ExitRow => ({ entity: e.entity, department: e.department, location: e.location, grade: e.grade, initiatedBy: e.initiated_by === 'employee' || e.initiated_by === 'company' ? e.initiated_by : null })),
    };
  }

  private async names(tx: Tx, org: string, split: Split): Promise<Map<string, string>> {
    const where = { organizationId: org };
    const list =
      split === 'entity' ? await tx.legalEntity.findMany({ where, select: { id: true, name: true } })
      : split === 'department' ? await tx.department.findMany({ where, select: { id: true, name: true } })
      : split === 'location' ? await tx.location.findMany({ where, select: { id: true, name: true } })
      : await tx.grade.findMany({ where, select: { id: true, name: true } });
    return new Map(list.map((x) => [x.id, String(x.name)]));
  }

  async report(ctx: TenantContext, user: ScopeUser, q: { from?: string; to?: string; by?: Split }) {
    await this.must(user);
    const p = period(q.from, q.to);
    const days = monthEnds(p.from, p.to);
    const split = q.by ?? 'department';
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { heads, exits } = await this.rows(tx, c.organizationId, days);
      const names = await this.names(tx, c.organizationId, split);
      const name = (id: string | null) => (id ? (names.get(id) ?? 'Removed') : split === 'grade' ? 'No grade' : 'Not set');
      const groups = splitBy(split, days, heads, exits)
        .map((g) => ({ ...g, name: name(g.id) }))
        .sort((a, b) => Number(a.hidden) - Number(b.hidden) || a.name.localeCompare(b.name));
      return {
        from: p.from,
        to: p.to,
        by: split,
        minGroup: MIN_GROUP,
        months: days.map((day) => ({ month: day.slice(0, 7), headcount: heads.filter((h) => h.day === day).length })),
        total: figures(days, heads, exits),
        groups,
      };
    });
  }

  /** The same figures as a CSV (Excel opens it), the export recorded as other report exports are. */
  async csv(ctx: TenantContext, user: ScopeUser, q: { from?: string; to?: string; by?: Split }) {
    const r = await this.report(ctx, user, q);
    const head = [SPLIT_WORDS[r.by], 'Average headcount', 'Exits', 'Voluntary', 'Involuntary', 'Not recorded', 'Attrition %', 'Voluntary attrition %'];
    const line = (label: string, f: { avgHeadcount: number; exits: number; voluntary: number; involuntary: number; notRecorded: number; rate: number | null; voluntaryRate: number | null }) => [label, f.avgHeadcount, f.exits, f.voluntary, f.involuntary, f.notRecorded, f.rate ?? '', f.voluntaryRate ?? ''];
    const rows = [
      line('Whole company', r.total),
      ...r.groups.map((g) => (g.hidden ? [g.name, `Fewer than ${MIN_GROUP} people`, '', '', '', '', '', ''] : line(g.name, g))),
      [],
      ['Month', 'Headcount on the last day'],
      ...r.months.map((m) => [m.month, m.headcount]),
    ];
    await inCompany(this.tenantPrisma, ctx, (tx, c) => audit(tx, c, 'people.attrition.exported', 'organization', c.organizationId, { from: r.from, to: r.to, by: r.by }));
    return { csv: `﻿${toCsv(head, rows)}`, name: `headcount-attrition-${r.from}-to-${r.to}-by-${r.by}.csv` };
  }
}
