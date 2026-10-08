import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { stringify } from 'csv-stringify/sync';
import { TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Tx } from '../org-structure/org-structure.service';
import { addDays, todayIst } from '../org-structure/org-validation';
import { planFor } from './customers.service';
import { DeskAccessService, DeskActor, activeOn, audit, deskSystem, has, visibleTickets } from './desk-access';
import { CustomReportDto, KpiTargetDto, ReportRunDto, ScheduleDto, WallboardDto } from './dto-ops';

// SD-1.27 reports (US-B-098, US-B-110, US-B-111, US-G-026 … US-G-028, US-G-223). Dashboards, the KPI history, the
// report library and the wallboard show counts only, so they count every ticket of the desks the person may report on
// (sensitive ones too, YX-HD-03: numbers show, details stay hidden). Custom reports list tickets, so they hold only
// tickets the runner may see (the §5.7 filter), and a scheduled copy is built with each recipient's own rights.
// Every spreadsheet cell is formula-safe (CSV injection).

export const safeCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};
export const toCsv = (header: string[], rows: unknown[][]) => stringify([header.map(safeCell), ...rows.map((r) => r.map(safeCell))]);
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const webOrigin = () => (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');
const day = (iso: string) => new Date(`${iso}T00:00:00+05:30`);
const num = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10);

/** KPIs kept every day from day one (US-G-026). higher: whether a higher value is better (red / amber / green). */
export const KPIS: Record<string, { label: string; higher: boolean }> = {
  backlog: { label: 'Open tickets at day end', higher: false },
  created: { label: 'New tickets', higher: false },
  solved: { label: 'Solved tickets', higher: true },
  first_response_h: { label: 'Average first response (hours)', higher: false },
  resolution_h: { label: 'Average time to solve (hours)', higher: false },
  sla_met_pct: { label: 'Response targets met (%)', higher: true },
  csat_pct: { label: 'Happy ratings (%)', higher: true },
  fcr_pct: { label: 'Solved with one reply (%)', higher: true },
  self_service: { label: 'Solved by an article', higher: true },
};

/** Red / amber / green against a target and its amber limit. */
export function ragOf(value: number, t: { target: number; amber: number; higherIsBetter: boolean } | null): 'green' | 'amber' | 'red' | null {
  if (!t) return null;
  if (t.higherIsBetter) return value >= t.target ? 'green' : value >= t.amber ? 'amber' : 'red';
  return value <= t.target ? 'green' : value <= t.amber ? 'amber' : 'red';
}

/** A straight-line forecast of the next days from the last points (least squares). */
export function forecast(values: number[], ahead: number): number[] {
  const n = values.length;
  if (n < 3) return [];
  const xs = values.map((_, i) => i);
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = values.reduce((s, y) => s + y, 0) / n;
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const slope = den ? xs.reduce((s, x, i) => s + (x - mx) * (values[i] - my), 0) / den : 0;
  return Array.from({ length: ahead }, (_, k) => Math.max(0, Math.round((my + slope * (n + k - mx)) * 10) / 10));
}

/** Columns a custom report may hold (US-B-111): never message text. */
export const REPORT_COLUMNS: Record<string, string> = {
  number: 'Number',
  subject: 'Subject',
  desk: 'Desk',
  status: 'Status',
  state: 'State',
  priority: 'Priority',
  category: 'Category',
  group: 'Group',
  assignee: 'Assignee',
  requester: 'Requester',
  account: 'Company',
  channel: 'Raised from',
  created: 'Raised',
  first_response: 'First reply',
  resolved: 'Solved',
  rating: 'Rating',
  tags: 'Tags',
};

/** The ready report library, grouped by practice (US-G-027). Later phases add changes, assets and licences. */
export const LIBRARY = [
  { key: 'by_status', practice: 'Incidents and requests', name: 'Tickets by status' },
  { key: 'by_category', practice: 'Incidents and requests', name: 'Top contact reasons (by category)' },
  { key: 'by_priority', practice: 'Incidents and requests', name: 'Tickets by priority' },
  { key: 'time_in_status', practice: 'Incidents and requests', name: 'Time in each status, stuck and skipped' },
  { key: 'sla', practice: 'SLA', name: 'Response targets met, by desk and priority' },
  { key: 'agent_360', practice: 'Agents', name: 'Agent 360: tickets, times and ratings' },
  { key: 'group_360', practice: 'Agents', name: 'Team 360: tickets, times and ratings' },
  { key: 'requester_360', practice: 'Requesters', name: 'Requester 360: who asks most' },
  { key: 'csat', practice: 'Satisfaction', name: 'Ratings by desk and agent' },
  { key: 'funnel', practice: 'Self-service', name: 'Self-service funnel' },
  { key: 'customer_sla', practice: 'Customers', name: 'Response targets per customer company' },
] as const;
type LibraryKey = (typeof LIBRARY)[number]['key'];

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly access: DeskAccessService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Desks a person reports on: where they lead, work or run the desk; the Service Desk admin: every desk. */
  async deskScope(tx: Tx, a: DeskActor, deskId?: string): Promise<string[]> {
    if (!has(a, 'desk.report.view')) throw new ForbiddenException('You cannot see desk reports (desk.report.view).');
    const all = has(a, 'desk.desk.create') ? (await tx.sdDesk.findMany({ where: { organizationId: a.ctx.organizationId }, select: { id: true } })).map((d) => d.id) : [...a.roles].filter(([, r]) => r !== 'collaborator').map(([d]) => d);
    if (deskId) {
      if (!all.includes(deskId)) throw new NotFoundException('No such desk.');
      return [deskId];
    }
    return all;
  }

  private range(from?: string, to?: string) {
    const t = to ?? todayIst();
    const f = from ?? addDays(t, -29);
    if (f > t) throw new BadRequestException('The start comes after the end.');
    if (Date.parse(t) - Date.parse(f) > 366 * 86_400_000) throw new BadRequestException('Choose a year at most.');
    return { from: day(f), to: day(addDays(t, 1)), f, t };
  }

  // ------------------------------------------------------------------------------------------ the ready dashboard (US-B-110)

  async dashboard(a: DeskActor, q: ReportRunDto) {
    const { from, to } = this.range(q.from, q.to);
    const desks = await this.tenantPrisma.forTenant(a.ctx, (tx) => this.deskScope(tx, a, q.deskId));
    const org = a.ctx.organizationId;
    return deskSystem(this.tenantPrisma, a.ctx, async (tx) => {
      const [totals] = await tx.$queryRaw<Record<string, unknown>[]>`
        SELECT
          count(*) FILTER (WHERE system_state IN ('new', 'open', 'pending', 'on_hold')) AS backlog,
          count(*) FILTER (WHERE system_state IN ('new', 'open', 'pending', 'on_hold') AND assignee_user_id IS NULL) AS unassigned,
          count(*) FILTER (WHERE created_at >= ${from} AND created_at < ${to}) AS created,
          count(*) FILTER (WHERE resolved_at >= ${from} AND resolved_at < ${to}) AS solved,
          avg(extract(epoch FROM first_response_at - created_at) / 3600) FILTER (WHERE first_response_at >= ${from} AND first_response_at < ${to}) AS first_response_h,
          avg(extract(epoch FROM resolved_at - created_at) / 3600) FILTER (WHERE resolved_at >= ${from} AND resolved_at < ${to}) AS resolution_h,
          count(*) FILTER (WHERE system_state IN ('new', 'open', 'pending', 'on_hold') AND created_at > now() - interval '1 day') AS age_1d,
          count(*) FILTER (WHERE system_state IN ('new', 'open', 'pending', 'on_hold') AND created_at <= now() - interval '1 day' AND created_at > now() - interval '3 days') AS age_3d,
          count(*) FILTER (WHERE system_state IN ('new', 'open', 'pending', 'on_hold') AND created_at <= now() - interval '3 days' AND created_at > now() - interval '7 days') AS age_7d,
          count(*) FILTER (WHERE system_state IN ('new', 'open', 'pending', 'on_hold') AND created_at <= now() - interval '7 days') AS age_older
        FROM sd_tickets WHERE organization_id = ${org}::uuid AND desk_id = ANY(${desks}::uuid[]) AND merged_into_id IS NULL`;
      const [mtta] = await tx.$queryRaw<{ h: unknown }[]>`
        SELECT avg(extract(epoch FROM e.at - t.created_at) / 3600) AS h FROM sd_tickets t
        JOIN LATERAL (SELECT min(at) AS at FROM sd_ticket_events x WHERE x.organization_id = t.organization_id AND x.ticket_id = t.id AND x.kind = 'assigned' AND x.to_value IS NOT NULL) e ON e.at IS NOT NULL
        WHERE t.organization_id = ${org}::uuid AND t.desk_id = ANY(${desks}::uuid[]) AND t.created_at >= ${from} AND t.created_at < ${to}`;
      const [fcr] = await tx.$queryRaw<{ one: bigint; all: bigint }[]>`
        SELECT count(*) FILTER (WHERE r.n <= 1) AS one, count(*) AS all FROM sd_tickets t
        JOIN LATERAL (SELECT count(*) AS n FROM sd_ticket_messages m WHERE m.organization_id = t.organization_id AND m.ticket_id = t.id AND m.kind = 'reply' AND m.side = 'agent') r ON true
        WHERE t.organization_id = ${org}::uuid AND t.desk_id = ANY(${desks}::uuid[]) AND t.resolved_at >= ${from} AND t.resolved_at < ${to}`;
      const [sla] = await tx.$queryRaw<{ kept: bigint; missed: bigint }[]>`
        SELECT count(*) FILTER (WHERE state = 'met' AND breached_at IS NULL AND NOT excluded) AS kept, count(*) FILTER (WHERE breached_at IS NOT NULL AND NOT excluded) AS missed
        FROM sd_sla_timers WHERE organization_id = ${org}::uuid AND desk_id = ANY(${desks}::uuid[]) AND kind = 'sla'
          AND ((met_at >= ${from} AND met_at < ${to}) OR (breached_at >= ${from} AND breached_at < ${to}))`;
      const [csat] = await tx.$queryRaw<{ happy: bigint; all: bigint; avg: unknown }[]>`
        SELECT count(*) FILTER (WHERE score >= 4) AS happy, count(*) AS all, avg(score) AS avg FROM sd_ratings
        WHERE organization_id = ${org}::uuid AND desk_id = ANY(${desks}::uuid[]) AND created_at >= ${from} AND created_at < ${to}`;
      const agents = await tx.$queryRaw<{ user_id: string; name: string | null; solved: bigint; resolution_h: unknown; rating: unknown; open: bigint }[]>`
        SELECT u.id AS user_id, coalesce(u.name, u.email) AS name,
          count(*) FILTER (WHERE t.resolved_at >= ${from} AND t.resolved_at < ${to}) AS solved,
          avg(extract(epoch FROM t.resolved_at - t.created_at) / 3600) FILTER (WHERE t.resolved_at >= ${from} AND t.resolved_at < ${to}) AS resolution_h,
          (SELECT avg(r.score) FROM sd_ratings r WHERE r.organization_id = t.organization_id AND r.agent_user_id = u.id AND r.desk_id = ANY(${desks}::uuid[]) AND r.created_at >= ${from} AND r.created_at < ${to}) AS rating,
          count(*) FILTER (WHERE t.system_state IN ('new', 'open', 'pending', 'on_hold')) AS open
        FROM sd_tickets t JOIN users u ON u.organization_id = t.organization_id AND u.id = t.assignee_user_id
        WHERE t.organization_id = ${org}::uuid AND t.desk_id = ANY(${desks}::uuid[])
        GROUP BY u.id, u.name, u.email, t.organization_id ORDER BY solved DESC LIMIT 50`;
      const [kb] = await tx.$queryRaw<{ solved: bigint; views: bigint; searches: bigint }[]>`
        SELECT count(*) FILTER (WHERE kind = 'solved') AS solved, count(*) FILTER (WHERE kind = 'view') AS views, count(*) FILTER (WHERE kind = 'search') AS searches
        FROM sd_kb_events WHERE organization_id = ${org}::uuid AND created_at >= ${from} AND created_at < ${to}`;
      const n = (v: unknown) => Number(v ?? 0);
      const pct = (x: unknown, y: unknown) => (n(y) ? Math.round((n(x) * 1000) / n(y)) / 10 : null);
      return {
        backlog: n(totals.backlog),
        unassigned: n(totals.unassigned),
        created: n(totals.created),
        solved: n(totals.solved),
        ageing: { day: n(totals.age_1d), threeDays: n(totals.age_3d), week: n(totals.age_7d), older: n(totals.age_older) },
        mttaHours: num(mtta?.h),
        mttrHours: num(totals.resolution_h),
        firstResponseHours: num(totals.first_response_h),
        slaMetPct: pct(sla?.kept, n(sla?.kept) + n(sla?.missed)),
        fcrPct: pct(fcr?.one, fcr?.all),
        csatPct: pct(csat?.happy, csat?.all),
        csatAverage: num(csat?.avg),
        ratings: n(csat?.all),
        selfService: { solved: n(kb?.solved), views: n(kb?.views), searches: n(kb?.searches) },
        agents: agents.map((x) => ({ userId: x.user_id, name: x.name ?? '', solved: n(x.solved), open: n(x.open), resolutionHours: num(x.resolution_h), rating: num(x.rating) })),
      };
    });
  }

  // ------------------------------------------------------------------------------------------ KPI snapshots (US-G-026)

  /** Job: yesterday's KPIs per desk, once (ON CONFLICT DO NOTHING), with the target and its colour at the time. */
  async snapshot(onDay = addDays(todayIst(), -1)): Promise<number> {
    const desks = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, (tx) => tx.$queryRaw<{ id: string; organization_id: string }[]>`SELECT id, organization_id FROM sd_desks WHERE status = 'active'`);
    let n = 0;
    const from = day(onDay);
    const to = day(addDays(onDay, 1));
    for (const d of desks) {
      n += await deskSystem(this.tenantPrisma, { organizationId: d.organization_id, isSuperAdmin: false }, async (tx) => {
        const [m] = await tx.$queryRaw<Record<string, unknown>[]>`
          SELECT
            (SELECT count(*) FROM sd_tickets t WHERE t.organization_id = ${d.organization_id}::uuid AND t.desk_id = ${d.id}::uuid AND t.merged_into_id IS NULL AND t.created_at < ${to} AND (t.resolved_at IS NULL OR t.resolved_at >= ${to})) AS backlog,
            (SELECT count(*) FROM sd_tickets t WHERE t.organization_id = ${d.organization_id}::uuid AND t.desk_id = ${d.id}::uuid AND t.created_at >= ${from} AND t.created_at < ${to}) AS created,
            (SELECT count(*) FROM sd_tickets t WHERE t.organization_id = ${d.organization_id}::uuid AND t.desk_id = ${d.id}::uuid AND t.resolved_at >= ${from} AND t.resolved_at < ${to}) AS solved,
            (SELECT avg(extract(epoch FROM first_response_at - created_at) / 3600) FROM sd_tickets t WHERE t.organization_id = ${d.organization_id}::uuid AND t.desk_id = ${d.id}::uuid AND t.first_response_at >= ${from} AND t.first_response_at < ${to}) AS first_response_h,
            (SELECT avg(extract(epoch FROM resolved_at - created_at) / 3600) FROM sd_tickets t WHERE t.organization_id = ${d.organization_id}::uuid AND t.desk_id = ${d.id}::uuid AND t.resolved_at >= ${from} AND t.resolved_at < ${to}) AS resolution_h,
            (SELECT 100.0 * count(*) FILTER (WHERE state = 'met' AND breached_at IS NULL) / NULLIF(count(*), 0) FROM sd_sla_timers x WHERE x.organization_id = ${d.organization_id}::uuid AND x.desk_id = ${d.id}::uuid AND x.kind = 'sla' AND NOT x.excluded AND ((x.met_at >= ${from} AND x.met_at < ${to}) OR (x.breached_at >= ${from} AND x.breached_at < ${to}))) AS sla_met_pct,
            (SELECT 100.0 * count(*) FILTER (WHERE score >= 4) / NULLIF(count(*), 0) FROM sd_ratings r WHERE r.organization_id = ${d.organization_id}::uuid AND r.desk_id = ${d.id}::uuid AND r.created_at >= ${from} AND r.created_at < ${to}) AS csat_pct,
            (SELECT 100.0 * count(*) FILTER (WHERE (SELECT count(*) FROM sd_ticket_messages m WHERE m.organization_id = t.organization_id AND m.ticket_id = t.id AND m.kind = 'reply' AND m.side = 'agent') <= 1) / NULLIF(count(*), 0) FROM sd_tickets t WHERE t.organization_id = ${d.organization_id}::uuid AND t.desk_id = ${d.id}::uuid AND t.resolved_at >= ${from} AND t.resolved_at < ${to}) AS fcr_pct,
            (SELECT count(*) FROM sd_kb_links l WHERE l.organization_id = ${d.organization_id}::uuid AND l.desk_id = ${d.id}::uuid AND l.kind = 'solved' AND l.created_at >= ${from} AND l.created_at < ${to}) AS self_service`;
        const targets = new Map((await tx.sdKpiTarget.findMany({ where: { organizationId: d.organization_id, deskId: d.id } })).map((t) => [t.metric, { target: Number(t.target), amber: Number(t.amber), higherIsBetter: t.higherIsBetter }]));
        const rows = Object.keys(KPIS)
          .filter((k) => m[k] !== null && m[k] !== undefined)
          .map((k) => {
            const value = Math.round(Number(m[k]) * 100) / 100;
            const t = targets.get(k) ?? null;
            return { organizationId: d.organization_id, deskId: d.id, day: new Date(`${onDay}T00:00:00Z`), metric: k, value, target: t?.target ?? null, rag: ragOf(value, t) };
          });
        return (await tx.sdKpiDaily.createMany({ data: rows, skipDuplicates: true })).count;
      });
    }
    return n;
  }

  /** History with targets and a straight-line forecast of the next 7 days. */
  async kpis(a: DeskActor, deskId: string, days = 30) {
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      await this.deskScope(tx, a, deskId);
      const since = new Date(`${addDays(todayIst(), -Math.min(366, Math.max(7, days)))}T00:00:00Z`);
      const rows = await tx.sdKpiDaily.findMany({ where: { organizationId: a.ctx.organizationId, deskId, day: { gte: since } }, orderBy: { day: 'asc' } });
      const targets = await tx.sdKpiTarget.findMany({ where: { organizationId: a.ctx.organizationId, deskId } });
      return Object.entries(KPIS).map(([metric, k]) => {
        const points = rows.filter((r) => r.metric === metric).map((r) => ({ day: r.day.toISOString().slice(0, 10), value: Number(r.value), rag: r.rag }));
        const t = targets.find((x) => x.metric === metric);
        return { metric, label: k.label, higherIsBetter: k.higher, target: t ? Number(t.target) : null, amber: t ? Number(t.amber) : null, latest: points.at(-1) ?? null, points, forecast: forecast(points.slice(-14).map((p) => p.value), 7) };
      });
    });
  }

  async setTarget(a: DeskActor, deskId: string, dto: KpiTargetDto) {
    if (!has(a, 'desk.report.manage')) throw new ForbiddenException('You cannot set targets (desk.report.manage).');
    if (!KPIS[dto.metric]) throw new BadRequestException('No such KPI.');
    const higher = KPIS[dto.metric].higher;
    if (higher ? dto.amber > dto.target : dto.amber < dto.target) throw new BadRequestException(higher ? 'The amber limit is below the target.' : 'The amber limit is above the target.');
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      await this.deskScope(tx, a, deskId);
      if (!has(a, 'desk.desk.create') && !['lead', 'admin'].includes(a.roles.get(deskId) ?? '')) throw new ForbiddenException('Team leads and desk admins set targets.');
      const key = { organizationId: a.ctx.organizationId, deskId, metric: dto.metric };
      await tx.sdKpiTarget.upsert({ where: { organizationId_deskId_metric: key }, update: { target: dto.target, amber: dto.amber, higherIsBetter: higher, updatedBy: a.userId, updatedAt: new Date() }, create: { ...key, target: dto.target, amber: dto.amber, higherIsBetter: higher, updatedBy: a.userId } });
      await audit(tx, a, 'desk.kpi.target_set', 'sd_desk', deskId, { ...dto });
      return { ok: true };
    });
  }

  // ------------------------------------------------------------------------------------------ the report library (US-G-027)

  async run(a: DeskActor, key: LibraryKey, q: ReportRunDto): Promise<{ title: string; columns: string[]; rows: (string | number | null)[][] }> {
    const def = LIBRARY.find((l) => l.key === key);
    if (!def) throw new NotFoundException('No such report.');
    const { from, to } = this.range(q.from, q.to);
    const desks = await this.tenantPrisma.forTenant(a.ctx, (tx) => this.deskScope(tx, a, q.deskId));
    const org = a.ctx.organizationId;
    const rows = await deskSystem(this.tenantPrisma, a.ctx, async (tx): Promise<{ columns: string[]; rows: (string | number | null)[][] }> => {
      const base = Prisma.sql`t.organization_id = ${org}::uuid AND t.desk_id = ANY(${desks}::uuid[]) AND t.created_at >= ${from} AND t.created_at < ${to} AND t.merged_into_id IS NULL`;
      switch (key) {
        case 'by_status': {
          const r = await tx.$queryRaw<{ label: string; n: bigint }[]>`SELECT s.label, count(*) AS n FROM sd_tickets t JOIN sd_statuses s ON s.organization_id = t.organization_id AND s.id = t.status_id WHERE ${base} GROUP BY s.label ORDER BY n DESC`;
          return { columns: ['Status', 'Tickets'], rows: r.map((x) => [x.label, Number(x.n)]) };
        }
        case 'by_category': {
          const r = await tx.$queryRaw<{ label: string | null; n: bigint }[]>`SELECT c.name AS label, count(*) AS n FROM sd_tickets t LEFT JOIN sd_categories c ON c.organization_id = t.organization_id AND c.id = t.category_id WHERE ${base} GROUP BY c.name ORDER BY n DESC`;
          return { columns: ['Category', 'Tickets'], rows: r.map((x) => [x.label ?? 'No category', Number(x.n)]) };
        }
        case 'by_priority': {
          const r = await tx.$queryRaw<{ p: number; n: bigint; h: unknown }[]>`SELECT t.priority AS p, count(*) AS n, avg(extract(epoch FROM t.resolved_at - t.created_at) / 3600) AS h FROM sd_tickets t WHERE ${base} GROUP BY t.priority ORDER BY t.priority`;
          return { columns: ['Priority', 'Tickets', 'Average hours to solve'], rows: r.map((x) => [`P${x.p}`, Number(x.n), num(x.h)]) };
        }
        case 'time_in_status':
          return this.timeInStatus(tx, org, desks, from, to);
        case 'sla': {
          const r = await tx.$queryRaw<{ desk: string; p: number; metric: string; kept: bigint; missed: bigint }[]>`
            SELECT d.name AS desk, t.priority AS p, x.metric, count(*) FILTER (WHERE x.state = 'met' AND x.breached_at IS NULL) AS kept, count(*) FILTER (WHERE x.breached_at IS NOT NULL) AS missed
            FROM sd_sla_timers x JOIN sd_tickets t ON t.organization_id = x.organization_id AND t.id = x.ticket_id JOIN sd_desks d ON d.organization_id = t.organization_id AND d.id = t.desk_id
            WHERE ${base} AND x.kind = 'sla' AND NOT x.excluded GROUP BY d.name, t.priority, x.metric ORDER BY d.name, t.priority, x.metric`;
          return { columns: ['Desk', 'Priority', 'Measure', 'Kept', 'Missed', 'Kept %'], rows: r.map((x) => [x.desk, `P${x.p}`, x.metric.replace('_', ' '), Number(x.kept), Number(x.missed), Number(x.kept) + Number(x.missed) ? Math.round((Number(x.kept) * 1000) / (Number(x.kept) + Number(x.missed))) / 10 : null]) };
        }
        case 'agent_360':
        case 'group_360': {
          const r =
            key === 'agent_360'
              ? await tx.$queryRaw<{ who: string | null; n: bigint; solved: bigint; h: unknown; fr: unknown; rating: unknown }[]>`
                  SELECT coalesce(u.name, u.email) AS who, count(*) AS n, count(t.resolved_at) AS solved, avg(extract(epoch FROM t.resolved_at - t.created_at) / 3600) AS h,
                    avg(extract(epoch FROM t.first_response_at - t.created_at) / 3600) AS fr, avg(r.score) AS rating
                  FROM sd_tickets t JOIN users u ON u.organization_id = t.organization_id AND u.id = t.assignee_user_id
                  LEFT JOIN sd_ratings r ON r.organization_id = t.organization_id AND r.ticket_id = t.id WHERE ${base} GROUP BY u.name, u.email ORDER BY n DESC`
              : await tx.$queryRaw<{ who: string | null; n: bigint; solved: bigint; h: unknown; fr: unknown; rating: unknown }[]>`
                  SELECT g.name AS who, count(*) AS n, count(t.resolved_at) AS solved, avg(extract(epoch FROM t.resolved_at - t.created_at) / 3600) AS h,
                    avg(extract(epoch FROM t.first_response_at - t.created_at) / 3600) AS fr, avg(r.score) AS rating
                  FROM sd_tickets t JOIN sd_groups g ON g.organization_id = t.organization_id AND g.id = t.group_id
                  LEFT JOIN sd_ratings r ON r.organization_id = t.organization_id AND r.ticket_id = t.id WHERE ${base} GROUP BY g.name ORDER BY n DESC`;
          return { columns: [key === 'agent_360' ? 'Agent' : 'Team', 'Tickets', 'Solved', 'Average first reply (hours)', 'Average hours to solve', 'Average rating'], rows: r.map((x) => [x.who ?? '', Number(x.n), Number(x.solved), num(x.fr), num(x.h), num(x.rating)]) };
        }
        case 'requester_360': {
          const r = await tx.$queryRaw<{ who: string; n: bigint; open: bigint; rating: unknown }[]>`
            SELECT btrim(concat_ws(' ', p.given_name, p.family_name)) AS who, count(*) AS n, count(*) FILTER (WHERE t.system_state IN ('new', 'open', 'pending', 'on_hold')) AS open, avg(r.score) AS rating
            FROM sd_tickets t JOIN persons p ON p.organization_id = t.organization_id AND p.id = t.requester_person_id
            LEFT JOIN sd_ratings r ON r.organization_id = t.organization_id AND r.ticket_id = t.id
            WHERE ${base} AND NOT t.sensitive GROUP BY p.id, p.given_name, p.family_name ORDER BY n DESC LIMIT 100`;
          return { columns: ['Requester', 'Tickets', 'Still open', 'Average rating'], rows: r.map((x) => [x.who, Number(x.n), Number(x.open), num(x.rating)]) };
        }
        case 'csat': {
          const r = await tx.$queryRaw<{ desk: string; who: string | null; n: bigint; avg: unknown; happy: bigint }[]>`
            SELECT d.name AS desk, coalesce(u.name, u.email, 'Nobody') AS who, count(*) AS n, avg(r.score) AS avg, count(*) FILTER (WHERE r.score >= 4) AS happy
            FROM sd_ratings r JOIN sd_desks d ON d.organization_id = r.organization_id AND d.id = r.desk_id LEFT JOIN users u ON u.organization_id = r.organization_id AND u.id = r.agent_user_id
            WHERE r.organization_id = ${org}::uuid AND r.desk_id = ANY(${desks}::uuid[]) AND r.created_at >= ${from} AND r.created_at < ${to}
            GROUP BY d.name, u.name, u.email ORDER BY d.name, n DESC`;
          return { columns: ['Desk', 'Agent', 'Ratings', 'Average (1–5)', 'Happy %'], rows: r.map((x) => [x.desk, x.who ?? '', Number(x.n), num(x.avg), Number(x.n) ? Math.round((Number(x.happy) * 1000) / Number(x.n)) / 10 : null]) };
        }
        case 'funnel': {
          const f = await this.funnelIn(tx, org, desks, from, to);
          return { columns: ['Step', 'Count'], rows: f.map((s) => [s.label, s.count]) };
        }
        case 'customer_sla': {
          const r = await tx.$queryRaw<{ account: string; tier: string | null; n: bigint; kept: bigint; missed: bigint; fr: unknown; h: unknown }[]>`
            SELECT a.name AS account, max(t.plan_tier) AS tier, count(DISTINCT t.id) AS n,
              count(x.id) FILTER (WHERE x.state = 'met' AND x.breached_at IS NULL) AS kept, count(x.id) FILTER (WHERE x.breached_at IS NOT NULL) AS missed,
              avg(extract(epoch FROM t.first_response_at - t.created_at) / 3600) AS fr, avg(extract(epoch FROM t.resolved_at - t.created_at) / 3600) AS h
            FROM sd_tickets t JOIN sd_customer_accounts a ON a.organization_id = t.organization_id AND a.id = t.customer_account_id
            LEFT JOIN sd_sla_timers x ON x.organization_id = t.organization_id AND x.ticket_id = t.id AND x.kind = 'sla' AND NOT x.excluded
            WHERE ${base} GROUP BY a.name ORDER BY n DESC`;
          return { columns: ['Company', 'Plan', 'Tickets', 'Targets kept', 'Targets missed', 'Average first reply (hours)', 'Average hours to solve'], rows: r.map((x) => [x.account, x.tier, Number(x.n), Number(x.kept), Number(x.missed), num(x.fr), num(x.h)]) };
        }
      }
    });
    return { title: def.name, ...rows };
  }

  /** Hours spent in each status (from the timeline), tickets stuck there over 3 days now, and tickets that skipped "open". */
  private async timeInStatus(tx: Tx, org: string, desks: string[], from: Date, to: Date) {
    const r = await tx.$queryRaw<{ label: string; tickets: bigint; avg_h: unknown; stuck: bigint }[]>`
      WITH ev AS (
        SELECT e.ticket_id, e.to_value AS status_id, e.at,
               lead(e.at) OVER (PARTITION BY e.ticket_id ORDER BY e.at) AS next_at
        FROM sd_ticket_events e JOIN sd_tickets t ON t.organization_id = e.organization_id AND t.id = e.ticket_id
        WHERE e.organization_id = ${org}::uuid AND t.desk_id = ANY(${desks}::uuid[]) AND e.kind = 'status_changed' AND t.created_at >= ${from} AND t.created_at < ${to})
      SELECT s.label, count(DISTINCT ev.ticket_id) AS tickets, avg(extract(epoch FROM coalesce(ev.next_at, now()) - ev.at) / 3600) AS avg_h,
             count(DISTINCT ev.ticket_id) FILTER (WHERE ev.next_at IS NULL AND ev.at < now() - interval '3 days' AND s.system_state NOT IN ('solved', 'closed')) AS stuck
      FROM ev JOIN sd_statuses s ON s.organization_id = ${org}::uuid AND s.id::text = ev.status_id
      GROUP BY s.label ORDER BY avg_h DESC NULLS LAST`;
    const [skip] = await tx.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM sd_tickets t WHERE t.organization_id = ${org}::uuid AND t.desk_id = ANY(${desks}::uuid[]) AND t.created_at >= ${from} AND t.created_at < ${to}
        AND t.resolved_at IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM sd_ticket_events e JOIN sd_statuses s ON s.organization_id = e.organization_id AND s.id::text = e.to_value
          WHERE e.organization_id = t.organization_id AND e.ticket_id = t.id AND e.kind = 'status_changed' AND s.system_state = 'open')`;
    return {
      columns: ['Status', 'Tickets', 'Average hours in it', 'Stuck there over 3 days'],
      rows: [...r.map((x) => [x.label, Number(x.tickets), num(x.avg_h), Number(x.stuck)] as (string | number | null)[]), ['Solved without ever being open (skipped a step)', Number(skip?.n ?? 0), null, null]],
    };
  }

  /** US-G-223: help-centre views and searches → articles read → "this solved it" → tickets raised. No user ids. */
  private async funnelIn(tx: Tx, org: string, desks: string[], from: Date, to: Date) {
    const [e] = await tx.$queryRaw<{ searches: bigint; views: bigint; clicks: bigint; solved: bigint }[]>`
      SELECT count(*) FILTER (WHERE kind = 'search') AS searches, count(*) FILTER (WHERE kind = 'view') AS views, count(*) FILTER (WHERE kind = 'click') AS clicks, count(*) FILTER (WHERE kind = 'solved') AS solved
      FROM sd_kb_events WHERE organization_id = ${org}::uuid AND created_at >= ${from} AND created_at < ${to} AND source <> 'agent'`;
    const [t] = await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM sd_tickets WHERE organization_id = ${org}::uuid AND desk_id = ANY(${desks}::uuid[]) AND created_at >= ${from} AND created_at < ${to} AND channel IN ('portal', 'email')`;
    const solved = Number(e?.solved ?? 0);
    const raised = Number(t?.n ?? 0);
    return [
      { key: 'searches', label: 'Searches', count: Number(e?.searches ?? 0) },
      { key: 'views', label: 'Articles read', count: Number(e?.views ?? 0) },
      { key: 'clicks', label: 'Search results opened', count: Number(e?.clicks ?? 0) },
      { key: 'solved', label: '"This solved it"', count: solved },
      { key: 'raised', label: 'Tickets raised', count: raised },
      { key: 'rate', label: 'Self-service rate (%)', count: solved + raised ? Math.round((solved * 1000) / (solved + raised)) / 10 : 0 },
    ];
  }

  async funnel(a: DeskActor, q: ReportRunDto) {
    const { from, to } = this.range(q.from, q.to);
    const desks = await this.tenantPrisma.forTenant(a.ctx, (tx) => this.deskScope(tx, a, q.deskId));
    return deskSystem(this.tenantPrisma, a.ctx, (tx) => this.funnelIn(tx, a.ctx.organizationId, desks, from, to));
  }

  // ------------------------------------------------------------------------------------------ custom and scheduled reports (US-B-111)

  async customReports(a: DeskActor) {
    if (!has(a, 'desk.report.view')) throw new ForbiddenException('You cannot see desk reports (desk.report.view).');
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const rows = await tx.sdReport.findMany({ where: { organizationId: a.ctx.organizationId, OR: [{ ownerUserId: a.userId }, { shared: true }] }, orderBy: { name: 'asc' } });
      const sched = await tx.sdReportSchedule.findMany({ where: { organizationId: a.ctx.organizationId, reportId: { in: rows.map((r) => r.id) } } });
      return rows.map((r) => ({ id: r.id, name: r.name, columns: r.columns, filters: r.filters, shared: r.shared, mine: r.ownerUserId === a.userId, version: r.version, schedules: sched.filter((s) => s.reportId === r.id).map((s) => ({ id: s.id, frequency: s.frequency, recipients: s.recipients, nextRunAt: s.nextRunAt, lastRunAt: s.lastRunAt, lastResult: s.lastResult, active: s.active })) }));
    });
  }

  async saveCustom(a: DeskActor, id: string | null, dto: CustomReportDto) {
    if (!has(a, 'desk.report.manage')) throw new ForbiddenException('You cannot build reports (desk.report.manage).');
    const bad = dto.columns.filter((c) => !REPORT_COLUMNS[c]);
    if (bad.length) throw new BadRequestException(`Unknown columns: ${bad.join(', ')}`);
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      if (dto.filters.deskIds?.length) {
        const mine = await this.deskScope(tx, a);
        if (dto.filters.deskIds.some((d) => !mine.includes(d))) throw new BadRequestException('Choose desks you report on.');
      }
      const data = { name: dto.name, columns: dto.columns, filters: { ...dto.filters } as Prisma.InputJsonValue, shared: dto.shared ?? false };
      let rid: string;
      if (id) {
        const cur = await tx.sdReport.findFirst({ where: { organizationId: a.ctx.organizationId, id, ownerUserId: a.userId } });
        if (!cur) throw new NotFoundException('No such report of yours.');
        if (dto.version !== undefined && dto.version !== cur.version) throw new ConflictException('Someone changed this report. Reload to see the latest.');
        await tx.sdReport.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
        rid = id;
      } else rid = (await tx.sdReport.create({ data: { organizationId: a.ctx.organizationId, ownerUserId: a.userId, ...data } })).id;
      await audit(tx, a, id ? 'desk.report.updated' : 'desk.report.created', 'sd_report', rid, { name: dto.name, columns: dto.columns });
      return { id: rid };
    });
  }

  async deleteCustom(a: DeskActor, id: string) {
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const n = await tx.sdReport.deleteMany({ where: { organizationId: a.ctx.organizationId, id, ownerUserId: a.userId } });
      if (!n.count) throw new NotFoundException('No such report of yours.');
      await audit(tx, a, 'desk.report.deleted', 'sd_report', id, {});
      return { deleted: true };
    });
  }

  /** The rows of a custom report: only tickets this person may see (§5.7), never message text. */
  async runCustom(a: DeskActor, id: string): Promise<{ title: string; columns: string[]; rows: (string | number | null)[][] }> {
    if (!has(a, 'desk.report.view')) throw new ForbiddenException('You cannot see desk reports (desk.report.view).');
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const org = a.ctx.organizationId;
      const r = await tx.sdReport.findFirst({ where: { organizationId: org, id, OR: [{ ownerUserId: a.userId }, { shared: true }] } });
      if (!r) throw new NotFoundException('No such report.');
      const f = r.filters as { deskIds?: string[]; states?: string[]; priorities?: number[]; categoryIds?: string[]; days?: number };
      const scope = await this.deskScope(tx, a);
      const where: Prisma.SdTicketWhereInput = {
        AND: [
          await visibleTickets(tx, a),
          { deskId: { in: f.deskIds?.length ? f.deskIds.filter((d) => scope.includes(d)) : scope } },
          ...(f.states?.length ? [{ systemState: { in: f.states } }] : []),
          ...(f.priorities?.length ? [{ priority: { in: f.priorities } }] : []),
          ...(f.categoryIds?.length ? [{ categoryId: { in: f.categoryIds } }] : []),
          ...(f.days ? [{ createdAt: { gte: new Date(Date.now() - f.days * 86_400_000) } }] : []),
        ],
      };
      const tickets = await tx.sdTicket.findMany({ where, orderBy: { createdAt: 'desc' }, take: 5000 });
      const ids = (k: keyof (typeof tickets)[number]) => [...new Set(tickets.map((t) => t[k] as string | null).filter((x): x is string => Boolean(x)))];
      const [desks, statuses, cats, groups, users, persons, accounts, ratings] = await Promise.all([
        tx.sdDesk.findMany({ where: { organizationId: org, id: { in: ids('deskId') } }, select: { id: true, name: true } }),
        tx.sdStatus.findMany({ where: { organizationId: org, id: { in: ids('statusId') } }, select: { id: true, label: true } }),
        tx.sdCategory.findMany({ where: { organizationId: org, id: { in: ids('categoryId') } }, select: { id: true, name: true } }),
        tx.sdGroup.findMany({ where: { organizationId: org, id: { in: ids('groupId') } }, select: { id: true, name: true } }),
        tx.user.findMany({ where: { organizationId: org, id: { in: ids('assigneeUserId') } }, select: { id: true, name: true, email: true } }),
        tx.person.findMany({ where: { organizationId: org, id: { in: ids('requesterPersonId') } }, select: { id: true, givenName: true, familyName: true } }),
        tx.sdCustomerAccount.findMany({ where: { organizationId: org, id: { in: ids('customerAccountId') } }, select: { id: true, name: true } }),
        tx.sdRating.findMany({ where: { organizationId: org, ticketId: { in: tickets.map((t) => t.id) } }, select: { ticketId: true, score: true } }),
      ]);
      const name = <T extends { id: string }>(list: T[], id: string | null, pick: (x: T) => string) => (id ? (list.find((x) => x.id === id) ? pick(list.find((x) => x.id === id)!) : '') : '');
      const cell = (t: (typeof tickets)[number], c: string): string | number | null => {
        switch (c) {
          case 'number': return t.number;
          case 'subject': return t.subject;
          case 'desk': return name(desks, t.deskId, (x) => x.name);
          case 'status': return name(statuses, t.statusId, (x) => x.label);
          case 'state': return t.systemState;
          case 'priority': return `P${t.priority}`;
          case 'category': return name(cats, t.categoryId, (x) => x.name);
          case 'group': return name(groups, t.groupId, (x) => x.name);
          case 'assignee': return name(users, t.assigneeUserId, (x) => x.name ?? x.email);
          case 'requester': return name(persons, t.requesterPersonId, (x) => [x.givenName, x.familyName].filter(Boolean).join(' '));
          case 'account': return name(accounts, t.customerAccountId, (x) => x.name);
          case 'channel': return t.channel;
          case 'created': return t.createdAt.toISOString();
          case 'first_response': return t.firstResponseAt?.toISOString() ?? null;
          case 'resolved': return t.resolvedAt?.toISOString() ?? null;
          case 'rating': return ratings.find((x) => x.ticketId === t.id)?.score ?? null;
          case 'tags': return t.tags.join(' ');
          default: return null;
        }
      };
      await audit(tx, a, 'desk.report.run', 'sd_report', r.id, { rows: tickets.length });
      // A report that lists tickets counts as reading them (US-G-030).
      if (tickets.length) await tx.sdTicketRead.createMany({ data: tickets.map((t) => ({ organizationId: org, deskId: t.deskId, ticketId: t.id, userId: a.userId, access: 'export' })) });
      return { title: r.name, columns: r.columns.map((c) => REPORT_COLUMNS[c]), rows: tickets.map((t) => r.columns.map((c) => cell(t, c))) };
    });
  }

  async saveSchedule(a: DeskActor, reportId: string, dto: ScheduleDto) {
    if (!has(a, 'desk.report.manage')) throw new ForbiddenException('You cannot schedule reports (desk.report.manage).');
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const org = a.ctx.organizationId;
      const r = await tx.sdReport.findFirst({ where: { organizationId: org, id: reportId, ownerUserId: a.userId } });
      if (!r) throw new NotFoundException('No such report of yours.');
      // Recipients are colleagues of this company only (each copy is built with their own rights).
      const ok = await tx.user.count({ where: { organizationId: org, id: { in: dto.recipients }, status: 'active' } });
      if (ok !== new Set(dto.recipients).size) throw new BadRequestException('Send reports to active colleagues only.');
      const s = await tx.sdReportSchedule.create({ data: { organizationId: org, reportId, frequency: dto.frequency, recipients: [...new Set(dto.recipients)], nextRunAt: nextRun(dto.frequency, new Date()), createdBy: a.userId } });
      await audit(tx, a, 'desk.report.scheduled', 'sd_report', reportId, { scheduleId: s.id, frequency: dto.frequency, recipients: dto.recipients });
      return { id: s.id };
    });
  }

  async endSchedule(a: DeskActor, scheduleId: string) {
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const s = await tx.sdReportSchedule.findFirst({ where: { organizationId: a.ctx.organizationId, id: scheduleId, createdBy: a.userId } });
      if (!s) throw new NotFoundException('No such schedule of yours.');
      await tx.sdReportSchedule.update({ where: { id: s.id }, data: { active: false } });
      await audit(tx, a, 'desk.report.schedule_ended', 'sd_report', s.reportId, { scheduleId });
      return { ended: true };
    });
  }

  /** Job: due schedules; every recipient gets a copy built with their own rights (or nothing, if they lost them). */
  async sendScheduled(now = new Date()): Promise<number> {
    const due = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, (tx) => tx.$queryRaw<{ id: string; organization_id: string }[]>`SELECT id, organization_id FROM sd_report_schedules WHERE active AND next_run_at <= ${now} LIMIT 100`);
    let sent = 0;
    for (const d of due) {
      const s = await this.tenantPrisma.forTenant({ organizationId: d.organization_id, isSuperAdmin: false }, async (tx) => {
        const s = await tx.sdReportSchedule.findFirst({ where: { id: d.id, active: true, nextRunAt: { lte: now } } });
        if (s) await tx.sdReportSchedule.update({ where: { id: s.id }, data: { nextRunAt: nextRun(s.frequency, now), lastRunAt: now } });
        return s;
      });
      if (!s) continue;
      let ok = 0;
      for (const userId of s.recipients) {
        try {
          const actor = await this.access.actorFor(s.organizationId, userId);
          if (!actor || !has(actor, 'desk.report.view')) continue;
          const rep = await this.runCustom(actor, s.reportId);
          const to = await this.tenantPrisma.forTenant(actor.ctx, (tx) => tx.user.findFirst({ where: { organizationId: s.organizationId, id: userId }, select: { email: true } }));
          if (!to) continue;
          await this.email.send({ to: to.email, organizationId: s.organizationId, subject: `Report: ${rep.title}`, html: `<p>Your ${s.frequency} report "${esc(rep.title)}" is attached (${rep.rows.length} rows). It holds only tickets you may see.</p>`, text: `Your ${s.frequency} report "${rep.title}" is attached (${rep.rows.length} rows).`, attachments: [{ filename: `${rep.title.replace(/[^\w -]+/g, '').slice(0, 60) || 'report'}.csv`, content: Buffer.from(toCsv(rep.columns, rep.rows)) }] });
          ok++;
        } catch (e) {
          this.logger.warn(`Scheduled report not sent: ${(e as Error).message}`);
        }
      }
      sent += ok;
      await this.tenantPrisma.forTenant({ organizationId: s.organizationId, isSuperAdmin: false }, (tx) => tx.sdReportSchedule.update({ where: { id: s.id }, data: { lastResult: `Sent to ${ok} of ${s.recipients.length}` } }));
    }
    return sent;
  }

  // ------------------------------------------------------------------------------------------ wallboards (US-G-028)

  async wallboards(a: DeskActor) {
    if (!has(a, 'desk.report.view')) throw new ForbiddenException('You cannot see desk reports (desk.report.view).');
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const scope = await this.deskScope(tx, a);
      const rows = await tx.sdWallboard.findMany({ where: { organizationId: a.ctx.organizationId, revokedAt: null }, orderBy: { createdAt: 'desc' } });
      return rows.filter((w) => w.deskIds.every((d) => scope.includes(d))).map((w) => ({ id: w.id, name: w.name, deskIds: w.deskIds, backlogAlert: w.backlogAlert, createdAt: w.createdAt }));
    });
  }

  /** A view-only link for a wall screen, shown once. */
  async createWallboard(a: DeskActor, dto: WallboardDto) {
    if (!has(a, 'desk.report.manage')) throw new ForbiddenException('You cannot set up wall screens (desk.report.manage).');
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const scope = await this.deskScope(tx, a);
      if (dto.deskIds.some((d) => !scope.includes(d))) throw new BadRequestException('Choose desks you report on.');
      const token = randomBytes(32).toString('base64url');
      const w = await tx.sdWallboard.create({ data: { organizationId: a.ctx.organizationId, name: dto.name, deskIds: dto.deskIds, backlogAlert: dto.backlogAlert ?? null, tokenHash: sha256(token), createdBy: a.userId } });
      await audit(tx, a, 'desk.wallboard.created', 'sd_wallboard', w.id, { deskIds: dto.deskIds });
      return { id: w.id, url: `${webOrigin()}/yx/wall/${a.ctx.organizationId}/${token}` };
    });
  }

  async revokeWallboard(a: DeskActor, id: string) {
    if (!has(a, 'desk.report.manage')) throw new ForbiddenException('You cannot set up wall screens (desk.report.manage).');
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const n = await tx.sdWallboard.updateMany({ where: { organizationId: a.ctx.organizationId, id, revokedAt: null }, data: { revokedAt: new Date() } });
      if (!n.count) throw new NotFoundException('No such wall screen.');
      await audit(tx, a, 'desk.wallboard.revoked', 'sd_wallboard', id, {});
      return { revoked: true };
    });
  }

  /** The wall screen itself (no session; the secret link is the key): counts and SLA only, never ticket text. */
  async wall(org: string, token: string) {
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw new NotFoundException('This wall screen link is not valid.');
    return deskSystem(this.tenantPrisma, { organizationId: org, isSuperAdmin: false }, async (tx) => {
      const w = await tx.sdWallboard.findFirst({ where: { organizationId: org, tokenHash: sha256(token), revokedAt: null } });
      if (!w) throw new NotFoundException('This wall screen link is not valid.');
      const desks = await tx.sdDesk.findMany({ where: { organizationId: org, id: { in: w.deskIds } }, select: { id: true, name: true } });
      const rows = await tx.$queryRaw<{ desk_id: string; open: bigint; unassigned: bigint; p1: bigint; solved_today: bigint }[]>`
        SELECT desk_id, count(*) FILTER (WHERE system_state IN ('new', 'open', 'pending', 'on_hold')) AS open,
          count(*) FILTER (WHERE system_state IN ('new', 'open', 'pending', 'on_hold') AND assignee_user_id IS NULL) AS unassigned,
          count(*) FILTER (WHERE system_state IN ('new', 'open', 'pending', 'on_hold') AND priority = 1) AS p1,
          count(*) FILTER (WHERE resolved_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')) AS solved_today
        FROM sd_tickets WHERE organization_id = ${org}::uuid AND desk_id = ANY(${w.deskIds}::uuid[]) AND merged_into_id IS NULL GROUP BY desk_id`;
      const sla = await tx.$queryRaw<{ desk_id: string; soon: bigint; late: bigint }[]>`
        SELECT desk_id, count(*) FILTER (WHERE state = 'running' AND breached_at IS NULL AND due_at < now() + interval '1 hour') AS soon,
          count(*) FILTER (WHERE state IN ('running', 'paused') AND breached_at IS NOT NULL) AS late
        FROM sd_sla_timers WHERE organization_id = ${org}::uuid AND desk_id = ANY(${w.deskIds}::uuid[]) AND kind = 'sla' GROUP BY desk_id`;
      return {
        name: w.name,
        at: new Date(),
        desks: desks.map((d) => {
          const r = rows.find((x) => x.desk_id === d.id);
          const s = sla.find((x) => x.desk_id === d.id);
          return { name: d.name, open: Number(r?.open ?? 0), unassigned: Number(r?.unassigned ?? 0), urgent: Number(r?.p1 ?? 0), solvedToday: Number(r?.solved_today ?? 0), dueWithinHour: Number(s?.soon ?? 0), late: Number(s?.late ?? 0) };
        }),
      };
    });
  }

  /** Job: tell the desks' leads when a wall screen's open queue passes its alert line (at most every 2 hours). */
  async backlogAlerts(now = new Date()): Promise<number> {
    const boards = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.sdWallboard.findMany({ where: { revokedAt: null, backlogAlert: { not: null }, OR: [{ lastAlertAt: null }, { lastAlertAt: { lt: new Date(now.getTime() - 2 * 3_600_000) } }] }, take: 200 }),
    );
    let n = 0;
    for (const w of boards) {
      const ctx = { organizationId: w.organizationId, isSuperAdmin: false };
      const leads = await deskSystem(this.tenantPrisma, ctx, async (tx) => {
        const open = await tx.sdTicket.count({ where: { organizationId: w.organizationId, deskId: { in: w.deskIds }, systemState: { in: ['new', 'open', 'pending', 'on_hold'] }, mergedIntoId: null } });
        if (open <= (w.backlogAlert ?? Infinity)) return null;
        await tx.sdWallboard.update({ where: { id: w.id }, data: { lastAlertAt: now } });
        const ids = (await tx.sdDeskMember.findMany({ where: { organizationId: w.organizationId, deskId: { in: w.deskIds }, role: 'lead', ...activeOn(todayIst()) }, select: { userId: true } })).map((m) => m.userId);
        return { ids, open };
      });
      if (!leads?.ids.length) continue;
      n++;
      await this.notifications
        .notifySystem(ctx, leads.ids, 'helpdesk.backlog.alert', { entityType: 'sd_wallboard', entityId: w.id, contextText: `${w.name}: ${leads.open} open tickets`, linkPath: '/yx/desk/reports' }, { subject: `Queue alert: ${w.name}`, html: `<p>${esc(w.name)} has ${leads.open} open tickets, above the alert line of ${w.backlogAlert}.</p>` })
        .catch((e) => this.logger.warn(`Backlog alert not sent: ${(e as Error).message}`));
    }
    return n;
  }

  // ------------------------------------------------------------------------------------------ SLA reports for customers (US-B-118)

  /** One company's month against its targets (also emailed monthly to Priority Support customers' primary contacts). */
  async customerMonth(tx: Tx, org: string, accountId: string, month: string) {
    const from = new Date(`${month}-01T00:00:00+05:30`);
    const to = new Date(from);
    to.setUTCMonth(to.getUTCMonth() + 1);
    const rows = await tx.$queryRaw<{ metric: string; p: number; kept: bigint; missed: bigint }[]>`
      SELECT x.metric, t.priority AS p, count(*) FILTER (WHERE x.state = 'met' AND x.breached_at IS NULL) AS kept, count(*) FILTER (WHERE x.breached_at IS NOT NULL) AS missed
      FROM sd_sla_timers x JOIN sd_tickets t ON t.organization_id = x.organization_id AND t.id = x.ticket_id
      WHERE x.organization_id = ${org}::uuid AND t.customer_account_id = ${accountId}::uuid AND x.kind = 'sla' AND NOT x.excluded AND t.created_at >= ${from} AND t.created_at < ${to}
      GROUP BY x.metric, t.priority ORDER BY x.metric, t.priority`;
    const [n] = await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM sd_tickets WHERE organization_id = ${org}::uuid AND customer_account_id = ${accountId}::uuid AND created_at >= ${from} AND created_at < ${to}`;
    return { month, tickets: Number(n?.n ?? 0), lines: rows.map((r) => ({ measure: r.metric === 'first_response' ? 'First reply' : r.metric === 'resolution' ? 'Solved' : r.metric, severity: r.p, kept: Number(r.kept), missed: Number(r.missed) })) };
  }

  async customerSla(a: DeskActor, accountId: string, month: string) {
    if (!has(a, 'desk.report.view') || (!has(a, 'desk.customer.manage') && !has(a, 'desk.desk.create'))) throw new ForbiddenException('You cannot see customer reports.');
    if (a.accounts && !a.accounts.includes(accountId)) throw new NotFoundException('No such company.');
    return deskSystem(this.tenantPrisma, a.ctx, async (tx) => {
      const acc = await tx.sdCustomerAccount.findFirst({ where: { organizationId: a.ctx.organizationId, id: accountId }, select: { name: true } });
      if (!acc) throw new NotFoundException('No such company.');
      return { account: acc.name, ...(await this.customerMonth(tx, a.ctx.organizationId, accountId, month)) };
    });
  }

  /** Job (the 1st of each month): last month's report to the primary contacts of accounts on a "priority" plan. */
  async monthlyCustomerReports(now = new Date()): Promise<number> {
    const last = addDays(todayIst(), -1).slice(0, 7);
    const accounts = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, (tx) => tx.$queryRaw<{ id: string; organization_id: string }[]>`
      SELECT DISTINCT a.id, a.organization_id FROM sd_customer_accounts a JOIN sd_entitlements e ON e.organization_id = a.organization_id AND e.account_id = a.id
      WHERE a.status = 'active' AND e.tier = 'priority' AND e.valid_from <= ${now}::date AND (e.valid_to IS NULL OR e.valid_to >= ${now}::date - 31)`);
    let n = 0;
    for (const acc of accounts) {
      const out = await deskSystem(this.tenantPrisma, { organizationId: acc.organization_id, isSuperAdmin: false }, async (tx) => {
        const plan = await planFor(tx, acc.organization_id, acc.id);
        if (plan?.tier !== 'priority') return null;
        const rep = await this.customerMonth(tx, acc.organization_id, acc.id, last);
        const contacts = await tx.$queryRaw<{ email: string }[]>`
          SELECT p.primary_email AS email FROM sd_customer_contacts c JOIN persons p ON p.organization_id = c.organization_id AND p.id = c.person_id
          WHERE c.organization_id = ${acc.organization_id}::uuid AND c.account_id = ${acc.id}::uuid AND c.role = 'primary' AND c.status = 'active' AND p.primary_email IS NOT NULL`;
        await audit(tx, { ctx: { organizationId: acc.organization_id, isSuperAdmin: false }, userId: null as unknown as string }, 'desk.customer.monthly_report', 'sd_customer_account', acc.id, { month: last, contacts: contacts.length });
        return { rep, contacts: contacts.map((c) => c.email) };
      });
      if (!out) continue;
      const table = out.rep.lines.map((l) => `<tr><td>${esc(l.measure)}</td><td>Severity ${l.severity}</td><td>${l.kept}</td><td>${l.missed}</td></tr>`).join('');
      for (const to of out.contacts) {
        n++;
        void this.email
          .send({ to, organizationId: acc.organization_id, subject: `Your support report for ${last}`, html: `<p>Hello,</p><p>In ${last} you raised ${out.rep.tickets} tickets. Our response targets:</p><table><tr><th>Measure</th><th>Severity</th><th>On time</th><th>Late</th></tr>${table}</table>`, text: `In ${last} you raised ${out.rep.tickets} tickets.` })
          .catch((e) => this.logger.warn(`Customer report not sent: ${(e as Error).message}`));
      }
    }
    return n;
  }
}

/** The next run of a schedule, at 07:00 India time. */
export function nextRun(freq: string, from: Date): Date {
  const d = addDays(new Date(from.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10), freq === 'daily' ? 1 : freq === 'weekly' ? 7 : 0);
  if (freq === 'monthly') {
    const [y, m] = d.split('-').map(Number);
    return new Date(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01T07:00:00+05:30`);
  }
  return new Date(`${d}T07:00:00+05:30`);
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
