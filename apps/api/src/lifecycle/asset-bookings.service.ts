import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, Viewer, buildViewer } from '../access/scope';
import { ownOf } from '../documents/person-access';
import { settingFor } from '../people/probation';
import { displayName } from '../employee-history/employee-history.service';
import { NotificationsService } from '../notifications/notifications.service';
import { escapeHtml } from '../notifications/notification-email-render';
import { ASSET_KEYS, OffboardingService, reachesPlace } from './offboarding.service';
import { assetManagers } from './asset-alerts.service';
import { bookingDates } from './asset-categories';
import type { BookingDto, BookingHandOverDto, BookingReasonDto, BookingSearchDto } from './it-assets-dto';

// IT assets part 5 (founder answer 2715): asset booking.
//   bookable   asset managers of the asset's place (asset.manage) make an in-stock asset bookable, or not (only with no
//              live bookings). A bookable asset goes out only through a booking (the register's Issue refuses it).
//   booking    any employee books a bookable asset for themselves (no key), up to asset.booking_max_days (14 by default)
//              at a time, with daily or weekly repeats up to 3 months (one row per occurrence, sharing series_id); any
//              clash refuses the whole set, naming the day. The "free between" search lists bookable assets free for a
//              period. With asset.booking_approval on, a booking waits for an asset manager of the place (approve, or
//              decline with a reason; both told).
//   hand over  records an issue (an asset_assignment, as the register's Issue: the register shows who has it); the
//              register's Take back (or the bookings list's) records the return and ends the booking.
//   cancel     the person cancels their own booking not yet handed over; IT cancels with a reason (the person is told).
//   sweep      the person is reminded the day before it is due back; IT is told once when it is overdue (audited;
//              AssetAlertsService.bookingSweep).
// Another company's booking or asset: 404; a booking at a place outside the caller's asset.view: 404; asset.view but
// not asset.manage there: 403.

const LIVE = ['pending', 'booked', 'out'];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const assetText = (a: { name: string; tag: string }) => `${a.name} (${a.tag})`;
const period = (b: { startsOn: Date; endsOn: Date }) => (iso(b.startsOn) === iso(b.endsOn) ? iso(b.startsOn) : `${iso(b.startsOn)} to ${iso(b.endsOn)}`);

type Note = { to: string[]; type: string; entityId: string; text: string; link: string; subject: string };

@Injectable()
export class AssetBookingsService {
  private readonly logger = new Logger(AssetBookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly offboarding: OffboardingService,
    private readonly notifications: NotificationsService,
  ) {}

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, ASSET_KEYS);
  }

  private async send(ctx: TenantContext, notes: Note[]) {
    for (const n of notes)
      if (n.to.length)
        await this.notifications
          .notifySystem(ctx, n.to, n.type, { entityType: 'asset_booking', entityId: n.entityId, contextText: n.text, linkPath: n.link }, { subject: n.subject, html: `<p>${escapeHtml(n.text)}</p>` })
          .catch((e: Error) => this.logger.warn(`booking notice: ${e.message}`));
  }

  private async settings(tx: Tx, c: CompanyContext) {
    const maxDays = Number(await settingFor(tx, c, 'asset.booking_max_days', { legalEntityId: '' })) || 14;
    const approval = (await settingFor(tx, c, 'asset.booking_approval', { legalEntityId: '' })) === 'on';
    return { maxDays, approval };
  }

  private async me(tx: Tx, c: CompanyContext, v: Viewer) {
    const own = await ownOf(tx, c, v);
    if (!own.personId || !own.employeeId) throw new ForbiddenException('Only employees book assets.');
    return { personId: own.personId, employeeId: own.employeeId };
  }

  private async userOf(tx: Tx, org: string, personId: string) {
    return (await tx.employee.findFirst({ where: { organizationId: org, personId }, select: { userId: true } }))?.userId ?? null;
  }

  /** A booking and its asset, for IT: another company or a place outside asset.view: 404; no asset.manage there: 403. */
  private async managed(tx: Tx, org: string, v: Viewer, id: string) {
    const b = await tx.assetBooking.findFirst({ where: { organizationId: org, id } });
    const a = b ? await tx.asset.findFirst({ where: { organizationId: org, id: b.assetId } }) : null;
    if (!b || !a || !reachesPlace(v, 'asset.view', a)) throw new NotFoundException('No such booking.');
    if (!reachesPlace(v, 'asset.manage', a)) throw new ForbiddenException('You cannot change bookings of this asset.');
    return { b, a };
  }

  // ------------------------------------------------------------------------------------------ the employee (no key)

  /** "Free between": the bookable assets with no live booking in the period (by category and location). */
  async free(ctx: TenantContext, user: ScopeUser, q: BookingSearchDto) {
    if (q.to < q.from) throw new BadRequestException('The last day is on or after the first day.');
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.me(tx, c, v);
      const assets = await tx.asset.findMany({ where: { organizationId: org, bookable: true, status: { notIn: ['retired', 'lost'] } }, orderBy: [{ category: 'asc' }, { tag: 'asc' }], take: 500 });
      const busy = new Set((await tx.assetBooking.findMany({ where: { organizationId: org, assetId: { in: assets.map((a) => a.id) }, status: { in: LIVE }, startsOn: { lte: asDate(q.to) }, endsOn: { gte: asDate(q.from) } }, select: { assetId: true } })).map((b) => b.assetId));
      const cats = new Map((await tx.assetCategory.findMany({ where: { organizationId: org } })).map((x) => [x.id, x.name]));
      const places = new Map((await tx.location.findMany({ where: { organizationId: org, id: { in: assets.flatMap((a) => (a.locationId ? [a.locationId] : [])) } }, select: { id: true, name: true } })).map((l) => [l.id, l.name]));
      const all = assets.map((a) => ({ id: a.id, tag: a.tag, name: a.name, categoryId: a.categoryId, category: (a.categoryId && cats.get(a.categoryId)) || a.category, locationId: a.locationId, location: (a.locationId && places.get(a.locationId)) || null }));
      const uniq = (xs: { value: string | null; label: string | null }[]) => [...new Map(xs.filter((x) => x.value).map((x) => [x.value!, { value: x.value!, label: x.label ?? '' }])).values()].sort((x, y) => x.label.localeCompare(y.label));
      return {
        rows: all.filter((a) => !busy.has(a.id) && (!q.categoryId || a.categoryId === q.categoryId) && (!q.locationId || a.locationId === q.locationId)),
        // The filters offer what is bookable at all.
        categories: uniq(all.map((a) => ({ value: a.categoryId, label: a.category }))),
        locations: uniq(all.map((a) => ({ value: a.locationId, label: a.location }))),
      };
    });
  }

  /** My bookings (past, current and to come) with the company's booking rules. */
  async mine(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await ownOf(tx, c, v);
      const rules = await this.settings(tx, c);
      if (!own.personId) return { today: todayIst(), ...rules, rows: [] };
      const rows = await tx.assetBooking.findMany({ where: { organizationId: org, personId: own.personId }, orderBy: [{ startsOn: 'desc' }, { createdAt: 'desc' }], take: 500 });
      const assets = new Map((await tx.asset.findMany({ where: { organizationId: org, id: { in: [...new Set(rows.map((b) => b.assetId))] } }, select: { id: true, tag: true, name: true } })).map((a) => [a.id, a]));
      const today = todayIst();
      return {
        today,
        ...rules,
        rows: rows.map((b) => ({ id: b.id, seriesId: b.seriesId, tag: assets.get(b.assetId)?.tag ?? '', asset: assets.get(b.assetId)?.name ?? 'An asset', startsOn: iso(b.startsOn), endsOn: iso(b.endsOn), status: b.status, purpose: b.purpose, reason: b.declineReason ?? b.cancelReason, overdue: b.status === 'out' && iso(b.endsOn) < today })),
      };
    });
  }

  /** Books a bookable asset for myself; every occurrence of a repeat is checked, and any clash refuses them all. */
  async book(ctx: TenantContext, user: ScopeUser, dto: BookingDto) {
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Only the person themselves books an asset.');
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await this.me(tx, c, v);
      const a = await tx.asset.findFirst({ where: { organizationId: org, id: dto.assetId } });
      if (!a || !a.bookable || a.status === 'retired' || a.status === 'lost') throw new NotFoundException('No such bookable asset.');
      const { maxDays, approval } = await this.settings(tx, c);
      const today = todayIst();
      const r = bookingDates(dto, today, maxDays);
      if ('error' in r) throw new BadRequestException(r.error);
      // One booker of an asset at a time, so two people cannot take the same days.
      await tx.$queryRaw`SELECT id FROM assets WHERE organization_id = ${org}::uuid AND id = ${a.id}::uuid FOR UPDATE`;
      const taken = await tx.assetBooking.findMany({ where: { organizationId: org, assetId: a.id, status: { in: LIVE }, OR: r.dates.map((d) => ({ startsOn: { lte: asDate(d.endsOn) }, endsOn: { gte: asDate(d.startsOn) } })) }, orderBy: { startsOn: 'asc' } });
      if (taken.length) {
        const day = r.dates.flatMap((d) => taken.filter((t) => iso(t.startsOn) <= d.endsOn && iso(t.endsOn) >= d.startsOn).map((t) => (iso(t.startsOn) > d.startsOn ? iso(t.startsOn) : d.startsOn))).sort()[0];
        throw new ConflictException(`${assetText(a)} is already booked on ${day}. Nothing was booked.`);
      }
      const seriesId = r.dates.length > 1 ? randomUUID() : null;
      const status = approval ? 'pending' : 'booked';
      const ids: string[] = [];
      for (const d of r.dates) ids.push((await tx.assetBooking.create({ data: { organizationId: org, assetId: a.id, personId: me.personId, seriesId, startsOn: asDate(d.startsOn), endsOn: asDate(d.endsOn), status, purpose: dto.purpose || null, createdBy: c.userId ?? null } })).id);
      await audit(tx, c, 'asset.booking.made', 'asset_booking', ids[0], { assetId: a.id, seriesId, status, count: ids.length, from: r.dates[0].startsOn, to: r.dates[r.dates.length - 1].endsOn });
      const notes: Note[] = approval ? [{ to: await assetManagers(tx, org, a, today), type: 'asset.booking.requested', entityId: ids[0], text: `A booking of ${assetText(a)} from ${r.dates[0].startsOn}${ids.length > 1 ? ` (${ids.length} times)` : ''} waits for your approval.`, link: '/yx/people/assets/bookings', subject: 'An asset booking waits for your approval' }] : [];
      return { res: { ids, status, seriesId }, notes };
    });
    await this.send(ctx, out.notes);
    return out.res;
  }

  /** I cancel my booking that is not handed over yet (with `series`, also the later ones of the same repeat). */
  async cancelMine(ctx: TenantContext, user: ScopeUser, id: string, dto: BookingReasonDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await ownOf(tx, c, v);
      const b = own.personId ? await tx.assetBooking.findFirst({ where: { organizationId: org, id, personId: own.personId } }) : null;
      if (!b) throw new NotFoundException('No such booking of yours.');
      return this.cancelIn(tx, c, b, dto, dto.reason?.trim() || 'Cancelled by the person');
    });
  }

  private async cancelIn(tx: Tx, c: CompanyContext, b: { id: string; seriesId: string | null; personId: string; startsOn: Date; status: string }, dto: BookingReasonDto, reason: string) {
    if (b.status !== 'pending' && b.status !== 'booked') throw new ConflictException(b.status === 'out' ? 'This asset is handed over. Take it back instead.' : 'This booking is not active.');
    const org = c.organizationId;
    const where = dto.series && b.seriesId ? { organizationId: org, seriesId: b.seriesId, personId: b.personId, startsOn: { gte: b.startsOn } } : { organizationId: org, id: b.id };
    const n = await tx.assetBooking.updateMany({ where: { ...where, status: { in: ['pending', 'booked'] } }, data: { status: 'cancelled', cancelledBy: c.userId ?? null, cancelReason: reason.slice(0, 300), version: { increment: 1 } } });
    await audit(tx, c, 'asset.booking.cancelled', 'asset_booking', b.id, { seriesId: b.seriesId, count: n.count, reason });
    return { cancelled: n.count };
  }

  // ------------------------------------------------------------------------------------------ IT

  /** Makes an in-stock asset bookable, or not bookable (only with no live bookings). */
  async setBookable(ctx: TenantContext, user: ScopeUser, assetId: string, bookable: boolean) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const a = await tx.asset.findFirst({ where: { organizationId: org, id: assetId } });
      if (!a || !reachesPlace(v, 'asset.view', a)) throw new NotFoundException('No such asset.');
      if (!reachesPlace(v, 'asset.manage', a)) throw new ForbiddenException('You cannot change this asset.');
      if (a.bookable === bookable) return { bookable };
      if (bookable && a.status !== 'in_stock') throw new ConflictException('Only an asset in stock can be made bookable.');
      if (!bookable) {
        const live = await tx.assetBooking.count({ where: { organizationId: org, assetId: a.id, status: { in: LIVE } } });
        if (live) throw new ConflictException(`It has ${live} ${live === 1 ? 'booking' : 'bookings'} not finished. Cancel them or take the asset back first.`);
      }
      await tx.asset.update({ where: { id: a.id }, data: { bookable, version: { increment: 1 } } });
      await audit(tx, c, bookable ? 'asset.bookable.on' : 'asset.bookable.off', 'asset', a.id, {});
      return { bookable };
    });
  }

  /** IT's bookings list and loan report: every booking of the assets the caller sees (asset.view over their place). */
  async list(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    if (!v.grants.has('asset.view')) throw new ForbiddenException('You cannot see the asset bookings.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const rows = await tx.assetBooking.findMany({ where: { organizationId: org }, orderBy: [{ startsOn: 'desc' }, { createdAt: 'desc' }], take: 2000 });
      const assets = new Map((await tx.asset.findMany({ where: { organizationId: org, id: { in: [...new Set(rows.map((b) => b.assetId))] } } })).filter((a) => reachesPlace(v, 'asset.view', a)).map((a) => [a.id, a]));
      const shown = rows.filter((b) => assets.has(b.assetId));
      const people = await tx.employee.findMany({ where: { organizationId: org, personId: { in: [...new Set(shown.map((b) => b.personId))] } } });
      const today = todayIst();
      return {
        today,
        canManage: v.grants.has('asset.manage') && !v.actingForOther,
        rows: shown.map((b) => {
          const a = assets.get(b.assetId)!;
          const p = people.find((x) => x.personId === b.personId);
          return { id: b.id, seriesId: b.seriesId, assetId: a.id, tag: a.tag, asset: a.name, employeeId: p?.id ?? null, person: p ? displayName(p) : 'Someone', startsOn: iso(b.startsOn), endsOn: iso(b.endsOn), status: b.status, purpose: b.purpose, reason: b.declineReason ?? b.cancelReason, overdue: b.status === 'out' && iso(b.endsOn) < today, canManage: reachesPlace(v, 'asset.manage', a) };
        }),
      };
    });
  }

  /** An asset manager of the place approves or declines (with a reason) a pending booking and the rest of its repeat. */
  async decide(ctx: TenantContext, user: ScopeUser, id: string, decision: 'approve' | 'decline', dto: BookingReasonDto) {
    const v = await this.viewer(user);
    const reason = dto.reason?.trim() || null;
    if (decision === 'decline' && !reason) throw new BadRequestException('Say why it is declined.');
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { b, a } = await this.managed(tx, org, v, id);
      if (b.status !== 'pending') throw new ConflictException('This booking is not waiting for approval.');
      const status = decision === 'approve' ? 'booked' : 'declined';
      const n = await tx.assetBooking.updateMany({ where: { organizationId: org, status: 'pending', ...(b.seriesId ? { seriesId: b.seriesId } : { id: b.id }) }, data: { status, decidedBy: c.userId ?? null, decidedAt: new Date(), declineReason: decision === 'decline' ? reason : null, version: { increment: 1 } } });
      await audit(tx, c, decision === 'approve' ? 'asset.booking.approved' : 'asset.booking.declined', 'asset_booking', b.id, { assetId: a.id, seriesId: b.seriesId, count: n.count, reason });
      const who = await this.userOf(tx, org, b.personId);
      const text = decision === 'approve' ? `Your booking of ${assetText(a)} from ${period(b)}${n.count > 1 ? ` (${n.count} times)` : ''} is approved.` : `Your booking of ${assetText(a)} from ${period(b)} was declined: ${reason}`;
      return { count: n.count, notes: [{ to: who ? [who] : [], type: 'asset.booking.decided', entityId: b.id, text, link: '/yx/me/bookings', subject: decision === 'approve' ? 'Your asset booking is approved' : 'Your asset booking was declined' }] };
    });
    await this.send(ctx, out.notes);
    return { [decision === 'approve' ? 'approved' : 'declined']: out.count };
  }

  /** IT cancels a booking not handed over yet, with a reason; the person is told. */
  async cancel(ctx: TenantContext, user: ScopeUser, id: string, dto: BookingReasonDto) {
    const v = await this.viewer(user);
    const reason = dto.reason?.trim();
    if (!reason) throw new BadRequestException('Say why it is cancelled.');
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { b, a } = await this.managed(tx, org, v, id);
      const r = await this.cancelIn(tx, c, b, dto, reason);
      const who = await this.userOf(tx, org, b.personId);
      return { r, notes: [{ to: who ? [who] : [], type: 'asset.booking.cancelled', entityId: b.id, text: `IT cancelled your booking of ${assetText(a)} from ${period(b)}${r.cancelled > 1 ? ` and the later ones (${r.cancelled})` : ''}: ${reason}`, link: '/yx/me/bookings', subject: 'IT cancelled your asset booking' }] };
    });
    await this.send(ctx, out.notes);
    return out.r;
  }

  /** IT hands a booked asset over on a day of the booking: an issue on the register (an asset_assignment). */
  async handOver(ctx: TenantContext, user: ScopeUser, id: string, dto: BookingHandOverDto) {
    const v = await this.viewer(user);
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { b, a } = await this.managed(tx, org, v, id);
      if (b.status !== 'booked') throw new ConflictException(b.status === 'pending' ? 'Approve the booking first.' : 'Only a booked asset is handed over.');
      const today = todayIst();
      if (iso(b.startsOn) > today) throw new ConflictException(`The booking starts on ${iso(b.startsOn)}. Hand it over on that day.`);
      if (iso(b.endsOn) < today) throw new ConflictException('This booking has ended.');
      if (a.status !== 'in_stock') throw new ConflictException(a.status === 'assigned' ? 'This asset is still with someone. Take it back first.' : 'Only an asset in stock can be handed over.');
      const emp = await tx.employee.findFirst({ where: { organizationId: org, personId: b.personId } });
      if (!emp || !(await tx.employment.findFirst({ where: { organizationId: org, employeeId: emp.id, exitedOn: null }, select: { id: true } }))) throw new ConflictException('This person is no longer an employee. Cancel the booking.');
      const issued = await this.offboarding.issueIn(tx, c, a, emp, today, dto.condition);
      const n = await tx.assetBooking.updateMany({ where: { organizationId: org, id: b.id, status: 'booked' }, data: { status: 'out', assignmentId: issued.assignmentId, version: { increment: 1 } } });
      if (!n.count) throw new ConflictException('Someone else changed this booking. Reload it.');
      await audit(tx, c, 'asset.booking.handed_over', 'asset_booking', b.id, { assetId: a.id, assignmentId: issued.assignmentId });
      return { issued, assetId: a.id, assignmentId: issued.assignmentId };
    });
    await this.offboarding.notifyIssued(ctx, res.assetId, res.issued);
    return { assignmentId: res.assignmentId };
  }
}
