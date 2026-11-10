import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import type { ScopeUser } from '../access/scope';
import { audit, inCompany, type CompanyContext, type Tx } from '../org-structure/org-structure.service';
import { dayBounds, localDay } from './visitor-rules';
import { VisitorsService } from './visitors.service';
import { badgePdf, rollCallPdf } from './visitor-pdf';

// Visitors slice 4 (founder answers 607, 608, 612): the badge PDF the desk prints from the browser (no printer
// integration; the QR pass is also on the visitor's phone), reports from counts only (no names: visit_counts kept after
// deletion plus the visits still kept), and the emergency roll-call: visitors and employees on site now at one location,
// for reception, security and HR (visitors.rollcall.view or the desk key there).

const time = (d: Date, zone: string) => new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zone }).format(d);
const PURPOSE_WORDS: Record<string, string> = { meeting: 'Meeting', interview: 'Interview', vendor: 'Vendor', audit: 'Audit', delivery: 'Delivery', maintenance: 'Maintenance' };
const month = (iso: string) => iso.slice(0, 7);

@Injectable()
export class VisitorReportsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly visitors: VisitorsService,
  ) {}

  private async company(tx: Tx, c: CompanyContext) {
    return (await tx.organization.findFirst({ where: { id: c.organizationId }, select: { name: true } }))?.name ?? '';
  }

  /* ---------------- 607 the badge ---------------- */

  /** A label-size PDF for a visitor on site (reception at the location); refused where the location uses the pass on the phone only. */
  async badge(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.visitors.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const row = await this.visitors.find(tx, c, id);
      const loc = await this.visitors.deskLoc(tx, c, v, row.locationId);
      if ((await this.visitors.setting(tx, c, 'visitors.badge', loc.id)) === 'phone_only') throw new ConflictException(`${loc.name} uses the pass on the visitor's phone; no badge is printed (Settings › Visitors).`);
      if (row.status !== 'on_site') throw new ConflictException('Print a badge after check-in, while the visitor is on site.');
      const [view] = await this.visitors.views(tx, c, [row]);
      await audit(tx, c, 'visitor.badge_printed', 'visit', row.id, { badge: view!.badge });
      return badgePdf({
        company: await this.company(tx, c),
        location: loc.name,
        name: row.visitorName,
        visitorCompany: row.visitorCompany,
        host: view!.host,
        validUntil: `${time(row.endsAt, loc.timezone)}, ${localDay(row.endsAt, loc.timezone)}`,
        badge: view!.badge!,
        passCode: row.passCode,
        minorAdult: row.minor ? row.minorAdult : null,
        // Answer 713: the photo on a photo badge. shortcut: the visitor photo is stored by slice 2 (not on this branch);
        // after the slice 2 merge, read its clean photo file here for a 'photo_qr' location. Until then the name badge prints.
        photo: null,
      });
    });
  }

  /* ---------------- 608 reports (counts only) ---------------- */

  /** Visits by location, purpose and month over the last 12 months (or from-to), for the locations the log reaches. */
  async reports(ctx: TenantContext, user: ScopeUser, q: { from?: string; to?: string; locationId?: string }) {
    const v = await this.visitors.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const locs = await this.visitors.reach(tx, c, v, ['visitors.desk.manage', 'visitors.log.view']);
      if (q.locationId && !locs.some((l) => l.id === q.locationId)) {
        if (!(await tx.location.findFirst({ where: { organizationId: c.organizationId, id: q.locationId }, select: { id: true } }))) throw new NotFoundException('Location not found.');
        throw new ForbiddenException('Visitor reports for that location need the visitor log key there.');
      }
      if (!locs.length) throw new ForbiddenException('Visitor reports need the visitor log or desk key.');
      const ids = q.locationId ? [q.locationId] : locs.map((l) => l.id);
      const today = localDay(new Date(), 'Asia/Kolkata');
      const to = q.to ?? today;
      const from = q.from ?? `${Number(today.slice(0, 4)) - 1}-${today.slice(5, 7)}-01`;
      if (from > to) throw new ConflictException('The report starts after it ends.');
      // The same day key the retention sweep keeps (608): the UTC day the visit started.
      const kept = await tx.visitCount.findMany({ where: { organizationId: c.organizationId, locationId: { in: ids }, day: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } } });
      const live = await tx.$queryRaw<{ location_id: string; day: Date; purpose: string; visits: number }[]>`
        SELECT location_id, (starts_at AT TIME ZONE 'UTC')::date AS day, purpose, count(*)::int AS visits FROM visits
        WHERE organization_id = ${c.organizationId}::uuid AND location_id = ANY(${ids}::uuid[]) AND status IN ('on_site', 'checked_out', 'not_out')
          AND (starts_at AT TIME ZONE 'UTC')::date BETWEEN ${from}::date AND ${to}::date
        GROUP BY 1, 2, 3`;
      const rows = [...kept.map((k) => ({ loc: k.locationId, day: k.day.toISOString().slice(0, 10), purpose: k.purpose, n: k.visits })), ...live.map((l) => ({ loc: l.location_id, day: l.day.toISOString().slice(0, 10), purpose: l.purpose, n: l.visits }))];
      const sum = (key: (r: (typeof rows)[number]) => string) => {
        const m = new Map<string, number>();
        for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + r.n);
        return m;
      };
      const byLoc = sum((r) => r.loc);
      const byPurpose = sum((r) => r.purpose);
      const byMonth = sum((r) => month(r.day));
      return {
        from,
        to,
        locations: locs.map((l) => ({ value: l.id, label: l.name })),
        total: rows.reduce((a, r) => a + r.n, 0),
        byLocation: locs.filter((l) => ids.includes(l.id)).map((l) => ({ label: l.name, visits: byLoc.get(l.id) ?? 0 })),
        byPurpose: Object.keys(PURPOSE_WORDS).map((p) => ({ label: PURPOSE_WORDS[p]!, visits: byPurpose.get(p) ?? 0 })).filter((x) => x.visits > 0),
        byMonth: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, visits]) => ({ month: m, visits })),
      };
    });
  }

  /* ---------------- 612 the emergency roll-call ---------------- */

  private async rollCallLoc(tx: Tx, c: CompanyContext, user: ScopeUser, locationId: string) {
    const v = await this.visitors.viewer(user);
    const reach = await this.visitors.reach(tx, c, v, ['visitors.rollcall.view', 'visitors.desk.manage']);
    const loc = reach.find((l) => l.id === locationId);
    if (loc) return { loc, reach };
    if (!(await tx.location.findFirst({ where: { organizationId: c.organizationId, id: locationId }, select: { id: true } }))) throw new NotFoundException('Location not found.');
    throw new ForbiddenException('The roll-call is for reception, security and HR at this location.');
  }

  /** Everyone on site now at a location: visitors checked in and not out; employees whose last check-in today was here. */
  async rollCall(ctx: TenantContext, user: ScopeUser, locationId?: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const v = await this.visitors.viewer(user);
      const reach = await this.visitors.reach(tx, c, v, ['visitors.rollcall.view', 'visitors.desk.manage']);
      // A location asked for is checked first: another company's is not found (404), one out of reach is 403.
      if (!locationId && !reach.length) throw new ForbiddenException('The roll-call is for reception, security and HR.');
      const { loc } = await this.rollCallLoc(tx, c, user, locationId ?? reach[0]!.id);
      const now = new Date();
      const visits = await tx.visit.findMany({ where: { organizationId: c.organizationId, locationId: loc.id, status: 'on_site' }, orderBy: { checkedInAt: 'asc' } });
      const views = await this.visitors.views(tx, c, visits);
      const { from } = dayBounds(localDay(now, loc.timezone), loc.timezone);
      // The last check-in or check-out of each employee today (any place): on site here when it is a check-in here.
      const last = await tx.$queryRaw<{ id: string; kind: string; at: Date; location_id: string | null; name: string; code: string | null }[]>`
        SELECT DISTINCT ON (p.employee_id) p.employee_id::text AS id, p.kind, p.punched_at AS at, p.location_id::text AS location_id,
               concat_ws(' ', coalesce(e.preferred_name, e.given_name), e.family_name) AS name,
               (SELECT m.employee_code::text FROM employments m WHERE m.organization_id = e.organization_id AND m.employee_id = e.id ORDER BY m.joined_on DESC LIMIT 1) AS code
        FROM punches p JOIN employees e ON e.organization_id = p.organization_id AND e.id = p.employee_id
        WHERE p.organization_id = ${c.organizationId}::uuid AND p.accepted AND p.kind IN ('in', 'out') AND p.punched_at >= ${from} AND p.punched_at <= ${now}
        ORDER BY p.employee_id, p.punched_at DESC`;
      const employees = last.filter((p) => p.kind === 'in' && p.location_id === loc.id).sort((a, b) => a.name.localeCompare(b.name));
      return {
        location: { id: loc.id, name: loc.name },
        locations: reach.map((l) => ({ value: l.id, label: l.name })),
        at: now.toISOString(),
        atText: `${time(now, loc.timezone)}, ${localDay(now, loc.timezone)}`,
        visitors: views.map((x) => ({ id: x.id, name: x.name, company: x.company, host: x.host, badge: x.badge, inAt: x.checkedInAt, minorAdult: x.minor ? x.minorAdult : null })),
        employees: employees.map((e) => ({ id: e.id, name: e.name, code: e.code, inAt: e.at.toISOString() })),
      };
    });
  }

  /** The roll-call as one printable A4 PDF (audited: who printed it, when, for which location). */
  async rollCallPdf(ctx: TenantContext, user: ScopeUser, locationId: string) {
    const r = await this.rollCall(ctx, user, locationId);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const loc = await tx.location.findFirstOrThrow({ where: { organizationId: c.organizationId, id: r.location.id }, select: { timezone: true } });
      await audit(tx, c, 'visitor.rollcall_printed', 'location', r.location.id, { visitors: r.visitors.length, employees: r.employees.length });
      return rollCallPdf({
        company: await this.company(tx, c),
        location: r.location.name,
        at: r.atText,
        visitors: r.visitors.map((x) => ({ ...x, inAt: x.inAt ? time(new Date(x.inAt), loc.timezone) : '—' })),
        employees: r.employees.map((e) => ({ ...e, inAt: time(new Date(e.inAt), loc.timezone) })),
      });
    });
  }
}
