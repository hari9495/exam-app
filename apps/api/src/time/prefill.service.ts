import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import type { ScopeUser } from '../access/scope';
import { TOOL_LABEL, TOOL_PROVIDERS, WORK_TOOLS, matchProject, type ToolProvider, type WorkToolConnector } from './providers/work-tools';
import { addDays } from './time-maths';
import { mondayOf } from './time-rules';
import { factsOn, myEmployeeId, settingOn, todayIn } from './time-core';

// TIM-43 Timesheet pre-fill from my tools (design-map rule 16). The signed-in person connects their own work tools and
// asks for suggestions for a week; the server maps them onto the company's active timesheet projects and writes
// nothing to the timesheet: the person accepts lines in the drawer, which then go through the normal timesheet save.
// Only when timesheet.tool_suggestions is on for the person; disconnecting always works (and is audited).

const NOT_ON = 'Timesheet suggestions from your tools are not set up for your company. Ask HR to turn them on, or fill the week by hand.';

@Injectable()
export class PrefillService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    @Inject(WORK_TOOLS) private readonly tools: WorkToolConnector,
  ) {}

  /** Only the person themselves, never someone acting for them. */
  private self(user: ScopeUser) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
  }

  private async enabled(tx: Tx, c: CompanyContext) {
    const me = await myEmployeeId(tx, c.organizationId, c.userId);
    const f = await factsOn(tx, c.organizationId, me, todayIst());
    if (!f) return { on: false, zone: 'Asia/Kolkata' };
    return { on: (await settingOn(tx, c, 'timesheet.tool_suggestions', f, todayIst())) === 'on', zone: f.zone };
  }

  private async mustBeOn(tx: Tx, c: CompanyContext) {
    const s = await this.enabled(tx, c);
    if (!s.on) throw new ForbiddenException(NOT_ON);
    return s;
  }

  /** My tools: each provider, connected or not. `enabled` false: the drawer shows "not set up". */
  connections(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.enabled(tx, c);
      const live = await tx.toolConnection.findMany({ where: { organizationId: c.organizationId, userId: c.userId!, status: 'connected' } });
      return {
        enabled: s.on,
        tools: TOOL_PROVIDERS.map((p) => {
          const x = live.find((r) => r.provider === p);
          return { provider: p, label: TOOL_LABEL[p], connected: Boolean(x), accountLabel: x?.accountLabel ?? null, connectedAt: x?.connectedAt ?? null };
        }),
      };
    });
  }

  async connect(ctx: TenantContext, user: ScopeUser, provider: ToolProvider) {
    this.self(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.mustBeOn(tx, c);
      const org = c.organizationId;
      const userId = c.userId!;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`tools:${org}:${userId}:${provider}`}))`;
      // Connect twice: the one live connection answers again.
      const live = await tx.toolConnection.findFirst({ where: { organizationId: org, userId, provider, status: 'connected' } });
      if (live) return { provider, accountLabel: live.accountLabel, connectedAt: live.connectedAt, repeat: true };
      let accountLabel: string;
      try {
        ({ accountLabel } = await this.tools.connect(userId, provider));
      } catch {
        throw new ServiceUnavailableException(`${TOOL_LABEL[provider]} can't be connected yet. No provider is set up. Fill the week by hand.`);
      }
      try {
        const x = await tx.toolConnection.create({ data: { organizationId: org, userId, provider, accountLabel: accountLabel.slice(0, 150) } });
        await audit(tx, c, 'time.tools.connected', 'tool_connection', x.id, { provider });
        return { provider, accountLabel: x.accountLabel, connectedAt: x.connectedAt, repeat: false };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`${TOOL_LABEL[provider]} was connected just now. Refresh.`);
        throw e;
      }
    });
  }

  /** Revoke always works, even when suggestions were turned off since. A repeat answers with nothing to do. */
  async disconnect(ctx: TenantContext, user: ScopeUser, provider: ToolProvider) {
    this.self(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const live = await tx.toolConnection.findFirst({ where: { organizationId: c.organizationId, userId: c.userId!, provider, status: 'connected' } });
      if (!live) return { provider, repeat: true };
      await tx.toolConnection.update({ where: { id: live.id }, data: { status: 'revoked', revokedAt: new Date() } });
      await audit(tx, c, 'time.tools.disconnected', 'tool_connection', live.id, { provider });
      return { provider, repeat: false };
    });
  }

  /** Suggestions for my week (Monday), days up to today, from my connected tools, mapped onto active projects. */
  suggestions(ctx: TenantContext, weekIn: string) {
    const week = mondayOf(weekIn);
    if (week !== weekIn) throw new BadRequestException('A timesheet week starts on a Monday.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.mustBeOn(tx, c);
      const org = c.organizationId;
      const today = todayIn(s.zone);
      if (week > today) throw new BadRequestException('Suggestions are for weeks that have started.');
      const upTo = addDays(week, 6) < today ? addDays(week, 6) : today;
      const [live, projects] = await Promise.all([
        tx.toolConnection.findMany({ where: { organizationId: org, userId: c.userId!, status: 'connected' } }),
        tx.timesheetProject.findMany({ where: { organizationId: org, active: true }, select: { id: true, code: true, name: true, activities: true } }),
      ]);
      const lines = [];
      for (const x of live) {
        const provider = x.provider as ToolProvider;
        for (const [i, l] of (await this.tools.suggestions(c.userId!, provider, week, upTo)).entries()) {
          // A tool's line outside the week, in the future or with no time is dropped.
          if (l.date < week || l.date > upTo || !(l.minutes > 0)) continue;
          const m = matchProject(l.projectHint, l.activityHint, projects);
          lines.push({ id: `${provider}-${l.date}-${i}`, provider, date: l.date, minutes: Math.min(Math.round(l.minutes), 1440), projectId: m.projectId, activity: m.activity, projectHint: l.projectHint, source: l.source.slice(0, 200), kind: l.kind });
        }
      }
      return { week, upTo, lines: lines.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)) };
    });
  }
}
