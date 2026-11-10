import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { buildViewer, tenantWide, type ScopeUser } from '../access/scope';
import { audit, inCompany, type CompanyContext, type Tx } from '../org-structure/org-structure.service';
import { SETTINGS, resolveSetting } from '../org-structure/settings-registry';
import { nameKey, reviewBy, watchMatches } from './visitor-guard-rules';
import { normalMobile } from './visitor-rules';
import type { AddWatchDto } from './visitors-dto';

// Answer 605: the blocked-visitor watch-list. HR or Facility admin (visitors.watchlist.manage, company-wide) adds a
// person with a reason; every change is audited (never the reason or the name in the audit). Only they see the list
// and the reasons; reception, the host and the visitor's link see only that the visit can't go ahead. Each entry is
// reviewed every review period (Settings 3.12) or it lapses and the nightly sweep deletes it.

const KEY = 'visitors.watchlist.manage';
const LOOKUP: TenantContext = { organizationId: null, isSuperAdmin: true };

/** True when an active entry matches the visitor (mobile, then name). Slice 2's walk-ins call this too. */
export async function watchHit(tx: Tx, organizationId: string, visitor: { name: string; mobile: string | null }, now = new Date()): Promise<boolean> {
  const hit = await tx.visitorWatch.findFirst({ where: { organizationId, reviewBy: { gt: now }, OR: [...(visitor.mobile ? [{ mobile: visitor.mobile }] : []), { nameKey: nameKey(visitor.name) }] }, select: { id: true } });
  return Boolean(hit);
}

/** Expected visits that match the entries are blocked (their pass stops working); returns how many. */
export async function blockMatching(tx: Tx, c: CompanyContext, entries: { mobile: string | null; nameKey: string }[], now = new Date()): Promise<number> {
  const open = await tx.visit.findMany({ where: { organizationId: c.organizationId, status: 'expected', blockedAt: null, endsAt: { gt: now } }, select: { id: true, visitorName: true, visitorMobile: true } });
  const ids = open.filter((v) => entries.some((e) => watchMatches(e, { name: v.visitorName, mobile: v.visitorMobile }))).map((v) => v.id);
  if (ids.length) await tx.visit.updateMany({ where: { id: { in: ids }, blockedAt: null }, data: { blockedAt: now } });
  for (const id of ids) await audit(tx, c, 'visitor.blocked', 'visit', id, { by: 'watchlist' });
  return ids.length;
}

@Injectable()
export class VisitorWatchlistService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
  ) {}

  private async holder(user: ScopeUser, change: boolean) {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, [KEY]);
    if (!tenantWide(v, KEY)) throw new ForbiddenException('The watch-list is for HR and Facility admins with the watch-list key for the whole company.');
    if (change && v.actingForOther) throw new ForbiddenException("You can't change the watch-list while acting for someone else. Sign in as yourself.");
    return v;
  }

  private async days(tx: Tx, c: CompanyContext) {
    const rows = await tx.setting.findMany({ where: { organizationId: c.organizationId, key: 'visitors.watchlist_review_days' } });
    const r = resolveSetting(SETTINGS['visitors.watchlist_review_days']!, rows.map((x) => ({ id: x.id, scopeType: x.scopeType, scopeId: x.scopeId, value: x.value, validFrom: null })), { tenant: c.organizationId }, null);
    return Number(r.value);
  }

  private async find(tx: Tx, c: CompanyContext, id: string) {
    const row = await tx.visitorWatch.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!row) throw new NotFoundException('Watch-list entry not found.');
    return row;
  }

  /** The list with its reasons, soonest review first. */
  async list(ctx: TenantContext, user: ScopeUser) {
    const v = await this.holder(user, false);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.visitorWatch.findMany({ where: { organizationId: c.organizationId }, orderBy: { reviewBy: 'asc' }, take: 1000 });
      const people = new Map((await tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: [...new Set(rows.flatMap((r) => [r.addedBy, r.reviewedBy].filter((x): x is string => Boolean(x))))] } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name || u.email]));
      return {
        canChange: !v.actingForOther,
        reviewDays: await this.days(tx, c),
        entries: rows.map((r) => ({
          id: r.id,
          name: r.name,
          mobile: r.mobile,
          reason: r.reason,
          addedBy: people.get(r.addedBy) ?? 'Someone who left',
          addedAt: r.addedAt.toISOString(),
          reviewedBy: r.reviewedBy ? (people.get(r.reviewedBy) ?? 'Someone who left') : null,
          reviewedAt: r.reviewedAt?.toISOString() ?? null,
          reviewBy: r.reviewBy.toISOString(),
        })),
      };
    });
  }

  /** Adds a person; their expected visits are blocked at once. */
  async add(ctx: TenantContext, user: ScopeUser, dto: AddWatchDto) {
    await this.holder(user, true);
    const mobile = dto.mobile ? normalMobile(dto.mobile) : null;
    if (dto.mobile && !mobile) throw new BadRequestException('Enter a 10-digit mobile number, or + and the country code for a number outside India.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const now = new Date();
      const row = await tx.visitorWatch.create({ data: { organizationId: c.organizationId, name: dto.name, nameKey: nameKey(dto.name), mobile, reason: dto.reason, addedBy: user.userId!, reviewBy: reviewBy(now, await this.days(tx, c)) } });
      const blocked = await blockMatching(tx, c, [row], now);
      await audit(tx, c, 'visitor.watchlist.added', 'visitor_watch', row.id, { withMobile: Boolean(mobile), blockedVisits: blocked });
      return { id: row.id, reviewBy: row.reviewBy.toISOString(), blockedVisits: blocked };
    });
  }

  /** The yearly review: the entry stays for another review period. */
  async review(ctx: TenantContext, user: ScopeUser, id: string) {
    await this.holder(user, true);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const row = await this.find(tx, c, id);
      const now = new Date();
      const done = await tx.visitorWatch.update({ where: { id: row.id }, data: { reviewedAt: now, reviewedBy: user.userId!, reviewBy: reviewBy(now, await this.days(tx, c)) } });
      await audit(tx, c, 'visitor.watchlist.reviewed', 'visitor_watch', row.id, { reviewBy: done.reviewBy.toISOString().slice(0, 10) });
      return { id: done.id, reviewBy: done.reviewBy.toISOString() };
    });
  }

  /** Removes an entry for good (visits it blocked stay blocked: the host invites again). */
  async remove(ctx: TenantContext, user: ScopeUser, id: string) {
    await this.holder(user, true);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const row = await this.find(tx, c, id);
      await tx.visitorWatch.delete({ where: { id: row.id } });
      await audit(tx, c, 'visitor.watchlist.removed', 'visitor_watch', row.id, {});
      return { ok: true };
    });
  }

  /** Nightly: entries nobody reviewed in time lapse and are deleted. */
  async lapseSweep(now = new Date()): Promise<number> {
    return this.tenantPrisma.forTenant(LOOKUP, async (tx) => {
      const gone = await tx.visitorWatch.findMany({ where: { reviewBy: { lte: now } }, select: { id: true, organizationId: true } });
      if (!gone.length) return 0;
      await tx.visitorWatch.deleteMany({ where: { id: { in: gone.map((g) => g.id) } } });
      for (const org of new Set(gone.map((g) => g.organizationId))) await AuditService.recordIn(tx, { organizationId: org, isSuperAdmin: true }, { actorUserId: null, action: 'visitor.watchlist.lapsed', entityType: 'visitor_watch', entityId: org, metadata: { deleted: gone.filter((g) => g.organizationId === org).length } });
      return gone.length;
    });
  }
}
