import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { PLATFORM, platformRead } from './platform.service';

type Tx = Prisma.TransactionClient;
export const ANALYTICS_WINDOW_KEY = 'analytics.window_days';
export const ANALYTICS_WINDOW_DEFAULT = 30;
export const ANALYTICS_MIN_KEY = 'analytics.min_companies';
export const ANALYTICS_MIN_DEFAULT = 5;

/**
 * The features (product areas) and the audit action families that count as using them. Only the family (the part before
 * the first dot) is read: never the record, the metadata, a person or any HR content.
 */
export const AREAS: { key: string; label: string; families: string[] }[] = [
  { key: 'people', label: 'People', families: ['employee', 'entry', 'exit', 'preboarding', 'journey', 'staffing'] },
  { key: 'time', label: 'Time and leave', families: ['time', 'leave'] },
  { key: 'payroll', label: 'Payroll', families: ['payroll', 'tax'] },
  { key: 'hiring', label: 'Hiring', families: ['job', 'ats', 'candidate', 'offer', 'offer_template', 'interview', 'job_board'] },
  { key: 'performance', label: 'Performance', families: ['perf'] },
  { key: 'expenses', label: 'Expenses', families: ['expense'] },
  { key: 'helpdesk', label: 'Helpdesk', families: ['desk', 'policy', 'help'] },
  { key: 'approvals', label: 'Approvals', families: ['workflow'] },
  { key: 'projects', label: 'Projects', families: ['project', 'timesheet'] },
];
const AREA_OF = new Map(AREAS.flatMap((a) => a.families.map((f) => [f, a.key] as const)));
export const BANDS = ['Under 200 employees', '200+ employees'] as const;
const bandOf = (employees: number) => (employees < 200 ? 0 : 1);

type Use = { organizationId: string; family: string; actions: number; last: Date };

/**
 * Hides every group of fewer than `min` companies (as C-1 and the help-centre counts do): a feature's count, a size
 * band, and a size band's share for one feature. Counts only; null means hidden.
 */
export function summarise(companies: { id: string; employees: number }[], uses: Use[], min: number) {
  const perOrg = new Map<string, Map<string, { actions: number; last: Date }>>();
  for (const u of uses) {
    const area = AREA_OF.get(u.family);
    if (!area) continue;
    const m = perOrg.get(u.organizationId) ?? new Map<string, { actions: number; last: Date }>();
    const cur = m.get(area) ?? { actions: 0, last: u.last };
    m.set(area, { actions: cur.actions + u.actions, last: cur.last > u.last ? cur.last : u.last });
    perOrg.set(u.organizationId, m);
  }
  const known = new Set(companies.map((c) => c.id));
  const byFeature = AREAS.map((a) => {
    const users = companies.filter((c) => perOrg.get(c.id)?.has(a.key));
    const ok = users.length >= min;
    return { area: a.key, label: a.label, companies: ok ? users.length : null, actions: ok ? users.reduce((t, c) => t + perOrg.get(c.id)!.get(a.key)!.actions, 0) : null };
  });
  const inBand = BANDS.map((_, b) => companies.filter((c) => bandOf(c.employees) === b));
  const bySize = {
    bands: BANDS.map((label, b) => ({ label, companies: inBand[b]!.length >= min ? inBand[b]!.length : null })),
    // % of the band's companies using each feature; hidden when the band or the users are fewer than `min`.
    adoption: AREAS.map((a) => ({
      area: a.key,
      label: a.label,
      pct: inBand.map((list) => {
        const users = list.filter((c) => perOrg.get(c.id)?.has(a.key)).length;
        return list.length >= min && users >= min ? Math.round((100 * users) / list.length) : null;
      }),
      users: inBand.map((list) => list.filter((c) => perOrg.get(c.id)?.has(a.key)).length),
    })),
  };
  const byCompany = [...perOrg.entries()]
    .filter(([id]) => known.has(id))
    .map(([id, m]) => ({ id, areas: Object.fromEntries([...m.entries()].map(([k, v]) => [k, v.actions])), lastActive: new Date(Math.max(...[...m.values()].map((v) => v.last.getTime()))).toISOString() }));
  return { byFeature, bySize, byCompany };
}

/**
 * YukthiX console C-8, YX-09: product analytics. Which features companies use, from the audit log's action families
 * only: counts by feature (and size band) and by company, over `analytics.window_days`. Never personal data and never HR
 * content; groups of fewer than `analytics.min_companies` (never under 5) companies are hidden. Read through
 * `platformRead`, audited with its purpose.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private async num(tx: Tx, key: string, def: number, floor: number) {
    const v = Number((await tx.platformSetting.findUnique({ where: { key } }))?.value);
    return Number.isInteger(v) && v >= floor ? v : def;
  }

  async overview(actorUserId: string) {
    const { days, min } = await this.tenantPrisma.forTenant(PLATFORM, async (tx) => ({ days: await this.num(tx, ANALYTICS_WINDOW_KEY, ANALYTICS_WINDOW_DEFAULT, 1), min: await this.num(tx, ANALYTICS_MIN_KEY, ANALYTICS_MIN_DEFAULT, 5) }));
    return platformRead(this.tenantPrisma, actorUserId, 'analytics.feature_use', async (tx) => {
      const orgs = await tx.organization.findMany({ where: { isPlatform: false }, select: { id: true, name: true }, take: 2000 });
      const people = await tx.employee.groupBy({ by: ['organizationId'], where: { organizationId: { in: orgs.map((o) => o.id) } }, _count: { _all: true } });
      const families = AREAS.flatMap((a) => a.families);
      const uses = await tx.$queryRaw<{ organizationId: string; family: string; actions: number; last: Date }[]>`
        SELECT organization_id AS "organizationId", split_part(action, '.', 1) AS family, count(*)::int AS actions, max(created_at) AS last
        FROM audit_logs
        WHERE organization_id IS NOT NULL AND created_at >= now() - make_interval(days => ${days}::int) AND split_part(action, '.', 1) = ANY(${families}::text[])
        GROUP BY 1, 2`;
      const companies = orgs.map((o) => ({ id: o.id, employees: people.find((p) => p.organizationId === o.id)?._count._all ?? 0 }));
      const s = summarise(companies, uses, min);
      const names = new Map(orgs.map((o) => [o.id, o.name]));
      return {
        windowDays: days,
        minCompanies: min,
        totalCompanies: companies.length,
        areas: AREAS.map((a) => ({ key: a.key, label: a.label })),
        byFeature: s.byFeature,
        bySize: { bands: s.bySize.bands, adoption: s.bySize.adoption.map(({ users: _u, ...x }) => x) },
        byCompany: s.byCompany.map((c) => ({ ...c, company: names.get(c.id) ?? '', band: BANDS[bandOf(companies.find((x) => x.id === c.id)!.employees)] })).sort((a, b) => a.company.localeCompare(b.company)),
      };
    });
  }
}
