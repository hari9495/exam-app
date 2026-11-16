import { BadRequestException, Body, Controller, Get, Injectable, NotFoundException, Param, Put, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { AuditService, TenantPrismaService } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { ownSession } from '../org-structure/org-structure.controller';
import { CS_SETTINGS } from './customer-success.service';
import { BLOCK_DATES_DEFAULT, BLOCK_DATES_KEY, MAINTENANCE_SETTINGS } from './maintenance.service';
import { PLATFORM } from './platform.service';
import { HELP_SETTINGS } from '../service-desk/help-centre.service';
import { BOARD_NUDGE_DEFAULT, BOARD_NUDGE_KEY, LEAD_DEFAULT, LEAD_KEY } from './incidents.service';
import { SALES_REPLY_DEFAULT, SALES_REPLY_KEY } from './sales-assist.service';
import { ANALYTICS_MIN_DEFAULT, ANALYTICS_MIN_KEY, ANALYTICS_WINDOW_DEFAULT, ANALYTICS_WINDOW_KEY } from './analytics.service';
import { NUDGE_LIMIT_DEFAULT, NUDGE_LIMIT_KEY, NUDGE_RETURN_DEFAULT, NUDGE_RETURN_KEY } from './nudges.service';
import { INVITE_EXPIRE_KEY } from './staff-roles.service';
import { PlatformStaffGuard } from './platform-staff.guard';
import { ASK_MODEL_DEFAULT, ASK_MODEL_KEY, ASK_MODEL_PATTERN, ASK_SETTINGS } from '../help/assistant/assistant-settings';

// Answer 1125: Console › Platform settings. Every YukthiX-wide value in one list: the customer-success alerts (C-2), the
// breach reminders (C-4) and the maintenance rules (C-5). Each is checked against its own allowed range; a change needs
// the security key and a reason, and the value before and after is audited.

interface Def {
  label: string;
  default: string;
  /** What the value may be, in words. */
  allowed: string;
  /** The value cleaned, or an error in words. */
  check: (raw: string) => { value: string } | { error: string };
}

const whole = (label: string, def: number, min: number, max: number): Def => ({
  label,
  default: String(def),
  allowed: `a whole number from ${min} to ${max}`,
  check: (raw) => {
    const v = Number(raw.trim());
    return Number.isInteger(v) && v >= min && v <= max ? { value: String(v) } : { error: `${label}: give a whole number from ${min} to ${max}.` };
  },
});

export const PLATFORM_SETTING_DEFS: Record<string, Def> = {
  ...Object.fromEntries(Object.entries(CS_SETTINGS).map(([k, d]) => [k, whole(d.label, d.default, d.min, d.max)])),
  ...Object.fromEntries(Object.entries(MAINTENANCE_SETTINGS).map(([k, d]) => [k, whole(d.label, d.default, d.min, d.max)])),
  // Ask YukthiX (answers 2102, 2104, 2108): the Claude model, the daily limit, the hand-over count, how long chats stay.
  ...Object.fromEntries(Object.entries(ASK_SETTINGS).map(([k, d]) => [k, whole(d.label, d.default, d.min, d.max)])),
  [ASK_MODEL_KEY]: {
    label: 'Ask YukthiX: Claude model',
    default: ASK_MODEL_DEFAULT,
    allowed: 'a Claude model ID, such as claude-opus-5-5',
    check: (raw) => {
      const v = raw.trim().toLowerCase();
      return ASK_MODEL_PATTERN.test(v) && v.length <= 60 ? { value: v } : { error: 'Ask YukthiX model: give a Claude model ID, such as claude-opus-5-5.' };
    },
  },
  [BLOCK_DATES_KEY]: {
    label: 'No windows on these statutory dates (days of the month)',
    default: BLOCK_DATES_DEFAULT,
    allowed: 'up to 10 days of the month, each from 1 to 28, separated by commas',
    check: (raw) => {
      const parts = raw.split(',').map((x) => x.trim()).filter(Boolean);
      const days = parts.map(Number);
      if (parts.length > 10 || days.some((d) => !Number.isInteger(d) || d < 1 || d > 28)) return { error: 'Statutory dates: up to 10 days of the month, each from 1 to 28, separated by commas.' };
      return { value: [...new Set(days)].sort((a, b) => a - b).join(',') };
    },
  },
  // C-4 (answer 1050): the breach clock. shortcut: ranges set by YukthiX (question 1182); verify with counsel.
  'breach.certin_hours': whole('CERT-In: report a cyber security incident within (hours)', 6, 1, 24),
  'breach.dpdp_board_report_hours': whole('DPDP Rules 2025: detailed report to the Data Protection Board within (hours)', 72, 1, 168),
  // DPDP Rule 7 (founder, 13 Nov 2026): the Board is told without delay; Security leads are reminded until it is marked.
  [BOARD_NUDGE_KEY]: whole('DPDP Rule 7: remind Security leads to tell the Data Protection Board every (minutes) until marked', BOARD_NUDGE_DEFAULT, 15, 1440),
  // Answer 1173: "Send the invitation again" (Staff and roles), per person per India day.
  'staff.invite.resends_per_day': whole('Staff invitations: times a day the invitation may be sent again to one person', 3, 1, 10),
  // Answer 1243: invited staff who never sign in are deactivated by the nightly job after this many days.
  [INVITE_EXPIRE_KEY]: whole('Staff invitations: deactivate invited staff who never signed in after (days)', 30, 7, 90),
  // Answer 1261: the help-centre no-result searches (YX-11) and the incident breach reminders (C-8).
  ...Object.fromEntries(Object.entries(HELP_SETTINGS).map(([k, d]) => [k, whole(d.label, d.default, d.min, d.max)])),
  [LEAD_KEY]: whole('Breach reminders: hours before the CERT-In and DPDP due times', LEAD_DEFAULT, 0, 24),
  // C-8 (YX-12): how many nudges one person sees in 7 days at most (0 = none).
  [NUDGE_LIMIT_KEY]: whole('Nudges: the most one person sees in 7 days', NUDGE_LIMIT_DEFAULT, 0, 7),
  // C-8 (YX-13): reply to a Talk to us request within (the drawn 1 business day as hours).
  // C-8 (YX-09): product analytics, counts only; never a group under 5 companies.
  // S-9 (answer 1332) and answer 1882: the export link time and how long a closed company's data is kept.
  'account.export.link_hours': whole('Whole-company export: the download link works for (hours)', 24, 1, 168),
  'account.closure.keep_days': whole('Closed company: data is kept for (days) before deletion', 30, 30, 365),
  // Answer 1975: a deleted company's statutory records (audit log, payroll, filings) stay read-only at least this long.
  'account.closure.statutory_keep_years': whole('Deleted company: statutory records are kept for (years, at least 8)', 8, 8, 20),
  [ANALYTICS_WINDOW_KEY]: whole('Product analytics: count use over the last (days)', ANALYTICS_WINDOW_DEFAULT, 7, 180),
  [ANALYTICS_MIN_KEY]: whole('Product analytics: hide any group of fewer than this many companies', ANALYTICS_MIN_DEFAULT, 5, 50),
  [SALES_REPLY_KEY]: whole('Sales assist: reply to a Talk to us request within (hours)', SALES_REPLY_DEFAULT, 4, 72),
  [NUDGE_RETURN_KEY]: whole('Nudges: days before a nudge put away with Not now may show again (0 = never)', NUDGE_RETURN_DEFAULT, 0, 90),
};

export class PlatformSettingDto {
  @Transform(({ value }) => (typeof value === 'number' ? String(value) : value))
  @IsString()
  @MaxLength(200)
  value!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(5, { message: 'Give a reason of at least 5 characters' })
  @MaxLength(500)
  reason!: string;
}

@Injectable()
export class PlatformSettingsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** Every setting YukthiX knows and every row stored, with its value (the default until changed). */
  list() {
    return this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const rows = await tx.platformSetting.findMany();
      const keys = [...new Set([...Object.keys(PLATFORM_SETTING_DEFS), ...rows.map((r) => r.key)])].sort();
      return keys.map((key) => {
        const def = PLATFORM_SETTING_DEFS[key];
        const row = rows.find((r) => r.key === key);
        return {
          key,
          label: row?.label || def?.label || key,
          value: row?.value ?? def?.default ?? '',
          default: def?.default ?? null,
          allowed: def?.allowed ?? null,
          verify: row?.verify ?? false,
          // A stored value nobody defined a range for is shown only; it changes by a migration.
          editable: Boolean(def),
          updatedAt: row?.updatedAt ?? null,
        };
      });
    });
  }

  async change(actorUserId: string, key: string, dto: PlatformSettingDto) {
    const def = PLATFORM_SETTING_DEFS[key];
    if (!def) throw new NotFoundException('No such platform setting.');
    const checked = def.check(dto.value);
    if ('error' in checked) throw new BadRequestException(checked.error);
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`platform-setting:${key}`}))`;
      const before = (await tx.platformSetting.findUnique({ where: { key } }))?.value ?? def.default;
      await tx.platformSetting.upsert({ where: { key }, create: { key, value: checked.value, label: def.label, updatedBy: actorUserId }, update: { value: checked.value, updatedBy: actorUserId, updatedAt: new Date() } });
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.setting.changed', entityType: 'platform_setting', entityId: key, metadata: { before, after: checked.value, reason: dto.reason } });
    });
    return this.list();
  }
}

@Controller('platform/settings')
@UseGuards(JwtAuthGuard, PlatformStaffGuard, PermissionsGuard)
export class PlatformSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get()
  @RequirePermissions('platform.settings.manage')
  list() {
    return this.settings.list();
  }

  @Put(':key')
  @RequirePermissions('platform.settings.manage')
  @RequireStepUp()
  change(@Req() req: Request, @CurrentUserId() actor: string, @Param('key') key: string, @Body() dto: PlatformSettingDto) {
    ownSession(req);
    return this.settings.change(actor, key, dto);
  }
}
