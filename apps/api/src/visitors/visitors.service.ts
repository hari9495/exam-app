import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditService, BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { buildViewer, type ScopeUser, type Viewer } from '../access/scope';
import { audit, inCompany, type CompanyContext, type Tx } from '../org-structure/org-structure.service';
import { OrgSettingsService } from '../org-structure/org-settings.service';
import { SETTINGS, resolveSetting } from '../org-structure/settings-registry';
import { EmailService } from '../email/email.service';
import { escapeHtml } from '../notifications/notification-email-render';
import { publicBrand } from '../public-applications/public-brand';
import type { AcceptVisitDto, CheckInDto, FindPassDto, InviteVisitorDto } from './visitors-dto';
import { STATUS_WORDS, badgeText, checkInProblem, dayBounds, localDay, maskMobile, normalCode, normalMobile, noticeVersion, passCode, passToken, visitWindow, type VisitStatus } from './visitor-rules';

// Visitors slice 1 (M02 §B11, YX-AT-22; founder answers 601-617). Every employee may invite a visitor (they are the
// host); reception (visitors.desk.manage) runs the desk at the locations its grant reaches; the log needs
// visitors.log.view (or the desk key) there; Settings 3.12 needs visitors.settings.manage or org.settings.manage. Nothing
// is changed while acting for someone else. The visitor's own page is reached by an unguessable link. Visits are deleted
// after the location's retention period (608), keeping counts without names; visits nobody checked out are closed at the
// end of their window (611).

const KEYS = ['visitors.desk.manage', 'visitors.log.view', 'visitors.settings.manage', 'org.settings.manage'] as const;
export const VISITOR_SETTING_KEYS = ['visitors.host_timeout_minutes', 'visitors.id_capture', 'visitors.photo', 'visitors.hours_from', 'visitors.hours_to', 'visitors.notice', 'visitors.badge', 'visitors.retention_days', 'visitors.id_retention_days'] as const;
type VisitorSettingKey = (typeof VISITOR_SETTING_KEYS)[number];
const LOOKUP: TenantContext = { organizationId: null, isSuperAdmin: true };
const frontend = () => process.env.FRONTEND_URL ?? 'http://localhost:3000';

type Loc = { id: string; name: string; timezone: string; address: unknown; legalEntityId: string };
type VisitRow = Awaited<ReturnType<Tx['visit']['findFirstOrThrow']>>;

@Injectable()
export class VisitorsService {
  private readonly logger = new Logger(VisitorsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly settings: OrgSettingsService,
    private readonly email: EmailService,
    private readonly blob: BlobStorageService,
  ) {}

  /* ---------------- access ---------------- */

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, [...KEYS]);
  }

  /** The locations a key reaches: every location for a company-wide grant, else the granted locations and entities. */
  private async reach(tx: Tx, c: CompanyContext, v: Viewer, keys: readonly string[]): Promise<Loc[]> {
    const scopes = keys.flatMap((k) => v.scopes.get(k) ?? []);
    if (!scopes.length) return [];
    const all = await tx.location.findMany({ where: { organizationId: c.organizationId, archivedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, timezone: true, address: true, legalEntityId: true } });
    if (scopes.some((s) => s.type === 'tenant')) return all;
    const locs = new Set(scopes.filter((s) => s.type === 'location').map((s) => s.id));
    const ents = new Set(scopes.filter((s) => s.type === 'legal_entity').map((s) => s.id));
    return all.filter((l) => locs.has(l.id) || ents.has(l.legalEntityId));
  }

  private own(v: Viewer, what = 'this') {
    if (v.actingForOther) throw new ForbiddenException(`You can't change ${what} while acting for someone else. Sign in as yourself.`);
  }

  /** A location setting's value (the location's own, else the company's, else the default). */
  private async setting(tx: Tx, c: CompanyContext, key: VisitorSettingKey, locationId: string | null): Promise<string> {
    const rows = await tx.setting.findMany({ where: { organizationId: c.organizationId, key } });
    const r = resolveSetting(SETTINGS[key]!, rows.map((x) => ({ id: x.id, scopeType: x.scopeType, scopeId: x.scopeId, value: x.value, validFrom: null })), { tenant: c.organizationId, ...(locationId ? { location: locationId } : {}) }, null);
    return String(r.value);
  }

  /** For the pages: the locations to invite to, the desk and log locations, and what the person may do. */
  async options(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const all = await tx.location.findMany({ where: { organizationId: c.organizationId, archivedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
      const desk = await this.reach(tx, c, v, ['visitors.desk.manage']);
      const log = await this.reach(tx, c, v, ['visitors.desk.manage', 'visitors.log.view']);
      return {
        locations: all.map((l) => ({ value: l.id, label: l.name })),
        desk: desk.map((l) => ({ value: l.id, label: l.name })),
        log: log.map((l) => ({ value: l.id, label: l.name })),
        canSettings: v.grants.has('visitors.settings.manage') || v.grants.has('org.settings.manage'),
        acting: v.actingForOther,
      };
    });
  }

  /* ---------------- hosts (VIS-02) ---------------- */

  /** The host's own visitors: upcoming first, then the last 90 days. */
  async mine(ctx: TenantContext, user: ScopeUser) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const since = new Date(Date.now() - 90 * 86_400_000);
      const rows = await tx.visit.findMany({ where: { organizationId: c.organizationId, hostUserId: user.userId!, endsAt: { gte: since } }, orderBy: { startsAt: 'desc' }, take: 200 });
      return this.views(tx, c, rows);
    });
  }

  /** Answer 609: the host invites a visitor; the pass goes by email with the link to the visitor's own page. */
  async invite(ctx: TenantContext, user: ScopeUser, dto: InviteVisitorDto) {
    const v = await this.viewer(user);
    this.own(v, 'an invite');
    const mobile = normalMobile(dto.mobile);
    if (!mobile) throw new BadRequestException('Enter a 10-digit mobile number, or + and the country code for a number outside India.');
    const made = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const loc = await tx.location.findFirst({ where: { organizationId: c.organizationId, id: dto.locationId, archivedAt: null }, select: { id: true, name: true, timezone: true } });
      if (!loc) throw new NotFoundException('Location not found.');
      const w = visitWindow(dto.day, dto.from, dto.to, loc.timezone, new Date());
      if ('problem' in w) throw new BadRequestException(w.problem);
      const host = await tx.user.findFirst({ where: { organizationId: c.organizationId, id: user.userId!, status: 'active' }, select: { id: true, name: true, email: true } });
      if (!host) throw new ForbiddenException('Only an active person of the company can invite a visitor.');
      let row: VisitRow | null = null;
      for (let i = 0; i < 5 && !row; i++) {
        const code = passCode();
        if (await tx.visit.findFirst({ where: { organizationId: c.organizationId, passCode: code }, select: { id: true } })) continue;
        row = await tx.visit.create({
          data: {
            organizationId: c.organizationId, locationId: loc.id, hostUserId: host.id, visitorName: dto.name, visitorMobile: mobile, visitorEmail: dto.email.toLowerCase(), visitorCompany: dto.company || null,
            purpose: dto.purpose, vehicle: dto.vehicle?.toUpperCase() || null, startsAt: w.startsAt, endsAt: w.endsAt, passToken: passToken(), passCode: code, createdBy: host.id,
          },
        });
      }
      if (!row) throw new ConflictException('Could not make a pass code. Try again.');
      await audit(tx, c, 'visitor.invited', 'visit', row.id, { locationId: loc.id, day: dto.day, purpose: dto.purpose });
      return { row, loc, host };
    });
    const sent = await this.sendInvite(ctx.organizationId!, made.row, made.loc, made.host.name || made.host.email);
    return { ...(await inCompany(this.tenantPrisma, ctx, async (tx, c) => (await this.views(tx, c, [made.row]))[0]!)), emailed: sent };
  }

  private async sendInvite(organizationId: string, row: VisitRow, loc: { name: string; timezone: string }, host: string) {
    const esc = escapeHtml;
    const when = `${localDay(row.startsAt, loc.timezone)}, ${fmtTime(row.startsAt, loc.timezone)} to ${fmtTime(row.endsAt, loc.timezone)}`;
    const link = `${frontend()}/yx/visit/${row.passToken}`;
    const brand = await publicBrand(this.tenantPrisma, this.blob, organizationId);
    const res = await this.email
      .send({
        to: row.visitorEmail!,
        organizationId,
        subject: `Your visit to ${brand.orgName} on ${localDay(row.startsAt, loc.timezone)}`,
        html: `<p>${esc(host)} invited you to ${esc(brand.orgName)}, ${esc(loc.name)}, on ${esc(when)}.</p><p><a href="${link}">Open your visitor pass</a>: check your details, read the visitor notice and show the QR code at reception.</p><p>If you were not expecting this, you can ignore this email.</p>`,
      })
      .catch((e: Error) => (this.logger.warn(`visitor invite ${row.id}: ${e.message}`), { success: false }));
    return Boolean(res.success);
  }

  /** The host (their own invite) or reception (in scope) cancels an expected visit; the pass stops working. */
  async cancel(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    this.own(v, 'a visit');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const row = await this.find(tx, c, id);
      const desk = (await this.reach(tx, c, v, ['visitors.desk.manage'])).some((l) => l.id === row.locationId);
      if (row.hostUserId !== user.userId && !desk) throw new ForbiddenException('Only the host or reception can cancel this visit.');
      if (row.status !== 'expected') throw new ConflictException(`This visit is ${STATUS_WORDS[row.status as VisitStatus].toLowerCase()}; only an expected visit can be cancelled.`);
      const done = await tx.visit.update({ where: { id: row.id }, data: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: user.userId! } });
      await audit(tx, c, 'visitor.cancelled', 'visit', row.id, {});
      return (await this.views(tx, c, [done]))[0]!;
    });
  }

  /* ---------------- reception (VIS-01) ---------------- */

  private async deskLoc(tx: Tx, c: CompanyContext, v: Viewer, locationId: string) {
    const loc = (await this.reach(tx, c, v, ['visitors.desk.manage'])).find((l) => l.id === locationId);
    if (!loc) {
      const exists = await tx.location.findFirst({ where: { organizationId: c.organizationId, id: locationId }, select: { id: true } });
      if (!exists) throw new NotFoundException('Location not found.');
      throw new ForbiddenException('You run the visitor desk at other locations only.');
    }
    return loc;
  }

  /** Today's visitors at a location (its own day), and everyone still on site from before. */
  async desk(ctx: TenantContext, user: ScopeUser, locationId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const loc = await this.deskLoc(tx, c, v, locationId);
      const today = localDay(new Date(), loc.timezone);
      const { from, to } = dayBounds(today, loc.timezone);
      const rows = await tx.visit.findMany({
        where: { organizationId: c.organizationId, locationId: loc.id, OR: [{ startsAt: { gte: from, lt: to } }, { status: 'on_site' }] },
        orderBy: { startsAt: 'asc' },
        take: 500,
      });
      return { location: { id: loc.id, name: loc.name }, today, canChange: !v.actingForOther, visits: await this.views(tx, c, rows) };
    });
  }

  /** A pass code typed or scanned at reception: the visit, if it is this company's and this location's. */
  async findPass(ctx: TenantContext, user: ScopeUser, dto: FindPassDto) {
    const v = await this.viewer(user);
    const code = normalCode(dto.code);
    if (!code) throw new BadRequestException('A pass code looks like V-7KQ2-MX4P.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const loc = await this.deskLoc(tx, c, v, dto.locationId);
      const row = await tx.visit.findFirst({ where: { organizationId: c.organizationId, passCode: code } });
      if (!row) throw new NotFoundException('No visit has that pass code. Check the code, or ask who they are visiting.');
      if (row.locationId !== loc.id) {
        const other = await tx.location.findFirst({ where: { organizationId: c.organizationId, id: row.locationId }, select: { name: true } });
        throw new ConflictException(`This pass is for ${other?.name ?? 'another location'}.`);
      }
      return (await this.views(tx, c, [row]))[0]!;
    });
  }

  /** Reception checks a visitor in: on their day and before the window ends; the notice is accepted first (on the link or here). */
  async checkIn(ctx: TenantContext, user: ScopeUser, id: string, dto: CheckInDto) {
    const v = await this.viewer(user);
    this.own(v, 'a visit');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const row = await this.find(tx, c, id);
      const loc = await this.deskLoc(tx, c, v, row.locationId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`visit_badge:${c.organizationId}`}))`;
      const fresh = await this.find(tx, c, id);
      const problem = checkInProblem({ status: fresh.status as VisitStatus, startsAt: fresh.startsAt, endsAt: fresh.endsAt }, loc.timezone, new Date());
      if (problem) throw new ConflictException(problem);
      const notice = (await this.setting(tx, c, 'visitors.notice', loc.id)).trim();
      const atDesk = !fresh.noticeAcceptedAt;
      if (atDesk && !dto.noticeAccepted) throw new BadRequestException('Tick that the visitor read and accepted the notice.');
      const last = await tx.visit.aggregate({ where: { organizationId: c.organizationId }, _max: { badgeSeq: true } });
      const done = await tx.visit.update({
        where: { id: fresh.id },
        data: {
          status: 'on_site', checkedInAt: new Date(), checkedInBy: user.userId!, badgeSeq: (last._max.badgeSeq ?? 0) + 1,
          ...(atDesk ? { noticeAcceptedAt: new Date(), noticeAcceptedVia: 'desk', noticeVersion: noticeVersion(notice) } : {}),
        },
      });
      await audit(tx, c, 'visitor.checked_in', 'visit', fresh.id, { locationId: loc.id, notice: atDesk ? 'desk' : 'link' });
      return (await this.views(tx, c, [done]))[0]!;
    });
  }

  async checkOut(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    this.own(v, 'a visit');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const row = await this.find(tx, c, id);
      await this.deskLoc(tx, c, v, row.locationId);
      const { count } = await tx.visit.updateMany({ where: { id: row.id, status: 'on_site' }, data: { status: 'checked_out', checkedOutAt: new Date(), checkedOutBy: user.userId! } });
      if (!count) throw new ConflictException('This visitor is not checked in.');
      await audit(tx, c, 'visitor.checked_out', 'visit', row.id, {});
      return (await this.views(tx, c, [await this.find(tx, c, id)]))[0]!;
    });
  }

  /* ---------------- log (VIS-04) ---------------- */

  /** Every visit that came in (or was closed unchecked) at the locations in reach, newest first, with days left before deletion. */
  async log(ctx: TenantContext, user: ScopeUser, q: { locationId?: string; from?: string; to?: string }) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const locs = await this.reach(tx, c, v, ['visitors.desk.manage', 'visitors.log.view']);
      if (!locs.length) throw new ForbiddenException('The visitor log needs the visitor log or desk key.');
      if (q.locationId && !locs.some((l) => l.id === q.locationId)) throw new NotFoundException('Location not found.');
      const ids = q.locationId ? [q.locationId] : locs.map((l) => l.id);
      const rows = await tx.visit.findMany({
        where: {
          organizationId: c.organizationId, locationId: { in: ids }, status: { in: ['on_site', 'checked_out', 'not_out'] },
          ...(q.from || q.to ? { startsAt: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}), ...(q.to ? { lt: new Date(Date.parse(`${q.to}T00:00:00Z`) + 86_400_000) } : {}) } } : {}),
        },
        orderBy: { startsAt: 'desc' },
        take: 2000,
      });
      const keep = new Map<string, number>();
      for (const id of new Set(rows.map((r) => r.locationId))) keep.set(id, Number(await this.setting(tx, c, 'visitors.retention_days', id)));
      const views = await this.views(tx, c, rows);
      return { locations: locs.map((l) => ({ value: l.id, label: l.name })), visits: views.map((x, i) => ({ ...x, deletedOn: new Date(rows[i]!.endsAt.getTime() + keep.get(rows[i]!.locationId)! * 86_400_000).toISOString().slice(0, 10) })) };
    });
  }

  /** The log for auditors, as CSV (names and times only; no mobile numbers). */
  async logCsv(ctx: TenantContext, user: ScopeUser, q: { locationId?: string; from?: string; to?: string }) {
    const { visits } = await this.log(ctx, user, q);
    const cell = (s: string | null) => `"${(s ?? '').replace(/"/g, '""').replace(/^[=+\-@]/, "'$&")}"`;
    const lines = [['Visitor', 'Company', 'Host', 'Purpose', 'Location', 'In', 'Out', 'Status', 'Notice accepted'].join(',')];
    for (const x of visits) lines.push([x.name, x.company, x.host, x.purpose, x.location, x.checkedInAt, x.checkedOutAt, x.statusText, x.noticeAcceptedAt ? 'Yes' : 'No'].map(cell).join(','));
    await inCompany(this.tenantPrisma, ctx, (tx, c) => audit(tx, c, 'visitor.log_exported', 'visit', c.organizationId, { rows: visits.length, locationId: q.locationId ?? null }));
    return `${lines.join('\r\n')}\r\n`;
  }

  /* ---------------- the visitor's own page (T9-14) ---------------- */

  private async byToken(token: string) {
    if (!/^[A-Za-z0-9_-]{32}$/.test(token)) throw new NotFoundException('This visitor pass link is not valid.');
    const row = await this.tenantPrisma.forTenant(LOOKUP, (tx) => tx.visit.findUnique({ where: { passToken: token } }));
    if (!row) throw new NotFoundException('This visitor pass link is not valid.');
    return row;
  }

  /** What the visitor sees: their details (mobile masked), the notice, and the pass once they accepted it. */
  async publicVisit(token: string) {
    const row = await this.byToken(token);
    const c = { organizationId: row.organizationId, isSuperAdmin: true } as CompanyContext;
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const loc = await tx.location.findFirstOrThrow({ where: { organizationId: row.organizationId, id: row.locationId }, select: { name: true, timezone: true, address: true } });
      const host = await tx.user.findFirst({ where: { organizationId: row.organizationId, id: row.hostUserId }, select: { name: true, email: true } });
      const notice = (await this.setting(tx, c, 'visitors.notice', row.locationId)).trim();
      const hours = `${await this.setting(tx, c, 'visitors.hours_from', row.locationId)} to ${await this.setting(tx, c, 'visitors.hours_to', row.locationId)}`;
      const retention = await this.setting(tx, c, 'visitors.retention_days', row.locationId);
      const state = row.status === 'cancelled' ? 'blocked' : row.status !== 'expected' && row.status !== 'on_site' ? 'expired' : row.endsAt <= new Date() ? 'expired' : row.noticeAcceptedAt ? 'pass' : 'details';
      const addr = (loc.address ?? {}) as { lines?: string[]; city?: string; postalCode?: string };
      return {
        state,
        visitor: row.visitorName,
        mobile: maskMobile(row.visitorMobile),
        company: row.visitorCompany ?? '',
        purpose: row.purpose,
        host: (host?.name || host?.email || '').split(' ')[0],
        location: loc.name,
        address: [...(addr.lines ?? []), addr.city, addr.postalCode].filter(Boolean).join(', '),
        timeZone: loc.timezone,
        window: { from: row.startsAt.toISOString(), to: row.endsAt.toISOString() },
        vehicle: row.vehicle,
        hours,
        retentionDays: Number(retention),
        notice,
        noticeVersion: noticeVersion(notice),
        passCode: state === 'pass' ? row.passCode : null,
        brand: await publicBrand(this.tenantPrisma, this.blob, row.organizationId),
      };
    });
  }

  /** The visitor accepts the notice they read (its version) before the pass shows; a changed notice must be read again. */
  async acceptVisit(token: string, dto: AcceptVisitDto) {
    const row = await this.byToken(token);
    const c = { organizationId: row.organizationId, isSuperAdmin: true } as CompanyContext;
    await this.tenantPrisma.forTenant(c, async (tx) => {
      if (row.status === 'cancelled') throw new ConflictException('This visit was cancelled. Please contact your host.');
      if (row.status !== 'expected' || row.endsAt <= new Date()) throw new ConflictException('This visit pass has expired. Ask your host to invite you again.');
      const version = noticeVersion((await this.setting(tx, c, 'visitors.notice', row.locationId)).trim());
      if (dto.noticeVersion !== version) throw new ConflictException('The visitor notice changed while you were reading it. Reload the page and read it again.');
      await tx.visit.update({ where: { id: row.id }, data: { noticeAcceptedAt: row.noticeAcceptedAt ?? new Date(), noticeAcceptedVia: row.noticeAcceptedVia ?? 'link', noticeVersion: version, ...(dto.vehicle !== undefined ? { vehicle: dto.vehicle.toUpperCase() || null } : {}) } });
      if (!row.noticeAcceptedAt) await AuditService.recordIn(tx, c, { actorUserId: null, action: 'visitor.notice_accepted', entityType: 'visit', entityId: row.id, metadata: { version, via: 'link' } });
    });
    return this.publicVisit(token);
  }

  /* ---------------- Settings 3.12 ---------------- */

  async readSettings(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    const canRead = v.grants.has('visitors.settings.manage') || v.grants.has('org.settings.manage') || v.grants.has('visitors.desk.manage');
    if (!canRead) throw new ForbiddenException('Settings 3.12 needs the visitor settings key.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.setting.findMany({ where: { organizationId: c.organizationId, key: { in: [...VISITOR_SETTING_KEYS] } } });
      const locs = new Map((await tx.location.findMany({ where: { organizationId: c.organizationId }, select: { id: true, name: true } })).map((l) => [l.id, l.name]));
      const company = (k: string) => rows.find((r) => r.key === k && r.scopeType === 'tenant');
      const last = rows.filter((r) => r.updatedBy).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
      const by = last ? await tx.user.findFirst({ where: { organizationId: c.organizationId, id: last.updatedBy! }, select: { name: true, email: true } }) : null;
      return {
        canEdit: (v.grants.has('visitors.settings.manage') || v.grants.has('org.settings.manage')) && !v.actingForOther,
        values: Object.fromEntries(VISITOR_SETTING_KEYS.map((k) => [k, String(company(k)?.value ?? SETTINGS[k]!.default)])),
        defaults: Object.fromEntries(VISITOR_SETTING_KEYS.map((k) => [k, SETTINGS[k]!.default])),
        choices: Object.fromEntries(VISITOR_SETTING_KEYS.map((k) => [k, SETTINGS[k]!.values])),
        labels: { 'visitors.badge': SETTINGS['visitors.badge']!.labels ?? {} },
        // Locations with their own value (set on the company rules page), named on the field.
        overrides: Object.fromEntries(VISITOR_SETTING_KEYS.map((k) => [k, rows.filter((r) => r.key === k && r.scopeType === 'location').map((r) => locs.get(r.scopeId) ?? 'A location')])),
        lastChange: last ? { by: by?.name || by?.email || 'Someone', at: last.updatedAt, what: `Changed ${SETTINGS[last.key]!.label.replace(/^Visitors: /, '').toLowerCase()}` } : null,
      };
    });
  }

  /** Company-wide values, each an audited company setting (a bad value saves nothing). */
  async saveSettings(ctx: TenantContext, user: ScopeUser, changes: { key: string; value: string }[]) {
    const v = await this.viewer(user);
    this.own(v, 'settings');
    if (!(v.grants.has('visitors.settings.manage') || v.grants.has('org.settings.manage'))) throw new ForbiddenException('Only Facility admins or HR with the settings key can change visitor settings.');
    const seen = new Set<string>();
    for (const ch of changes) {
      if (!(VISITOR_SETTING_KEYS as readonly string[]).includes(ch.key)) throw new BadRequestException(`${ch.key} is not a visitor setting.`);
      if (seen.has(ch.key)) throw new BadRequestException(`${SETTINGS[ch.key]!.label} is in the list twice.`);
      seen.add(ch.key);
      const def = SETTINGS[ch.key]!;
      if (def.text) {
        if (!ch.value.trim() || ch.value.length > def.text.maxLength || /[<>]/.test(ch.value)) throw new BadRequestException(`${def.label}: write up to ${def.text.maxLength} characters (no < or >).`);
      } else if (!def.values.includes(ch.value)) throw new BadRequestException(`${def.label} is one of: ${def.values.join(', ')}`);
    }
    const values = Object.fromEntries(changes.map((ch) => [ch.key, ch.value]));
    const from = values['visitors.hours_from'], to = values['visitors.hours_to'];
    if (from || to) {
      const now = await inCompany(this.tenantPrisma, ctx, async (tx, c) => ({ f: from ?? (await this.setting(tx, c, 'visitors.hours_from', null)), t: to ?? (await this.setting(tx, c, 'visitors.hours_to', null)) }));
      if (now.t <= now.f) throw new BadRequestException('Visitors must be allowed until a time after they are allowed from.');
    }
    for (const ch of changes) await this.settings.set(ctx, { key: ch.key, scopeType: 'tenant', value: ch.value } as Parameters<OrgSettingsService['set']>[1]);
    return this.readSettings(ctx, user);
  }

  /* ---------------- scheduled (611, 608) ---------------- */

  /** Answer 611: visits nobody checked out are closed at the end of their window; expected visitors who never came are no-shows. */
  async closeSweep(now = new Date()): Promise<number> {
    return this.tenantPrisma.forTenant(LOOKUP, async (tx) => {
      const out = await tx.visit.findMany({ where: { status: 'on_site', endsAt: { lte: now } }, select: { id: true, organizationId: true } });
      const gone = await tx.visit.findMany({ where: { status: 'expected', endsAt: { lte: now } }, select: { id: true, organizationId: true } });
      if (out.length) await tx.visit.updateMany({ where: { id: { in: out.map((x) => x.id) }, status: 'on_site' }, data: { status: 'not_out', closedAt: now } });
      if (gone.length) await tx.visit.updateMany({ where: { id: { in: gone.map((x) => x.id) }, status: 'expected' }, data: { status: 'no_show', closedAt: now } });
      for (const org of new Set([...out, ...gone].map((x) => x.organizationId))) {
        const ctx = { organizationId: org, isSuperAdmin: true };
        await AuditService.recordIn(tx, ctx, { actorUserId: null, action: 'visitor.auto_closed', entityType: 'visit', entityId: org, metadata: { notCheckedOut: out.filter((x) => x.organizationId === org).length, noShow: gone.filter((x) => x.organizationId === org).length } });
      }
      return out.length + gone.length;
    });
  }

  /**
   * Answer 608: a visit is deleted after its location's retention period (counted from the end of the visit); what is
   * left is a count by location, day and purpose, with no name.
   */
  async retentionSweep(now = new Date()): Promise<number> {
    const places = await this.tenantPrisma.forTenant(LOOKUP, (tx) => tx.visit.groupBy({ by: ['organizationId', 'locationId'], where: { status: { in: ['checked_out', 'not_out', 'no_show', 'cancelled'] } } }));
    let deleted = 0;
    for (const p of places) {
      const c = { organizationId: p.organizationId, isSuperAdmin: true } as CompanyContext;
      deleted += await this.tenantPrisma.forTenant(c, async (tx) => {
        const days = Number(await this.setting(tx, c, 'visitors.retention_days', p.locationId));
        const cutoff = new Date(now.getTime() - days * 86_400_000);
        const old = { organizationId: p.organizationId, locationId: p.locationId, status: { in: ['checked_out', 'not_out', 'no_show', 'cancelled'] }, endsAt: { lt: cutoff } };
        await tx.$executeRaw`
          INSERT INTO visit_counts (organization_id, location_id, day, purpose, visits)
          SELECT organization_id, location_id, (starts_at AT TIME ZONE 'UTC')::date, purpose, count(*)::int
          FROM visits
          WHERE organization_id = ${p.organizationId}::uuid AND location_id = ${p.locationId}::uuid
            AND status IN ('checked_out', 'not_out') AND ends_at < ${cutoff}
          GROUP BY 1, 2, 3, 4
          ON CONFLICT (organization_id, location_id, day, purpose) DO UPDATE SET visits = visit_counts.visits + EXCLUDED.visits`;
        const { count } = await tx.visit.deleteMany({ where: old });
        if (count) await AuditService.recordIn(tx, c, { actorUserId: null, action: 'visitor.retention_deleted', entityType: 'visit', entityId: p.locationId, metadata: { deleted: count, days } });
        return count;
      });
    }
    return deleted;
  }

  /* ---------------- helpers ---------------- */

  private async find(tx: Tx, c: CompanyContext, id: string) {
    const row = await tx.visit.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!row) throw new NotFoundException('Visit not found.');
    return row;
  }

  /** Visits as the pages show them (host and location names; the mobile only to the people who reach the record). */
  private async views(tx: Tx, c: CompanyContext, rows: VisitRow[]) {
    const users = new Map((await tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: [...new Set(rows.map((r) => r.hostUserId))] } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name || u.email]));
    const locs = new Map((await tx.location.findMany({ where: { organizationId: c.organizationId, id: { in: [...new Set(rows.map((r) => r.locationId))] } }, select: { id: true, name: true, timezone: true } })).map((l) => [l.id, l]));
    return rows.map((r) => ({
      id: r.id,
      name: r.visitorName,
      mobile: r.visitorMobile,
      email: r.visitorEmail,
      company: r.visitorCompany,
      purpose: r.purpose,
      host: users.get(r.hostUserId) ?? 'Someone who left',
      hostUserId: r.hostUserId,
      locationId: r.locationId,
      location: locs.get(r.locationId)?.name ?? '',
      timeZone: locs.get(r.locationId)?.timezone ?? 'Asia/Kolkata',
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      status: r.status as VisitStatus,
      statusText: STATUS_WORDS[r.status as VisitStatus],
      passCode: r.passCode,
      badge: badgeText(r.badgeSeq),
      vehicle: r.vehicle,
      noticeAcceptedAt: r.noticeAcceptedAt?.toISOString() ?? null,
      checkedInAt: r.checkedInAt?.toISOString() ?? null,
      checkedOutAt: r.checkedOutAt?.toISOString() ?? null,
    }));
  }
}

const fmtTime = (d: Date, zone: string) => new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zone }).format(d);
