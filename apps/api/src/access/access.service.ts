import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CONFIDENTIAL_KEYS, GrantScope, PrismaService, TenantContext, TenantPrismaService, grantScopesFor, holdsConfidential, resolveScopedGrants } from '@exam-platform/shared';
import { audit, CompanyContext, inCompany, Tx } from '../org-structure/org-structure.service';
import { asDate, isoDate, todayIst } from '../org-structure/org-validation';
import { NotificationsService } from '../notifications/notifications.service';
import { PermissionProfilesService } from '../permission-profiles/permission-profiles.service';
import { settingFor } from '../people/probation';
import { GrantDto } from './dto';
import { ROLE_TEMPLATES } from './role-templates';

// Roles & access (P02 §4.2–4.3, §4.6, YX-SEC-02/03/11/18). A grant gives a user a role (a permission profile)
// over a scope, from a date, optionally to a date. Rights are the union of the user's base role and their
// active grants (resolveScopedGrants). A grant opening Confidential or Special data waits for a second admin
// (neither the granter nor the grantee) before it counts; self-granting is allowed but audited and the other
// admins are told (Q1). Before saving, a risk check counts the people a Confidential grant opens (YX-SEC-18 a).

type GrantRow = Prisma.RoleGrantGetPayload<object>;

/** Keys the effective-access preview counts people for ("can approve job changes for 4 people", P02 §7). */
const PREVIEW_KEYS: readonly { key: string; label: string }[] = [
  { key: 'employee.profile.view', label: 'See job records' },
  { key: 'employee.change.approve', label: 'Approve job changes' },
  { key: 'employee.personal.view', label: 'See personal details' },
  { key: 'employee.identity.view', label: 'See identity and bank details' },
  { key: 'employee.identity.approve', label: 'Approve bank and identity changes' },
  { key: 'employee.aadhaar.view', label: 'See Aadhaar in full' },
  { key: 'employee.salary.view', label: 'See salary' },
];

const SCOPE_TARGET: Record<string, 'legalEntityId' | 'locationId' | 'departmentId' | null> = {
  tenant: null,
  legal_entity: 'legalEntityId',
  location: 'locationId',
  department_subtree: 'departmentId',
  all_reports: null,
  direct_reports: null,
};

@Injectable()
export class AccessService {
  private readonly logger = new Logger(AccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly profiles: PermissionProfilesService,
    private readonly notifications: NotificationsService,
  ) {}

  templates() {
    return ROLE_TEMPLATES.map((t) => ({ ...t, confidential: holdsConfidential(t.permissions) }));
  }

  /** Q5: a company role from a template, edited afterwards like any role; the template itself never changes. */
  async fromTemplate(ctx: TenantContext, actorUserId: string, templateKey: string, name: string | undefined) {
    const t = ROLE_TEMPLATES.find((x) => x.key === templateKey);
    if (!t) throw new NotFoundException('No such role template');
    return this.profiles.create(ctx, actorUserId, { name: name?.trim() || t.name, permissions: [...t.permissions] });
  }

  /** The company's roles with how many people hold each (base assignment or grant). */
  roles(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.permissionProfile.findMany({ where: { organizationId: c.organizationId }, orderBy: { name: 'asc' } });
      const grants = await tx.roleGrant.groupBy({ by: ['permissionProfileId'], where: { organizationId: c.organizationId, status: { in: ['active', 'pending'] } }, _count: true });
      const users = await tx.user.groupBy({ by: ['permissionProfileId'], where: { organizationId: c.organizationId, permissionProfileId: { not: null } }, _count: true });
      return rows.map((p) => {
        const permissions = JSON.parse(p.permissionsJson) as string[];
        return {
          id: p.id,
          name: p.name,
          permissions,
          confidential: holdsConfidential(permissions),
          companyWideOnly: permissions.filter((k) => grantScopesFor(k).length === 1),
          grants: grants.find((g) => g.permissionProfileId === p.id)?._count ?? 0,
          assignedUsers: users.find((u) => u.permissionProfileId === p.id)?._count ?? 0,
        };
      });
    });
  }

  /** Staff of the company, for the user picker. */
  users(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.user.findMany({ where: { organizationId: c.organizationId, role: { not: 'super_admin' } }, select: { id: true, name: true, email: true, role: true, status: true, permissionProfileId: true }, orderBy: [{ name: 'asc' }, { email: 'asc' }], take: 1000 });
      const employees = await tx.employee.findMany({ where: { organizationId: c.organizationId, userId: { in: rows.map((r) => r.id) } }, select: { userId: true, id: true } });
      return rows.map((r) => ({ ...r, employeeId: employees.find((e) => e.userId === r.id)?.id ?? null }));
    });
  }

  grants(ctx: TenantContext, q: { userId?: string; status?: string }) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.roleGrant.findMany({
        where: { organizationId: c.organizationId, ...(q.userId ? { userId: q.userId } : {}), ...(q.status ? { status: q.status } : {}) },
        orderBy: [{ createdAt: 'desc' }],
        take: 500,
      });
      return this.views(tx, c, rows);
    });
  }

  private async views(tx: Tx, c: CompanyContext, rows: GrantRow[]) {
    const org = { organizationId: c.organizationId };
    const ids = (f: (r: GrantRow) => (string | null)[]) => [...new Set(rows.flatMap(f).filter((x): x is string => Boolean(x)))];
    const [users, profiles, entities, locations, departments] = await Promise.all([
      tx.user.findMany({ where: { ...org, id: { in: ids((r) => [r.userId, r.grantedBy, r.decidedBy, r.revokedBy]) } }, select: { id: true, name: true, email: true } }),
      tx.permissionProfile.findMany({ where: { ...org, id: { in: ids((r) => [r.permissionProfileId]) } }, select: { id: true, name: true, permissionsJson: true } }),
      tx.legalEntity.findMany({ where: { ...org, id: { in: ids((r) => [r.legalEntityId]) } }, select: { id: true, name: true } }),
      tx.location.findMany({ where: { ...org, id: { in: ids((r) => [r.locationId]) } }, select: { id: true, name: true } }),
      tx.department.findMany({ where: { ...org, id: { in: ids((r) => [r.departmentId]) } }, select: { id: true, name: true } }),
    ]);
    const who = (id: string | null) => (id ? (users.find((u) => u.id === id)?.name || users.find((u) => u.id === id)?.email || null) : null);
    const target = (r: GrantRow) => entities.find((x) => x.id === r.legalEntityId) ?? locations.find((x) => x.id === r.locationId) ?? departments.find((x) => x.id === r.departmentId) ?? null;
    return rows.map((r) => {
      const profile = profiles.find((p) => p.id === r.permissionProfileId);
      const t = target(r);
      return {
        id: r.id,
        userId: r.userId,
        userName: who(r.userId),
        role: { id: r.permissionProfileId, name: profile?.name ?? null, confidential: profile ? holdsConfidential(JSON.parse(profile.permissionsJson) as string[]) : false },
        scope: { type: r.scopeType, id: t?.id ?? null, name: t ? String(t.name) : null },
        validFrom: isoDate(r.validFrom),
        validTo: r.validTo ? isoDate(r.validTo) : null,
        status: r.status,
        reason: r.reason,
        grantedBy: who(r.grantedBy),
        grantedById: r.grantedBy,
        createdAt: r.createdAt,
        decidedBy: who(r.decidedBy),
        decidedAt: r.decidedAt,
        decisionNote: r.decisionNote,
        revokedBy: who(r.revokedBy),
        revokedAt: r.revokedAt,
      };
    });
  }

  /** How many people employed today a scope reaches, seen from the grantee (report scopes start at their record). */
  private async peopleIn(tx: Tx, c: CompanyContext, scope: GrantScope, granteeEmployee: string | null): Promise<number> {
    const today = todayIst();
    const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM employees e
      WHERE e.organization_id = ${c.organizationId}::uuid
        AND EXISTS (SELECT 1 FROM employments m WHERE m.organization_id = e.organization_id AND m.employee_id = e.id
                    AND m.joined_on <= ${today}::date AND (m.exited_on IS NULL OR m.exited_on >= ${today}::date))
        AND yx_scope_periods(${c.organizationId}::uuid, e.id, ${scope.type}, ${scope.id}::uuid, ${granteeEmployee}::uuid) @> ${today}::date`;
    return Number(n);
  }

  private async employeeOf(tx: Tx, c: CompanyContext, userId: string) {
    return (await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId }, select: { id: true } }))?.id ?? null;
  }

  /** The company's admins other than `except` (who are told about self-grants and grants waiting for them). */
  private async otherAdmins(tx: Tx, c: CompanyContext, except: (string | null)[]) {
    const admins = await tx.user.findMany({ where: { organizationId: c.organizationId, role: 'org_admin', status: 'active' }, select: { id: true } });
    return admins.map((a) => a.id).filter((id) => !except.includes(id));
  }

  async create(ctx: TenantContext, actorUserId: string, dto: GrantDto) {
    const result = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const user = await tx.user.findFirst({ where: { id: dto.userId, organizationId: c.organizationId } });
      if (!user || user.role === 'super_admin') throw new BadRequestException('Choose a user of this company.');
      if (user.status !== 'active') throw new BadRequestException('That user is not active.');
      const profile = await tx.permissionProfile.findFirst({ where: { id: dto.permissionProfileId, organizationId: c.organizationId } });
      if (!profile) throw new BadRequestException('Choose a role of this company.');
      const keys = JSON.parse(profile.permissionsJson) as string[];
      const column = SCOPE_TARGET[dto.scopeType];
      if (column ? !dto.scopeId : dto.scopeId) throw new BadRequestException(column ? 'Say which record the scope is for.' : 'This scope takes no record.');
      if (dto.scopeType === 'legal_entity' && !(await tx.legalEntity.findFirst({ where: { id: dto.scopeId, organizationId: c.organizationId } }))) throw new BadRequestException('No such legal entity in this company.');
      if (dto.scopeType === 'location' && !(await tx.location.findFirst({ where: { id: dto.scopeId, organizationId: c.organizationId } }))) throw new BadRequestException('No such location in this company.');
      if (dto.scopeType === 'department_subtree' && !(await tx.department.findFirst({ where: { id: dto.scopeId, organizationId: c.organizationId } }))) throw new BadRequestException('No such department in this company.');
      const granteeEmployee = await this.employeeOf(tx, c, user.id);
      if ((dto.scopeType === 'all_reports' || dto.scopeType === 'direct_reports') && !granteeEmployee) throw new BadRequestException('A "reports" scope needs the user to have an employee record.');
      // P02 §4.3: a key whose module has no record scope works company-wide only; say so instead of granting nothing.
      const unscoped = keys.filter((k) => !grantScopesFor(k).includes(dto.scopeType));
      if (unscoped.length) throw new BadRequestException({ statusCode: 400, code: 'KEYS_COMPANY_WIDE_ONLY', message: `These permissions work only for the whole company: ${unscoped.join(', ')}. Grant the role company-wide, or use a role without them.`, keys: unscoped });
      const today = todayIst();
      const validFrom = dto.validFrom ?? today;
      if (validFrom < today) throw new BadRequestException('A grant starts today or later.');
      if (dto.validTo && dto.validTo < validFrom) throw new BadRequestException('The end date is before the start date.');
      // YX-SEC-18 (a): Confidential / Special access over many people warns first.
      const confidential = holdsConfidential(keys);
      const people = await this.peopleIn(tx, c, { type: dto.scopeType, id: dto.scopeId ?? null }, granteeEmployee);
      const threshold = Number(await settingFor(tx, c, 'access.risk.confidential_threshold', { legalEntityId: '' }));
      const warnings = confidential && people > threshold ? [`Opens Confidential data (${keys.filter((k) => CONFIDENTIAL_KEYS.includes(k)).join(', ')}) of ${people} people, more than the company's limit of ${threshold}.`] : [];
      if (warnings.length && !dto.confirmRisk) {
        throw new ConflictException({ statusCode: 409, code: 'RISK_CONFIRMATION_REQUIRED', message: warnings[0], warnings, people });
      }
      const selfGrant = user.id === actorUserId;
      const row = await tx.roleGrant.create({
        data: {
          organizationId: c.organizationId,
          userId: user.id,
          permissionProfileId: profile.id,
          scopeType: dto.scopeType,
          ...(column ? { [column]: dto.scopeId } : {}),
          validFrom: asDate(validFrom),
          validTo: dto.validTo ? asDate(dto.validTo) : null,
          // §4.6: Confidential access waits for a second admin; everything else counts at once.
          status: confidential ? 'pending' : 'active',
          reason: dto.reason.trim(),
          grantedBy: actorUserId,
        },
      });
      await audit(tx, c, 'access.grant.created', 'role_grant', row.id, { userId: user.id, role: profile.name, scopeType: dto.scopeType, scopeId: dto.scopeId ?? null, validFrom, validTo: dto.validTo ?? null, status: row.status, confidential, people, riskConfirmed: warnings.length > 0, selfGrant });
      return { view: (await this.views(tx, c, [row]))[0], selfGrant, pending: confidential, notify: await this.otherAdmins(tx, c, [actorUserId, user.id]), organizationId: c.organizationId };
    });
    // Q1: self-grants and grants waiting for approval are told to the other admins (bell + email, best effort).
    if (result.selfGrant || result.pending) {
      await this.notifications
        .notify(ctx, actorUserId, result.notify, 'access.grant', {
          entityType: 'role_grant',
          entityId: result.view.id,
          contextText: `${result.view.userName ?? 'A user'} · ${result.view.role.name ?? 'a role'}${result.pending ? ' · waiting for your approval' : ' · granted to themselves'}`,
          linkPath: '/yx/settings/access',
        })
        .catch((e) => this.logger.error(e));
    }
    return result.view;
  }

  private async grantOr404(tx: Tx, c: CompanyContext, id: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`role-grant:${c.organizationId}:${id}`}))`;
    const row = await tx.roleGrant.findFirst({ where: { id, organizationId: c.organizationId } });
    if (!row) throw new NotFoundException('Grant not found');
    return row;
  }

  /** YX-SEC-11: approved by an admin who neither asked for it nor receives it. */
  decide(ctx: TenantContext, actorUserId: string, id: string, outcome: 'active' | 'rejected', note: string | undefined) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const row = await this.grantOr404(tx, c, id);
      if (row.status !== 'pending') throw new ConflictException(`This grant is ${row.status}.`);
      if (row.userId === actorUserId) throw new ForbiddenException('A grant to yourself is decided by another admin (YX-SEC-11).');
      if (row.grantedBy === actorUserId) throw new ForbiddenException('You asked for this grant, so another admin decides it (YX-SEC-11).');
      const updated = await tx.roleGrant.update({ where: { id }, data: { status: outcome, decidedBy: actorUserId, decidedAt: new Date(), decisionNote: note?.trim() || null } });
      await audit(tx, c, outcome === 'active' ? 'access.grant.approved' : 'access.grant.rejected', 'role_grant', id, { userId: row.userId });
      return (await this.views(tx, c, [updated]))[0];
    });
  }

  revoke(ctx: TenantContext, actorUserId: string, id: string, reason: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const row = await this.grantOr404(tx, c, id);
      if (row.status !== 'active' && row.status !== 'pending') throw new ConflictException(`This grant is ${row.status}.`);
      const updated = await tx.roleGrant.update({ where: { id }, data: { status: 'revoked', revokedBy: actorUserId, revokedAt: new Date(), decisionNote: reason.trim() } });
      await audit(tx, c, 'access.grant.revoked', 'role_grant', id, { userId: row.userId, reason: reason.trim() });
      return (await this.views(tx, c, [updated]))[0];
    });
  }

  /**
   * P02 §7 effective-access preview: for a user, what each people key reaches today ("can approve job changes
   * for 4 people, view salary for 0 people"), from their base role and active grants. Implicit team views are
   * listed separately: they never include pay or Personal data.
   */
  async effective(ctx: TenantContext, userId: string) {
    const user = await inCompany(this.tenantPrisma, ctx, (tx, c) => tx.user.findFirst({ where: { id: userId, organizationId: c.organizationId }, select: { id: true, role: true, permissionProfileId: true, organizationId: true } }));
    if (!user) throw new NotFoundException('User not found');
    const scopes = await resolveScopedGrants(this.prisma, this.tenantPrisma, { role: user.role, organizationId: user.organizationId, permissionProfileId: user.permissionProfileId, userId: user.id }, PREVIEW_KEYS.map((k) => k.key));
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const own = await this.employeeOf(tx, c, user.id);
      const out = [];
      for (const { key, label } of PREVIEW_KEYS) {
        const list = scopes.get(key) ?? [];
        let people = 0;
        if (list.length) {
          const parts = list.map((s) => Prisma.sql`yx_scope_periods(${c.organizationId}::uuid, e.id, ${s.type}, ${s.id}::uuid, ${own}::uuid)`);
          const today = todayIst();
          const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`
            SELECT count(*) AS n FROM employees e
            WHERE e.organization_id = ${c.organizationId}::uuid
              AND EXISTS (SELECT 1 FROM employments m WHERE m.organization_id = e.organization_id AND m.employee_id = e.id
                          AND m.joined_on <= ${today}::date AND (m.exited_on IS NULL OR m.exited_on >= ${today}::date))
              AND (${Prisma.join(parts, ' + ')}) @> ${today}::date`;
          people = Number(n);
        }
        out.push({ key, label, people, scopes: list });
      }
      return { userId: user.id, hasEmployeeRecord: Boolean(own), keys: out };
    });
  }
}
