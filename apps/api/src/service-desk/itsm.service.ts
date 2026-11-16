import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { Tx } from '../org-structure/org-structure.service';
import { DeskActor, audit, canSetUp, has, isAgentOn, requireSetUp } from './desk-access';
import { ItsmSettingsDto, ItsmWindowDto } from './dto-itsm';
import { CompanyWindow, DEFAULT_RISK_QUESTIONS, DEFAULT_WINDOW, RiskQuestion, parseFreezeDates, questionsProblem } from './itsm-rules';

/** Answers 1934-1939: the desk defaults while an IT desk has no settings row. */
export const ITSM_DEFAULTS = { routeLow: 'lead', routeMedium: 'lead_owner', routeHigh: 'board', boardRule: 'majority', emergencyReviewDays: 2, bannerOn: true, bannerHours: 24, reviewDays: 5, repeatCount: 3, repeatDays: 7 } as const;
export interface ItsmSettings {
  routeLow: string;
  routeMedium: string;
  routeHigh: string;
  boardUserIds: string[];
  boardRule: string;
  emergencyReviewDays: number;
  bannerOn: boolean;
  bannerHours: number;
  reviewDays: number;
  repeatCount: number;
  repeatDays: number;
  riskQuestions: RiskQuestion[];
  version: number;
}

// Answer 1936: the company settings behind the change window (registry keys itsm.*).
const WINDOW_KEYS = {
  weekdayFrom: 'itsm.window.weekday_from',
  weekdayTo: 'itsm.window.weekday_to',
  weekends: 'itsm.window.weekends',
  freezeFirstDays: 'itsm.freeze.first_days',
  freezeLastDays: 'itsm.freeze.last_days',
  freezeDates: 'itsm.freeze.dates',
} as const;
const HHMM = /^([01]\d|2[0-3]):[03]0$/;

/** The company's change window and freezes; a missing or unreadable value is the default. */
export async function companyWindow(tx: Tx, org: string): Promise<CompanyWindow> {
  const rows = await tx.setting.findMany({ where: { organizationId: org, key: { in: Object.values(WINDOW_KEYS) }, scopeType: 'tenant', scopeId: org }, select: { key: true, value: true } });
  const v = (k: keyof typeof WINDOW_KEYS) => rows.find((r) => r.key === WINDOW_KEYS[k])?.value as string | undefined;
  const days = (x: string | undefined, d: number) => (x != null && /^(\d|10)$/.test(String(x)) ? Number(x) : d);
  return {
    weekdayFrom: HHMM.test(v('weekdayFrom') ?? '') ? v('weekdayFrom')! : DEFAULT_WINDOW.weekdayFrom,
    weekdayTo: HHMM.test(v('weekdayTo') ?? '') ? v('weekdayTo')! : DEFAULT_WINDOW.weekdayTo,
    weekends: v('weekends') == null ? DEFAULT_WINDOW.weekends : v('weekends') === 'on',
    freezeFirstDays: days(v('freezeFirstDays'), DEFAULT_WINDOW.freezeFirstDays),
    freezeLastDays: days(v('freezeLastDays'), DEFAULT_WINDOW.freezeLastDays),
    freezeDates: v('freezeDates') == null ? DEFAULT_WINDOW.freezeDates : parseFreezeDates(String(v('freezeDates'))),
  };
}

/** An IT desk's settings (the defaults when it has no row). */
export async function itsmSettingsOf(tx: Tx, org: string, deskId: string): Promise<ItsmSettings> {
  const row = await tx.sdItsmSettings.findUnique({ where: { organizationId_deskId: { organizationId: org, deskId } } });
  if (!row) return { ...ITSM_DEFAULTS, boardUserIds: [], riskQuestions: DEFAULT_RISK_QUESTIONS, version: 0 };
  return {
    routeLow: row.routeLow,
    routeMedium: row.routeMedium,
    routeHigh: row.routeHigh,
    boardUserIds: row.boardUserIds,
    boardRule: row.boardRule,
    emergencyReviewDays: row.emergencyReviewDays,
    bannerOn: row.bannerOn,
    bannerHours: row.bannerHours,
    reviewDays: row.reviewDays,
    repeatCount: row.repeatCount,
    repeatDays: row.repeatDays,
    riskQuestions: (row.riskQuestions as unknown as RiskQuestion[] | null) ?? DEFAULT_RISK_QUESTIONS,
    version: row.version,
  };
}

/**
 * Helpdesk ITSM-1 (answers 1931-1939): an IT desk's change and problem settings, each with its default, and the
 * company's change window and freezes. The desk's admins change the desk's; the company's Service Desk owner
 * (desk.desk.create) changes the company's, as with the knowledge review interval.
 */
@Injectable()
export class ItsmService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  tx<T>(a: DeskActor, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant(a.ctx, fn);
  }

  /** The IT desk (404 for another company's or an unknown desk; 400 for a desk that is not IT). */
  async itDesk(tx: Tx, a: { ctx: DeskActor['ctx'] }, deskId: string) {
    const desk = await tx.sdDesk.findFirst({ where: { organizationId: a.ctx.organizationId, id: deskId, status: 'active' }, select: { id: true, kind: true, name: true, calendarId: true } });
    if (!desk) throw new NotFoundException('No such desk.');
    if (desk.kind !== 'it') throw new BadRequestException('Changes and problems are for IT desks only.');
    return desk;
  }

  async settings(a: DeskActor, deskId: string) {
    const canEdit = canSetUp(a, deskId, 'desk.settings.manage');
    if (!canEdit && !isAgentOn(a, deskId)) requireSetUp(a, deskId, 'desk.settings.manage');
    return this.tx(a, async (tx) => {
      await this.itDesk(tx, a, deskId);
      return this.view(tx, a, deskId, canEdit);
    });
  }

  private async view(tx: Tx, a: DeskActor, deskId: string, canEdit: boolean) {
    const org = a.ctx.organizationId;
    const s = await itsmSettingsOf(tx, org, deskId);
    const users = s.boardUserIds.length ? await tx.user.findMany({ where: { organizationId: org, id: { in: s.boardUserIds } }, select: { id: true, name: true } }) : [];
    return {
      ...s,
      board: s.boardUserIds.map((id) => ({ id, name: users.find((u) => u.id === id)?.name ?? 'Former user' })),
      riskQuestionsAreDefault: JSON.stringify(s.riskQuestions) === JSON.stringify(DEFAULT_RISK_QUESTIONS),
      defaults: { ...ITSM_DEFAULTS, riskQuestions: DEFAULT_RISK_QUESTIONS },
      window: await companyWindow(tx, org),
      windowDefaults: DEFAULT_WINDOW,
      canEdit,
      canEditWindow: has(a, 'desk.desk.create'),
    };
  }

  async saveSettings(a: DeskActor, deskId: string, dto: ItsmSettingsDto) {
    requireSetUp(a, deskId, 'desk.settings.manage');
    const { version, riskQuestions, ...rest } = dto;
    const data: Prisma.SdItsmSettingsUncheckedUpdateInput = { ...rest };
    if (riskQuestions !== undefined) {
      if (riskQuestions === null) data.riskQuestions = Prisma.DbNull;
      else {
        const problem = questionsProblem(riskQuestions);
        if (problem) throw new BadRequestException(problem);
        // Kept as given, trimmed to the known fields (never other keys from the request).
        data.riskQuestions = (riskQuestions as RiskQuestion[]).map((q) => ({ id: q.id, label: q.label.trim(), options: q.options.map((o) => ({ value: o.value, label: o.label.trim() })) }));
      }
    }
    if (!Object.keys(data).length) throw new BadRequestException('Nothing to change.');
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      await this.itDesk(tx, a, deskId);
      const before = await itsmSettingsOf(tx, org, deskId);
      if (before.version !== version) throw new ConflictException('Someone else changed these settings. Reload and try again.');
      const board = dto.boardUserIds ?? before.boardUserIds;
      if (dto.boardUserIds) {
        const found = await tx.user.count({ where: { organizationId: org, id: { in: board }, status: 'active' } });
        if (found !== new Set(board).size) throw new BadRequestException('Choose active people of this company for the change board.');
        data.boardUserIds = [...new Set(board)];
      }
      // Answer 1934: a route that goes to the board needs a board.
      const routes = [dto.routeLow ?? before.routeLow, dto.routeMedium ?? before.routeMedium, dto.routeHigh ?? before.routeHigh];
      if (routes.includes('board') && !board.length) throw new BadRequestException('Name the change board first: at least one person.');
      if (before.version === 0) {
        await tx.sdItsmSettings.create({ data: { ...(data as Prisma.SdItsmSettingsUncheckedCreateInput), organizationId: org, deskId, updatedBy: a.userId } });
      } else {
        const res = await tx.sdItsmSettings.updateMany({ where: { organizationId: org, deskId, version }, data: { ...data, version: { increment: 1 }, updatedBy: a.userId, updatedAt: new Date() } });
        if (!res.count) throw new ConflictException('Someone else changed these settings. Reload and try again.');
      }
      await audit(tx, a, 'desk.itsm.settings_changed', 'sd_desk', deskId, { ...rest, ...(riskQuestions !== undefined ? { riskQuestions: riskQuestions === null ? 'starter' : 'own' } : {}) });
      return this.view(tx, a, deskId, true);
    });
  }

  async saveWindow(a: DeskActor, dto: ItsmWindowDto) {
    if (!has(a, 'desk.desk.create')) throw new ForbiddenException('Only the company’s Service Desk owner changes the change window and freezes.');
    const values: [string, string][] = [];
    if (dto.weekdayFrom !== undefined) values.push([WINDOW_KEYS.weekdayFrom, dto.weekdayFrom]);
    if (dto.weekdayTo !== undefined) values.push([WINDOW_KEYS.weekdayTo, dto.weekdayTo]);
    if (dto.weekends !== undefined) values.push([WINDOW_KEYS.weekends, dto.weekends ? 'on' : 'off']);
    if (dto.freezeFirstDays !== undefined) values.push([WINDOW_KEYS.freezeFirstDays, String(dto.freezeFirstDays)]);
    if (dto.freezeLastDays !== undefined) values.push([WINDOW_KEYS.freezeLastDays, String(dto.freezeLastDays)]);
    if (dto.freezeDates !== undefined) {
      const parts = dto.freezeDates.split(',').map((x) => x.trim()).filter(Boolean);
      const dates = parseFreezeDates(dto.freezeDates);
      if (parts.some((x) => !/^\d{1,2}$/.test(x) || Number(x) < 1 || Number(x) > 31)) throw new BadRequestException('Freeze dates are dates of the month from 1 to 31, such as 7, 15, 20.');
      values.push([WINDOW_KEYS.freezeDates, dates.join(',')]);
    }
    if (!values.length) throw new BadRequestException('Nothing to change.');
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const before = await companyWindow(tx, org);
      for (const [key, value] of values) {
        // Stored as the registry stores it (text), so Settings › registry shows the same value.
        const where = { organizationId: org, key, scopeType: 'tenant', scopeId: org, validFrom: null };
        const row = await tx.setting.findFirst({ where, select: { id: true } });
        if (row) await tx.setting.update({ where: { id: row.id }, data: { value, updatedBy: a.userId } });
        else await tx.setting.create({ data: { ...where, value, updatedBy: a.userId } });
      }
      const after = await companyWindow(tx, org);
      if (after.weekdayFrom === after.weekdayTo) throw new BadRequestException('The window must start and end at different times.');
      await audit(tx, a, 'desk.itsm.window_changed', 'setting', 'itsm', { from: before, to: after });
      return { window: after, windowDefaults: DEFAULT_WINDOW };
    });
  }
}
