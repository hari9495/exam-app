import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { PLATFORM } from './platform.service';
import type { MaintenanceDecisionDto, MaintenanceWindowDto } from './maintenance.dto';

type Tx = Prisma.TransactionClient;

/**
 * Answer 948 / YX-10: the maintenance rules are platform settings with the drawn defaults (72 hours' notice, a banner 24
 * hours before, at most 4 hours, never in the payroll-critical days: the first 7 and last 3 of the month, nor on the
 * statutory due dates 7, 15 and 20). A missing row means the default.
 */
export const MAINTENANCE_SETTINGS = {
  'maintenance.notice_hours': { label: 'Notice before a window (hours)', default: 72, min: 24, max: 720 },
  'maintenance.banner_hours': { label: 'Show the banner this long before (hours)', default: 24, min: 1, max: 168 },
  'maintenance.max_hours': { label: 'Longest window (hours)', default: 4, min: 1, max: 12 },
  'maintenance.block_first_days': { label: 'No windows in the first days of the month', default: 7, min: 0, max: 10 },
  'maintenance.block_last_days': { label: 'No windows in the last days of the month', default: 3, min: 0, max: 10 },
} as const;
export const BLOCK_DATES_KEY = 'maintenance.block_dates';
export const BLOCK_DATES_DEFAULT = '7,15,20';
type NumKey = keyof typeof MAINTENANCE_SETTINGS;
export type MaintenanceRules = Record<NumKey, number> & { blockDates: number[] };

const IST = 330 * 60_000;
const istParts = (d: Date) => {
  const x = new Date(d.getTime() + IST);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth(), day: x.getUTCDate() };
};
const parseDates = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean).map(Number);

/** Why a window cannot be used, in plain words (null: it passes). Days are India days (IST). */
export function maintenanceProblem(start: Date, hours: number, rules: MaintenanceRules, now = new Date()): string | null {
  const ahead = (start.getTime() - now.getTime()) / 3_600_000;
  if (ahead < rules['maintenance.notice_hours']) return `Only ${Math.max(0, Math.floor(ahead))} hours' notice. Maintenance must be announced at least ${rules['maintenance.notice_hours']} hours ahead.`;
  if (hours > rules['maintenance.max_hours']) return `A window can be at most ${rules['maintenance.max_hours']} hours.`;
  const { y, m, day } = istParts(start);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  if (day <= rules['maintenance.block_first_days'] || day > last - rules['maintenance.block_last_days'])
    return `This falls in the payroll-critical days (the first ${rules['maintenance.block_first_days']} and last ${rules['maintenance.block_last_days']} days of the month).`;
  if (rules.blockDates.includes(day)) return `The ${day}th is a statutory due date for some companies.`;
  return null;
}

/** What a company sees now: the banner from `banner_hours` before a scheduled window until it ends (never a sign-in block). */
export function currentMaintenance(windows: { title: string; startsAt: Date; endsAt: Date }[], bannerHours: number, now = new Date()) {
  const w = windows
    .filter((x) => x.startsAt.getTime() - bannerHours * 3_600_000 <= now.getTime() && now.getTime() < x.endsAt.getTime())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
  return w ? { phase: (now >= w.startsAt ? 'now' : 'upcoming') as 'now' | 'upcoming', title: w.title, startsAt: w.startsAt.toISOString(), endsAt: w.endsAt.toISOString() } : null;
}

/**
 * YukthiX console C-5 (answers 948, 1053; YX-10 Maintenance): staff schedule a planned window, a second staff member
 * (never the scheduler) approves it, and any staff member may cancel it with a reason; all audited on the platform log.
 * Every company reads the current state from one endpoint and shows the 6.5 availability banner before and during it.
 */
@Injectable()
export class MaintenanceService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private async rules(tx: Tx): Promise<MaintenanceRules> {
    const rows = await tx.platformSetting.findMany({ where: { key: { in: [...Object.keys(MAINTENANCE_SETTINGS), BLOCK_DATES_KEY] } } });
    const out = {} as MaintenanceRules;
    for (const k of Object.keys(MAINTENANCE_SETTINGS) as NumKey[]) {
      const v = Number(rows.find((r) => r.key === k)?.value);
      out[k] = Number.isInteger(v) ? v : MAINTENANCE_SETTINGS[k].default;
    }
    out.blockDates = parseDates(rows.find((r) => r.key === BLOCK_DATES_KEY)?.value ?? BLOCK_DATES_DEFAULT);
    return out;
  }

  private settingsView(r: MaintenanceRules) {
    return {
      numbers: (Object.keys(MAINTENANCE_SETTINGS) as NumKey[]).map((key) => ({ key, label: MAINTENANCE_SETTINGS[key].label, value: r[key], default: MAINTENANCE_SETTINGS[key].default, min: MAINTENANCE_SETTINGS[key].min, max: MAINTENANCE_SETTINGS[key].max })),
      blockDates: r.blockDates,
      blockDatesDefault: parseDates(BLOCK_DATES_DEFAULT),
    };
  }

  /** Staff: every window (newest first), the rules, and what companies see now. */
  async overview(actorUserId: string, now = new Date()) {
    return this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const rules = await this.rules(tx);
      const rows = await tx.maintenanceWindow.findMany({ orderBy: { startsAt: 'desc' }, take: 200 });
      const ids = [...new Set(rows.flatMap((r) => [r.writtenBy, r.decidedBy, r.cancelledBy].filter((x): x is string => !!x)))];
      const names = new Map((await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name?.trim() || u.email]));
      const scheduled = rows.filter((r) => r.status === 'scheduled');
      return {
        now: now.toISOString(),
        settings: this.settingsView(rules),
        current: currentMaintenance(scheduled, rules['maintenance.banner_hours'], now),
        windows: rows.map((r) => ({
          id: r.id,
          title: r.title,
          startsAt: r.startsAt.toISOString(),
          endsAt: r.endsAt.toISOString(),
          status: r.status === 'scheduled' ? (now >= r.endsAt ? 'ended' : now >= r.startsAt ? 'in_progress' : 'scheduled') : r.status,
          writtenBy: names.get(r.writtenBy) ?? '',
          mine: r.writtenBy === actorUserId,
          decidedBy: r.decidedBy ? (names.get(r.decidedBy) ?? '') : null,
          cancelledBy: r.cancelledBy ? (names.get(r.cancelledBy) ?? '') : null,
          cancelReason: r.cancelReason,
          version: r.version,
        })),
      };
    });
  }


  /** Schedules a window, waiting for a second staff member. The rules are checked now and again on approval. */
  async schedule(actorUserId: string, dto: MaintenanceWindowDto, now = new Date()) {
    const start = new Date(dto.startsAt);
    if (Number.isNaN(start.getTime())) throw new BadRequestException('Give a real start time.');
    const end = new Date(start.getTime() + dto.hours * 3_600_000);
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const problem = maintenanceProblem(start, dto.hours, await this.rules(tx), now);
      if (problem) throw new BadRequestException(problem);
      await this.noOverlap(tx, start, end);
      const w = await tx.maintenanceWindow.create({ data: { title: dto.title.trim(), startsAt: start, endsAt: end, status: 'pending_approval', writtenBy: actorUserId } });
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.maintenance.scheduled', entityType: 'maintenance_window', entityId: w.id, metadata: { title: w.title, startsAt: start.toISOString(), endsAt: end.toISOString() } });
    });
    return this.overview(actorUserId, now);
  }

  private async noOverlap(tx: Tx, start: Date, end: Date, except?: string) {
    const clash = await tx.maintenanceWindow.findFirst({ where: { status: { in: ['pending_approval', 'scheduled'] }, startsAt: { lt: end }, endsAt: { gt: start }, ...(except ? { id: { not: except } } : {}) }, select: { title: true } });
    if (clash) throw new ConflictException(`It overlaps "${clash.title}". Choose another time.`);
  }

  async approve(actorUserId: string, id: string, dto: MaintenanceDecisionDto, now = new Date()) {
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const w = await tx.maintenanceWindow.findUnique({ where: { id } });
      if (!w) throw new NotFoundException('Window not found.');
      if (w.writtenBy === actorUserId) throw new ForbiddenException('You scheduled this window. Another staff member approves it.');
      if (w.status !== 'pending_approval') throw new ConflictException('This window is no longer waiting for approval.');
      const problem = maintenanceProblem(w.startsAt, (w.endsAt.getTime() - w.startsAt.getTime()) / 3_600_000, await this.rules(tx), now);
      if (problem) throw new BadRequestException(`${problem} Cancel it and schedule another.`);
      await this.noOverlap(tx, w.startsAt, w.endsAt, w.id);
      const done = await tx.maintenanceWindow.updateMany({ where: { id, status: 'pending_approval', version: dto.version }, data: { status: 'scheduled', decidedBy: actorUserId, decidedAt: new Date(), version: { increment: 1 } } });
      if (!done.count) throw new ConflictException('Someone changed this window since you opened it. Open it again.');
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.maintenance.approved', entityType: 'maintenance_window', entityId: id, metadata: { title: w.title, startsAt: w.startsAt.toISOString() } });
    });
    return this.overview(actorUserId, now);
  }

  async cancel(actorUserId: string, id: string, dto: MaintenanceDecisionDto, now = new Date()) {
    if (!dto.reason?.trim()) throw new BadRequestException('Give a reason for cancelling.');
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const w = await tx.maintenanceWindow.findUnique({ where: { id } });
      if (!w) throw new NotFoundException('Window not found.');
      if (w.status === 'cancelled' || now >= w.endsAt) throw new ConflictException('This window has already ended or been cancelled.');
      const done = await tx.maintenanceWindow.updateMany({ where: { id, version: dto.version, status: { not: 'cancelled' } }, data: { status: 'cancelled', cancelledBy: actorUserId, cancelledAt: new Date(), cancelReason: dto.reason!.trim(), version: { increment: 1 } } });
      if (!done.count) throw new ConflictException('Someone changed this window since you opened it. Open it again.');
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.maintenance.cancelled', entityType: 'maintenance_window', entityId: id, metadata: { title: w.title, reason: dto.reason!.trim() } });
    });
    return this.overview(actorUserId, now);
  }

  /** What every company sees now (read in the caller's own context: the table is readable by everyone, written by staff). */
  async availability(ctx: TenantContext, now = new Date()) {
    // The one platform rule it needs (platform settings are staff-only data, read in the platform context).
    const bannerHours = (await this.tenantPrisma.forTenant(PLATFORM, (tx) => this.rules(tx)))['maintenance.banner_hours'];
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      const windows = await tx.maintenanceWindow.findMany({ where: { status: 'scheduled', endsAt: { gt: now } }, select: { title: true, startsAt: true, endsAt: true }, orderBy: { startsAt: 'asc' }, take: 5 });
      return { maintenance: currentMaintenance(windows, bannerHours, now) };
    });
  }
}
