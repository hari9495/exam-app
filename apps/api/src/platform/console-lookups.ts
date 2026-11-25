import { Controller, Get, Injectable, Query, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { AuditService, TenantPrismaService } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PlatformStaffGuard } from './platform-staff.guard';
import { PLATFORM, platformRead } from './platform.service';

// Retire /v2 (answers 2421 and 2431): the system logs (errors and warnings from the API, the exam runtime and candidates'
// browsers) and a search for a user across companies live in the staff console only. Staff only, on their own platform
// session with their security key, behind their own platform.* keys; every read is an audited cross-company read.

const PAGE = 50;

export class SystemLogQueryDto {
  @IsOptional()
  @IsIn(['api', 'exam-runtime', 'candidate-browser'])
  service?: string;

  @IsOptional()
  @IsIn(['error', 'warn'])
  severity?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  /** Older than this entry (the last one of the previous page). */
  @IsOptional()
  @IsUUID()
  before?: string;
}

export class UserSearchQueryDto {
  /** Part of an email address or a name; at least 3 characters so nobody lists every user. */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(3, 100)
  @Matches(/^[^%_\\]+$/, { message: 'Search with letters, digits, @ and dots.' })
  q!: string;
}

@Injectable()
export class ConsoleLookupsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** System logs, newest first, 50 a page, with each company's name. */
  systemLogs(actor: string, q: SystemLogQueryDto) {
    return platformRead(this.tenantPrisma, actor, 'system_logs.list', async (tx) => {
      const where: Prisma.SystemEventWhereInput = {
        ...(q.service ? { service: q.service } : {}),
        ...(q.severity ? { severity: q.severity } : {}),
        ...(q.organizationId ? { organizationId: q.organizationId } : {}),
        ...(q.from || q.to ? { occurredAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
      };
      const cursor = q.before ? await tx.systemEvent.findFirst({ where: { id: q.before }, select: { id: true, occurredAt: true } }) : null;
      const rows = await tx.systemEvent.findMany({
        where: cursor ? { AND: [where, { OR: [{ occurredAt: { lt: cursor.occurredAt } }, { occurredAt: cursor.occurredAt, id: { lt: cursor.id } }] }] } : where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: PAGE + 1,
      });
      const ids = [...new Set(rows.map((r) => r.organizationId).filter((x): x is string => Boolean(x)))];
      const names = await tx.organization.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
      const data = rows.slice(0, PAGE).map((r) => ({
        id: r.id,
        at: r.occurredAt,
        service: r.service,
        severity: r.severity,
        message: r.message,
        context: parse(r.contextJson),
        company: r.organizationId ? (names.find((n) => n.id === r.organizationId)?.name ?? 'Unknown company') : null,
        companyId: r.organizationId,
      }));
      return { data, nextCursor: rows.length > PAGE ? data[PAGE - 1].id : null };
    });
  }

  /** Users of every company whose email or name contains the text (staff accounts left out), at most 50. The text is audited. */
  async users(actor: string, q: UserSearchQueryDto) {
    const rows = await platformRead(this.tenantPrisma, actor, 'users.search', async (tx) => {
      await AuditService.recordIn(tx, PLATFORM, { actorUserId: actor, action: 'platform.users.searched', entityType: 'user', metadata: { q: q.q } });
      return tx.user.findMany({
        where: { organizationId: { not: null }, OR: [{ email: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }] },
        orderBy: [{ email: 'asc' }],
        take: PAGE + 1,
        select: { id: true, email: true, name: true, role: true, status: true, lastLoginAt: true, organization: { select: { id: true, name: true, slug: true } } },
      });
    });
    return {
      data: rows.slice(0, PAGE).map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, status: u.status, lastSignIn: u.lastLoginAt, company: u.organization?.name ?? null, companyId: u.organization?.id ?? null })),
      more: rows.length > PAGE,
    };
  }
}

const parse = (json: string | null): Record<string, unknown> | null => {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as unknown;
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

@Controller('platform')
@UseGuards(JwtAuthGuard, PlatformStaffGuard, PermissionsGuard)
export class ConsoleLookupsController {
  constructor(private readonly lookups: ConsoleLookupsService) {}

  @Get('system-logs')
  @RequirePermissions('platform.systemlogs.view')
  systemLogs(@CurrentUserId() actor: string, @Query() q: SystemLogQueryDto) {
    return this.lookups.systemLogs(actor, q);
  }

  @Get('users')
  @RequirePermissions('platform.users.search')
  users(@CurrentUserId() actor: string, @Query() q: UserSearchQueryDto) {
    return this.lookups.users(actor, q);
  }
}
