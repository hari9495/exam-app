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
import { LEAD_DEFAULT, LEAD_KEY } from './incidents.service';
import { INVITE_EXPIRE_KEY } from './staff-roles.service';
import { PlatformStaffGuard } from './platform-staff.guard';

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
  // Answer 1173: "Send the invitation again" (Staff and roles), per person per India day.
  'staff.invite.resends_per_day': whole('Staff invitations: times a day the invitation may be sent again to one person', 3, 1, 10),
  // Answer 1243: invited staff who never sign in are deactivated by the nightly job after this many days.
  [INVITE_EXPIRE_KEY]: whole('Staff invitations: deactivate invited staff who never signed in after (days)', 30, 7, 90),
  // Answer 1261: the help-centre no-result searches (YX-11) and the incident breach reminders (C-8).
  ...Object.fromEntries(Object.entries(HELP_SETTINGS).map(([k, d]) => [k, whole(d.label, d.default, d.min, d.max)])),
  [LEAD_KEY]: whole('Breach reminders: hours before the CERT-In and DPDP due times', LEAD_DEFAULT, 0, 24),
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
