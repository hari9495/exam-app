import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditEntry, AuditService, TenantContext, TenantPrismaService, revokeStaffSessions } from '@exam-platform/shared';
import { OrganizationsService } from '../organizations/organizations.service';
import { addDays, asDate, todayIst } from '../org-structure/org-validation';
import { CompaniesQueryDto, CreateCompanyDto, ExtendTrialDto, LifecycleAction, LifecycleDto, PlatformAuditQueryDto, PriceDto } from './dto';

type Tx = Prisma.TransactionClient;
export type Actor = NonNullable<AuditEntry['actor']>;

/** The RLS bypass. Only `platformRead` and the staff-only writes below use it. */
export const PLATFORM: TenantContext = { organizationId: null, isSuperAdmin: true };
const companyCtx = (organizationId: string): TenantContext => ({ organizationId, isSuperAdmin: false });

/**
 * A read across companies by YukthiX staff (P01 §4 row 2: no silent super-admin bypass). The bypass runs only here,
 * and every use is written to the platform audit log with its purpose, in the same transaction.
 */
export function platformRead<T>(tenantPrisma: TenantPrismaService, actorUserId: string, purpose: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return tenantPrisma.forTenant(PLATFORM, async (tx) => {
    await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.cross_tenant_read', entityType: 'platform', metadata: { purpose } });
    return fn(tx);
  });
}

/** The staff member's identity for audit rows written under a company's context (RLS hides the staff row there). */
export async function staffActor(tenantPrisma: TenantPrismaService, userId: string): Promise<Actor & { label: string }> {
  const user = await tenantPrisma.forTenant(PLATFORM, (tx) => tx.user.findFirst({ where: { id: userId, organizationId: null, role: 'super_admin' }, select: { email: true, name: true, role: true } }));
  if (!user) throw new NotFoundException('Staff account not found');
  return { email: user.email, name: user.name, role: user.role, label: user.name?.trim() || user.email };
}

// P14 §3 lifecycle moves the console offers. Reinstating returns a company to where it was before it was suspended.
const MOVES: Record<LifecycleAction, { from: readonly string[]; to: string | null }> = {
  activate: { from: ['trial'], to: 'active' },
  suspend: { from: ['trial', 'active'], to: 'suspended' },
  reinstate: { from: ['suspended'], to: null },
  close: { from: ['trial', 'active', 'suspended'], to: 'closed' },
};
const TRIAL_DAYS = 30; // P14 YX-TEN-08
const PRICE_NOTICE_DAYS = 90; // P14 YX-BILL-13

const money = (d: Prisma.Decimal) => Number(d.toString());

@Injectable()
export class PlatformService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly organizations: OrganizationsService,
  ) {}

  /** One staff change to one company and its audit row (visible to the company's admins, YX-CONSOLE-02), atomically. */
  private changeCompany<T>(organizationId: string, actorUserId: string, actor: Actor, fn: (tx: Tx) => Promise<{ result: T; audit: Omit<AuditEntry, 'actorUserId' | 'actor'> }>): Promise<T> {
    const ctx = companyCtx(organizationId);
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      const { result, audit } = await fn(tx);
      await AuditService.recordIn(tx, ctx, { ...audit, actorUserId, actor });
      return result;
    });
  }

  // ---- companies (P14 §6 flow 5) ----

  async listCompanies(actorUserId: string, q: CompaniesQueryDto) {
    return platformRead(this.tenantPrisma, actorUserId, 'companies.list', async (tx) => {
      const orgs = await tx.organization.findMany({
        where: {
          ...(q.lifecycle ? { lifecycle: q.lifecycle } : {}),
          ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { slug: { contains: q.search, mode: 'insensitive' } }] } : {}),
        },
        select: { id: true, name: true, slug: true, lifecycle: true, status: true, trialEndsAt: true, createdAt: true },
        orderBy: { name: 'asc' },
        // ponytail: one page of 500; cursor paging when there are more companies than that.
        take: 500,
      });
      const ids = orgs.map((o) => o.id);
      const [products, people] = await Promise.all([
        tx.organizationProduct.findMany({ where: { organizationId: { in: ids } }, select: { organizationId: true, productCode: true } }),
        tx.employee.groupBy({ by: ['organizationId'], where: { organizationId: { in: ids } }, _count: { _all: true } }),
      ]);
      return orgs.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        lifecycle: o.lifecycle,
        signInAllowed: o.status === 'active',
        trialEndsAt: o.trialEndsAt,
        createdAt: o.createdAt,
        products: products.filter((p) => p.organizationId === o.id).map((p) => p.productCode),
        employees: people.find((p) => p.organizationId === o.id)?._count._all ?? 0,
      }));
    });
  }

  /** One company as staff may see it: account facts, never HR data (YX-CONSOLE-01). */
  async company(actorUserId: string, id: string) {
    return platformRead(this.tenantPrisma, actorUserId, 'companies.detail', async (tx) => {
      const o = await tx.organization.findUnique({
        where: { id },
        select: { id: true, name: true, slug: true, lifecycle: true, status: true, trialEndsAt: true, trialExtendedAt: true, lifecycleChangedAt: true, createdAt: true },
      });
      if (!o) throw new NotFoundException('Company not found');
      const [products, employees, admins, history] = await Promise.all([
        tx.organizationProduct.findMany({ where: { organizationId: id }, select: { productCode: true, addedAt: true }, orderBy: { addedAt: 'asc' } }),
        tx.employee.count({ where: { organizationId: id } }),
        tx.user.findMany({ where: { organizationId: id, role: 'org_admin' }, select: { name: true, email: true, status: true }, orderBy: { email: 'asc' }, take: 20 }),
        tx.auditLog.findMany({
          where: { organizationId: id, action: { startsWith: 'platform.company.' } },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { id: true, action: true, actorName: true, actorEmail: true, metadataJson: true, createdAt: true },
        }),
      ]);
      return {
        id: o.id,
        name: o.name,
        slug: o.slug,
        lifecycle: o.lifecycle,
        signInAllowed: o.status === 'active',
        trialEndsAt: o.trialEndsAt,
        trialExtended: Boolean(o.trialExtendedAt),
        lifecycleChangedAt: o.lifecycleChangedAt,
        createdAt: o.createdAt,
        products: products.map((p) => p.productCode),
        employees,
        admins,
        history: history.map((h) => ({ id: h.id, action: h.action, by: h.actorName || h.actorEmail || 'YukthiX', at: h.createdAt, details: h.metadataJson ? (JSON.parse(h.metadataJson) as Record<string, unknown>) : null })),
      };
    });
  }

  /** A new company in trial (P14 §6 flow 1, YX-TEN-08): default legal entity, its first System Admin (invited by email). */
  async createCompany(ctx: TenantContext, actorUserId: string, dto: CreateCompanyDto) {
    const known = await this.tenantPrisma.forTenant(PLATFORM, (tx) => tx.product.findMany({ where: { code: { in: dto.products } }, select: { code: true } }));
    const unknown = dto.products.filter((c) => !known.some((k) => k.code === c));
    if (unknown.length) throw new BadRequestException(`Unknown product: ${unknown.join(', ')}`);
    const actor = await staffActor(this.tenantPrisma, actorUserId);
    const org = await this.organizations.create(ctx, actorUserId, { name: dto.name, slug: dto.slug, adminEmail: dto.adminEmail, adminName: dto.adminName });
    const trialEndsAt = asDate(addDays(todayIst(), TRIAL_DAYS));
    await this.changeCompany(org.id, actorUserId, actor, async (tx) => {
      await tx.organization.update({ where: { id: org.id }, data: { lifecycle: 'trial', trialEndsAt } });
      await tx.organizationProduct.createMany({ data: dto.products.map((productCode) => ({ organizationId: org.id, productCode, addedBy: actorUserId })) });
      return { result: null, audit: { action: 'platform.company.created', entityType: 'organization', entityId: org.id, metadata: { products: dto.products, trialEndsAt: trialEndsAt.toISOString().slice(0, 10) } } };
    });
    return { id: org.id };
  }

  async changeLifecycle(actorUserId: string, id: string, dto: LifecycleDto) {
    const actor = await staffActor(this.tenantPrisma, actorUserId);
    const move = MOVES[dto.action];
    await this.changeCompany(id, actorUserId, actor, async (tx) => {
      const o = await tx.organization.findUnique({ where: { id }, select: { lifecycle: true } });
      if (!o) throw new NotFoundException('Company not found');
      if (!move.from.includes(o.lifecycle)) throw new ConflictException(`A company that is ${o.lifecycle} cannot be moved that way.`);
      const to = move.to ?? (await this.stateBeforeSuspension(tx, id));
      const { count } = await tx.organization.updateMany({ where: { id, lifecycle: o.lifecycle }, data: { lifecycle: to } });
      if (!count) throw new ConflictException('Someone changed this company at the same moment. Reload and try again.');
      // Nobody stays signed in to a suspended or closed company: every live session ends now, and so does any support
      // session (nobody there could end it any more).
      const stopping = to === 'suspended' || to === 'closed';
      const signedOut = stopping ? await revokeStaffSessions(tx, { organizationId: id }, `company_${to}`) : 0;
      if (stopping) {
        await tx.supportSession.updateMany({ where: { organizationId: id, status: 'approved' }, data: { status: 'ended', endedBy: actorUserId, endedByName: actor.label.slice(0, 200), endedAt: new Date() } });
        await tx.supportSession.updateMany({ where: { organizationId: id, status: 'requested' }, data: { status: 'cancelled' } });
      }
      return { result: null, audit: { action: 'platform.company.lifecycle', entityType: 'organization', entityId: id, metadata: { from: o.lifecycle, to, reason: dto.reason.trim(), signedOut } } };
    });
    return this.company(actorUserId, id);
  }

  private async stateBeforeSuspension(tx: Tx, id: string): Promise<string> {
    const last = await tx.auditLog.findFirst({ where: { organizationId: id, action: 'platform.company.lifecycle', metadataJson: { contains: '"to":"suspended"' } }, orderBy: { createdAt: 'desc' }, select: { metadataJson: true } });
    const from = last?.metadataJson ? (JSON.parse(last.metadataJson) as { from?: string }).from : undefined;
    return from === 'trial' ? 'trial' : 'active';
  }

  /** One extension of up to 14 days (P14 YX-TEN-08). */
  async extendTrial(actorUserId: string, id: string, dto: ExtendTrialDto) {
    const actor = await staffActor(this.tenantPrisma, actorUserId);
    await this.changeCompany(id, actorUserId, actor, async (tx) => {
      const o = await tx.organization.findUnique({ where: { id }, select: { lifecycle: true, trialEndsAt: true, trialExtendedAt: true } });
      if (!o) throw new NotFoundException('Company not found');
      if (o.lifecycle !== 'trial' || !o.trialEndsAt) throw new ConflictException('Only a company in trial can have its trial extended.');
      if (o.trialExtendedAt) throw new ConflictException('This trial was already extended once.');
      const base = Math.max(o.trialEndsAt.getTime(), asDate(todayIst()).getTime());
      const trialEndsAt = new Date(base + dto.days * 86_400_000);
      await tx.organization.update({ where: { id }, data: { trialEndsAt, trialExtendedAt: new Date() } });
      return { result: null, audit: { action: 'platform.company.trial_extended', entityType: 'organization', entityId: id, metadata: { days: dto.days, trialEndsAt: trialEndsAt.toISOString().slice(0, 10), reason: dto.reason.trim() } } };
    });
    return this.company(actorUserId, id);
  }

  // ---- plans and prices (P14 §4, YX-BILL-01/13/14) ----

  async plans() {
    const today = todayIst();
    const [products, prices] = await this.tenantPrisma.forTenant(PLATFORM, (tx) =>
      Promise.all([tx.product.findMany({ orderBy: { createdAt: 'asc' } }), tx.productPrice.findMany({ orderBy: [{ validFrom: 'desc' }] })]),
    );
    return products.map((p) => {
      const mine = prices.filter((r) => r.productCode === p.code);
      const currentIds = new Set(['INR', 'USD'].map((cur) => mine.find((r) => r.currency === cur && r.validFrom.toISOString().slice(0, 10) <= today)?.id).filter(Boolean));
      return {
        code: p.code,
        name: p.name,
        unit: p.unit,
        prices: mine.map((r) => {
          const from = r.validFrom.toISOString().slice(0, 10);
          return { id: r.id, currency: r.currency, unitPrice: money(r.unitPrice), minimumMonthly: money(r.minimumMonthly), validFrom: from, reason: r.reason, createdAt: r.createdAt, state: from > today ? 'scheduled' : currentIds.has(r.id) ? 'current' : 'past' };
        }),
      };
    });
  }

  /**
   * A new price from a date. With a price already in force, the new one starts at least 90 days out (YX-BILL-13:
   * 90 days' notice of a list-price change); a price in force is never edited, only followed by a new one.
   */
  async schedulePrice(actorUserId: string, code: string, dto: PriceDto) {
    const today = todayIst();
    if (dto.validFrom < today || Number.isNaN(asDate(dto.validFrom).getTime())) throw new BadRequestException('The new price cannot start in the past.');
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      if (!(await tx.product.findUnique({ where: { code } }))) throw new NotFoundException('Product not found');
      const inForce = await tx.productPrice.findFirst({ where: { productCode: code, currency: dto.currency, validFrom: { lte: asDate(today) } } });
      const earliest = addDays(today, PRICE_NOTICE_DAYS);
      if (inForce && dto.validFrom < earliest) throw new BadRequestException(`Customers get 90 days' notice of a price change: the new price can start on ${earliest} at the earliest.`);
      try {
        const row = await tx.productPrice.create({ data: { productCode: code, currency: dto.currency, unitPrice: dto.unitPrice, minimumMonthly: dto.minimumMonthly, validFrom: asDate(dto.validFrom), reason: dto.reason.trim(), createdBy: actorUserId } });
        await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.price.scheduled', entityType: 'product_price', entityId: row.id, metadata: { product: code, currency: dto.currency, unitPrice: dto.unitPrice, minimumMonthly: dto.minimumMonthly, validFrom: dto.validFrom, reason: dto.reason.trim() } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('There is already a price for that product and currency from that date.');
        throw e;
      }
    });
    return this.plans();
  }

  /** A scheduled price may be withdrawn before it starts; one in force never (the database refuses too). */
  async withdrawPrice(actorUserId: string, id: string) {
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const row = await tx.productPrice.findUnique({ where: { id } });
      if (!row) throw new NotFoundException('Price not found');
      if (row.validFrom.toISOString().slice(0, 10) <= todayIst()) throw new ConflictException('A price already in force cannot be withdrawn.');
      await tx.productPrice.delete({ where: { id } });
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.price.withdrawn', entityType: 'product_price', entityId: id, metadata: { product: row.productCode, currency: row.currency, unitPrice: money(row.unitPrice), validFrom: row.validFrom.toISOString().slice(0, 10) } });
    });
    return this.plans();
  }

  // ---- platform audit log (YX-CONSOLE-02, P12 YX-SECOPS-08: reviewed monthly) ----

  /** Staff actions: everything with no company, every platform.* action and every support-session event. */
  async audit(actorUserId: string, q: PlatformAuditQueryDto) {
    const PAGE = 50;
    return platformRead(this.tenantPrisma, actorUserId, 'audit.list', async (tx) => {
      const where: Prisma.AuditLogWhereInput = {
        AND: [
          { OR: [{ organizationId: null }, { action: { startsWith: 'platform.' } }, { entityType: 'support_session' }] },
          ...(q.organizationId ? [{ organizationId: q.organizationId }] : []),
          ...(q.reads === 'true' ? [] : [{ action: { not: 'platform.cross_tenant_read' } }]),
        ],
      };
      const cursor = q.before ? await tx.auditLog.findFirst({ where: { ...where, id: q.before }, select: { id: true, createdAt: true } }) : null;
      const rows = await tx.auditLog.findMany({
        where: cursor ? { AND: [where, { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }] } : where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: PAGE + 1,
        select: { id: true, organizationId: true, action: true, entityType: true, entityId: true, actorName: true, actorEmail: true, actorRole: true, metadataJson: true, createdAt: true },
      });
      const orgIds = [...new Set(rows.map((r) => r.organizationId).filter((x): x is string => Boolean(x)))];
      const names = await tx.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } });
      const data = rows.slice(0, PAGE).map((r) => ({
        id: r.id,
        at: r.createdAt,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        actor: r.actorName || r.actorEmail || 'System',
        actorIsStaff: r.actorRole === 'super_admin',
        company: r.organizationId ? (names.find((n) => n.id === r.organizationId)?.name ?? 'Unknown company') : null,
        companyId: r.organizationId,
        details: r.metadataJson ? (JSON.parse(r.metadataJson) as Record<string, unknown>) : null,
      }));
      return { data, nextCursor: rows.length > PAGE ? data[PAGE - 1].id : null };
    });
  }
}
