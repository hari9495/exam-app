import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantPrismaService } from '@exam-platform/shared';
import { companyContext, type CompanyContext } from '../org-structure/org-structure.service';
import { SETTINGS } from '../org-structure/settings-registry';
import { FEATURES, featureState, type Feature } from './features';
import { PLATFORM } from './platform.service';

type Tx = Prisma.TransactionClient;
export const NUDGE_LIMIT_KEY = 'nudges.weekly_limit_per_person';
export const NUDGE_LIMIT_DEFAULT = 2;
/** The drawing: Not now hides a nudge for 14 days, then it may come back (0 = never comes back). */
export const NUDGE_RETURN_KEY = 'nudges.dismiss_return_days';
export const NUDGE_RETURN_DEFAULT = 14;
const WEEK = 7 * 86_400_000;

/** Where a company switches each feature on (its Settings page). */
const SWITCH_HREF: Record<Feature, string> = {
  'help.tours': '/yx/settings/company-rules',
  'help.whats_new': '/yx/settings/company-rules',
  'access.requests': '/yx/settings/access-settings',
  'policy.ai_writer': '/yx/settings/company-rules',
};
/** Who can use each feature once it is on (null: everyone at the company). */
const USE_KEY: Record<Feature, string | null> = {
  'help.tours': null,
  'help.whats_new': null,
  'access.requests': null,
  'policy.ai_writer': 'policy.manage',
};

/** The keys a person needs, company-wide, to act on a nudge: change the setting (and its guard) or use the feature. */
export async function actKeys(tx: Tx, feature: Feature, kind: 'suggest' | 'switch_on'): Promise<string[]> {
  if (kind === 'suggest') return USE_KEY[feature] ? [USE_KEY[feature]!] : [];
  const flag = await tx.featureFlag.findUnique({ where: { key: feature }, select: { settingKey: true } });
  const guard = flag?.settingKey ? (SETTINGS as Record<string, { guard?: string }>)[flag.settingKey]?.guard : undefined;
  return ['org.settings.manage', ...(guard ? [guard] : [])];
}

/** Which nudge (if any) one person sees now: the weekly limit, what they already saw, and whether they can act. */
export function pickNudge<N extends { id: string }>(eligible: N[], views: { nudgeId: string; shownAt: Date; dismissedAt: Date | null }[], limit: number, now: Date, returnDays = 0): { nudge: N; isNew: boolean; again: boolean } | null {
  const ids = new Set(eligible.map((n) => n.id));
  const recent = views.filter((v) => now.getTime() - v.shownAt.getTime() < WEEK);
  // One already shown this week and not put away keeps showing (no new count).
  const open = recent.find((v) => !v.dismissedAt && ids.has(v.nudgeId));
  if (open) return { nudge: eligible.find((n) => n.id === open.nudgeId)!, isNew: false, again: false };
  if (limit <= 0 || recent.length >= limit) return null;
  // Put away more than `returnDays` ago (when it comes back at all): it may show again.
  const back = (v: { dismissedAt: Date | null }) => returnDays > 0 && v.dismissedAt !== null && now.getTime() - v.dismissedAt.getTime() >= returnDays * 86_400_000;
  const seen = new Set(views.filter((v) => !back(v)).map((v) => v.nudgeId));
  const next = eligible.find((n) => !seen.has(n.id));
  return next ? { nudge: next, isNew: true, again: views.some((v) => v.nudgeId === next.id) } : null;
}

/**
 * YukthiX console C-8, YX-12: nudges and switch-on copy. Staff write the in-app text per feature switch (C-4); a second
 * staff member approves it before it goes live (one live per feature and kind; the new one replaces the old). Companies
 * get at most one nudge at a time per person, never for a feature YukthiX killed or has off for the company, never to
 * someone who cannot act on it, and at most `nudges.weekly_limit_per_person` (platform setting) in 7 days. Not now hides one for
 * `nudges.dismiss_return_days` (platform setting, default 14 as drawn; 0 = never again).
 */
@Injectable()
export class NudgesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private async num(tx: Tx, key: string, def: number) {
    const v = Number((await tx.platformSetting.findUnique({ where: { key } }))?.value);
    return Number.isInteger(v) && v >= 0 ? v : def;
  }
  private limit(tx: Tx) {
    return this.num(tx, NUDGE_LIMIT_KEY, NUDGE_LIMIT_DEFAULT);
  }

  // ------------------------------------------------------------------------------------------------ console (staff)

  async overview(actorUserId: string) {
    return this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const rows = await tx.featureNudge.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
      const ids = [...new Set(rows.flatMap((r) => [r.writtenBy, r.reviewedBy, r.retiredBy]).filter((x): x is string => !!x))];
      const names = new Map((await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name?.trim() || u.email]));
      const flags = await tx.featureFlag.findMany({ where: { key: { in: [...FEATURES] } }, orderBy: { key: 'asc' } });
      return {
        features: flags.map((f) => ({ key: f.key, label: f.label, killed: Boolean(f.killedAt) })),
        nudges: rows.map((r) => ({
          id: r.id,
          featureKey: r.featureKey,
          kind: r.kind,
          heading: r.heading,
          body: r.body,
          status: r.status,
          writtenBy: names.get(r.writtenBy) ?? '',
          mine: r.writtenBy === actorUserId,
          reviewedBy: r.reviewedBy ? (names.get(r.reviewedBy) ?? '') : null,
          reviewNote: r.reviewNote,
          createdAt: r.createdAt.toISOString(),
        })),
        weeklyLimit: await this.limit(tx),
        weeklyLimitDefault: NUDGE_LIMIT_DEFAULT,
      };
    });
  }

  async write(actorUserId: string, dto: { featureKey: string; kind: 'suggest' | 'switch_on'; heading: string; body: string }) {
    if (!(FEATURES as readonly string[]).includes(dto.featureKey)) throw new BadRequestException('Choose a feature switch from the list.');
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const n = await tx.featureNudge.create({ data: { featureKey: dto.featureKey, kind: dto.kind, heading: dto.heading, body: dto.body, writtenBy: actorUserId } });
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.nudge.written', entityType: 'feature_nudge', entityId: n.id, metadata: { featureKey: n.featureKey, kind: n.kind } });
    });
    return this.overview(actorUserId);
  }

  /** Approve (it goes live, replacing the live one of its feature and kind) or send back with a note. Never one's own. */
  async review(actorUserId: string, id: string, dto: { approve: boolean; note?: string }) {
    if (!dto.approve && !dto.note?.trim()) throw new BadRequestException('Say what to change before sending it back.');
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const n = await tx.featureNudge.findUnique({ where: { id } });
      if (!n || n.status !== 'pending') throw new NotFoundException('No such nudge waiting for approval.');
      if (n.writtenBy === actorUserId) throw new ForbiddenException('You wrote this nudge. Another staff member approves it.');
      const now = new Date();
      if (dto.approve) await tx.featureNudge.updateMany({ where: { featureKey: n.featureKey, kind: n.kind, status: 'live' }, data: { status: 'retired', retiredBy: actorUserId, retiredAt: now, version: { increment: 1 } } });
      const done = await tx.featureNudge.updateMany({ where: { id, status: 'pending' }, data: { status: dto.approve ? 'live' : 'sent_back', reviewedBy: actorUserId, reviewedAt: now, reviewNote: dto.note?.trim() || null, version: { increment: 1 } } });
      if (!done.count) throw new ConflictException('Someone else decided this nudge. Open it again.');
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: dto.approve ? 'platform.nudge.approved' : 'platform.nudge.sent_back', entityType: 'feature_nudge', entityId: id, metadata: { featureKey: n.featureKey, kind: n.kind, ...(dto.approve ? {} : { note: dto.note!.trim() }) } });
    });
    return this.overview(actorUserId);
  }

  /** Takes a live nudge down (any staff member with the key; audited). */
  async retire(actorUserId: string, id: string) {
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const done = await tx.featureNudge.updateMany({ where: { id, status: 'live' }, data: { status: 'retired', retiredBy: actorUserId, retiredAt: new Date(), version: { increment: 1 } } });
      if (!done.count) throw new NotFoundException('No such live nudge.');
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.nudge.retired', entityType: 'feature_nudge', entityId: id });
    });
    return this.overview(actorUserId);
  }

  // ------------------------------------------------------------------------------------------------ the company side

  /**
   * The nudge for this person now, or null. `canAct` says whether they hold a key company-wide (the caller resolves their
   * grants). Staff acting inside a company never get nudges.
   */
  async mine(ctx: { organizationId: string | null; userId?: string | null; actingSuperAdmin?: boolean }, canAct: (keys: string[]) => Promise<boolean>, now = new Date()) {
    if (!ctx.organizationId || !ctx.userId || ctx.actingSuperAdmin) return null;
    const c: CompanyContext = companyContext({ organizationId: ctx.organizationId, isSuperAdmin: false, userId: ctx.userId });
    const { live, limit, returnDays } = await this.tenantPrisma.forTenant(PLATFORM, async (tx) => ({ live: await tx.featureNudge.findMany({ where: { status: 'live' }, orderBy: { reviewedAt: 'asc' } }), limit: await this.limit(tx), returnDays: await this.num(tx, NUDGE_RETURN_KEY, NUDGE_RETURN_DEFAULT) }));
    if (!live.length) return null;
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const eligible: (typeof live)[number][] = [];
      for (const n of live) {
        const feature = n.featureKey as Feature;
        if (!(FEATURES as readonly string[]).includes(feature)) continue;
        const state = await featureState(tx, c, feature);
        // Killed or off by YukthiX: nobody at the company can act. A suggestion needs it on; switch-on copy needs it off.
        if (state === 'yukthix' || (n.kind === 'suggest' ? state !== 'on' : state !== 'company')) continue;
        if (await canAct(await actKeys(tx, feature, n.kind as 'suggest' | 'switch_on'))) eligible.push(n);
      }
      const views = await tx.nudgeView.findMany({ where: { organizationId: c.organizationId, userId: ctx.userId! }, select: { nudgeId: true, shownAt: true, dismissedAt: true } });
      const pick = pickNudge(eligible, views, limit, now, returnDays);
      if (!pick) return null;
      if (pick.again) await tx.nudgeView.updateMany({ where: { organizationId: c.organizationId, userId: ctx.userId!, nudgeId: pick.nudge.id }, data: { shownAt: now, dismissedAt: null } });
      else if (pick.isNew) await tx.nudgeView.create({ data: { organizationId: c.organizationId, userId: ctx.userId!, nudgeId: pick.nudge.id, shownAt: now } });
      const n = pick.nudge;
      return { id: n.id, featureKey: n.featureKey, kind: n.kind, heading: n.heading, body: n.body, switchHref: n.kind === 'switch_on' ? SWITCH_HREF[n.featureKey as Feature] : null };
    });
  }

  /** Not now: the person puts the nudge away; it may come back after `nudges.dismiss_return_days` (0 = never). */
  async dismiss(ctx: { organizationId: string | null; userId?: string | null }, id: string) {
    if (!ctx.organizationId || !ctx.userId) throw new ForbiddenException('Sign in to a company.');
    const c = companyContext({ organizationId: ctx.organizationId, isSuperAdmin: false, userId: ctx.userId });
    const done = await this.tenantPrisma.forTenant(c, (tx) => tx.nudgeView.updateMany({ where: { organizationId: c.organizationId, userId: ctx.userId!, nudgeId: id, dismissedAt: null }, data: { dismissedAt: new Date() } }));
    if (!done.count) throw new NotFoundException('No such nudge shown to you.');
    return { ok: true };
  }
}
