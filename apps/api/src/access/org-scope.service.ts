import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService, TenantContext, TenantPrismaService, resolveScopedGrants } from '@exam-platform/shared';
import { inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import type { MasterKind } from '../org-structure/dto';
import { buildViewer, covers, grantPeriods, type ScopeUser } from './scope';

// P02 §4.3 for organisation data (P01): org.* and pay.range.* keys may be granted for the whole company or
// for one legal entity (grantScopesFor). An entity-scoped holder reads and changes only that entity's records
// (its row, statutory identifiers, locations, entity-only masters, cost centres, pay ranges and settings);
// shared masters and company-wide settings need the company-wide grant. Structure lists stay readable to
// every holder of org.structure.view: they are Public / Internal configuration, not personal data.

/** The legal entities a key reaches: every one, or a set (empty = none). */
export type EntityReach = 'all' | ReadonlySet<string>;

@Injectable()
export class OrgScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  async reach(req: Request, key: string): Promise<EntityReach> {
    const user = req.user as ScopeUser;
    const scopes = (await resolveScopedGrants(this.prisma, this.tenantPrisma, { role: user.role, organizationId: user.organizationId ?? null, permissionProfileId: user.permissionProfileId, userId: user.userId ?? null }, [key])).get(key) ?? [];
    // YukthiX staff acting in a company pass the guard without grants; their writes are refused by ownSession.
    if (user.actingSuperAdmin || scopes.some((s) => s.type === 'tenant')) return 'all';
    return new Set(scopes.filter((s) => s.type === 'legal_entity').map((s) => s.id!));
  }

  /** `entityId` null = something company-wide (a shared master, a company setting, a new entity). */
  async require(req: Request, key: string, entityId: string | null): Promise<void> {
    const reach = await this.reach(req, key);
    if (reach === 'all') return;
    if (entityId === null) throw new ForbiddenException(`This applies to the whole company: it needs ${key} for the whole company.`);
    if (!reach.has(entityId)) throw new NotFoundException('Not found in the legal entities you manage');
  }

  /** The entity a record belongs to (null = shared / company-wide); 404 when it is not in this company. */
  entityOf(ctx: TenantContext, what: 'location' | 'pay_range' | MasterKind, id: string): Promise<string | null> {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const where = { id, organizationId: c.organizationId };
      const pick = async <T>(row: Promise<T | null>, f: (r: T) => string | null) => {
        const r = await row;
        if (!r) throw new NotFoundException('Not found');
        return f(r);
      };
      switch (what) {
        case 'location':
          return pick(tx.location.findFirst({ where, select: { legalEntityId: true } }), (r) => r.legalEntityId);
        case 'pay_range':
          return pick(tx.gradePayRange.findFirst({ where, select: { legalEntityId: true } }), (r) => r.legalEntityId);
        case 'cost-centres':
          return pick(tx.costCentre.findFirst({ where, select: { legalEntityId: true } }), (r) => r.legalEntityId);
        case 'departments':
          return pick(tx.department.findFirst({ where, select: { ownerLegalEntityId: true } }), (r) => r.ownerLegalEntityId);
        case 'designations':
          return pick(tx.designation.findFirst({ where, select: { ownerLegalEntityId: true } }), (r) => r.ownerLegalEntityId);
        case 'grades':
          return pick(tx.grade.findFirst({ where, select: { ownerLegalEntityId: true } }), (r) => r.ownerLegalEntityId);
        case 'employment-types':
          return pick(tx.employmentType.findFirst({ where, select: { ownerLegalEntityId: true } }), (r) => r.ownerLegalEntityId);
      }
    });
  }

  /** employee.profile.view reaches the person on the date (P02 §4.3); otherwise as if they did not exist. */
  async requireEmployee(req: Request, ctx: TenantContext, employeeId: string, asOf: string | undefined): Promise<void> {
    const user = req.user as ScopeUser;
    if (user.actingSuperAdmin) return;
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, ['employee.profile.view']);
    const ok = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const own = v.userId ? ((await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: v.userId }, select: { id: true } }))?.id ?? null) : null;
      return covers(await grantPeriods(tx, c, v, 'employee.profile.view', employeeId, own), asOf ?? todayIst());
    });
    if (!ok) throw new NotFoundException('Employee not found');
  }

  /** A setting's scope as an entity: an entity or a location's entity; anything else is company-wide. */
  async settingEntity(ctx: TenantContext, scopeType: string, scopeId: string | null | undefined): Promise<string | null> {
    if (scopeType === 'legal_entity' && scopeId) return scopeId;
    if (scopeType === 'location' && scopeId) return this.entityOf(ctx, 'location', scopeId);
    return null;
  }

  async settingById(ctx: TenantContext, id: string): Promise<string | null> {
    const row = await inCompany(this.tenantPrisma, ctx, (tx, c) => tx.setting.findFirst({ where: { id, organizationId: c.organizationId }, select: { scopeType: true, scopeId: true } }));
    if (!row) throw new NotFoundException('Setting not found');
    return this.settingEntity(ctx, row.scopeType, row.scopeId);
  }
}
