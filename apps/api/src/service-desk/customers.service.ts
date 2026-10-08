import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { isPublicMailDomain } from '../auth/identity-providers';
import { Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { DeskActor, activeOn, audit, has } from './desk-access';
import { AccountDto, AccountScopeDto, ContactDto, EndEntitlementDto, EntitlementDto, ProductDto, UpdateAccountDto, UpdateContactDto } from './dto-channels';

// SD-1.28 customers (US-G-035 … US-G-038, US-G-221): accounts with sub-accounts (company groups), contacts (one person
// may be in several accounts; a customer admin contact sees the whole account's tickets), dated support plans that
// set the ticket's plan tier (and so its SLA, via the 'plan' scope field), products, and agents limited to some
// accounts. Customers are company-wide; who may manage them: desk.customer.manage plus the Service Desk admin role or
// a seat on a Customer support desk. Agents on those desks may look them up.

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const MAX_DEPTH = 5;
export type Plan = Prisma.SdEntitlementGetPayload<object>;

/** The account a contact belongs to (their first active account), or null. */
export async function contactAccount(tx: Tx, org: string, personId: string): Promise<string | null> {
  const c = await tx.sdCustomerContact.findFirst({ where: { organizationId: org, personId, status: 'active', accountId: { not: null } }, orderBy: { createdAt: 'asc' }, select: { accountId: true } });
  return c?.accountId ?? null;
}

/** The plan in force today for an account, or its parent's when it has none of its own (company groups inherit). */
export async function planFor(tx: Tx, org: string, accountId: string, on = todayIst()): Promise<Plan | null> {
  let id: string | null = accountId;
  for (let i = 0; id && i < MAX_DEPTH; i++) {
    const p = await tx.sdEntitlement.findFirst({ where: { organizationId: org, accountId: id, validFrom: { lte: day(on) }, OR: [{ validTo: null }, { validTo: { gte: day(on) } }] } });
    if (p) return p;
    id = (await tx.sdCustomerAccount.findFirst({ where: { organizationId: org, id }, select: { parentId: true } }))?.parentId ?? null;
  }
  return null;
}

/**
 * US-G-036: the plan's tickets for this calendar month are used up. Counted over the account's tickets the caller can
 * see, so the portal works this out in a desk-system transaction first (a contact sees only their own tickets).
 */
export async function planUsedUp(tx: Tx, org: string, accountId: string, plan: Plan): Promise<boolean> {
  if (plan.ticketsAllowed === null) return false;
  const start = day(`${todayIst().slice(0, 7)}-01`);
  const used = await tx.sdTicket.count({ where: { organizationId: org, customerAccountId: accountId, createdAt: { gte: start } } });
  return used >= plan.ticketsAllowed;
}

/** The account whose email domains include this address's domain (US-G-221). Public mail domains never match. */
export async function accountByDomain(tx: Tx, org: string, email: string): Promise<string | null> {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  if (!domain || isPublicMailDomain(domain)) return null;
  return (await tx.sdCustomerAccount.findFirst({ where: { organizationId: org, status: 'active', emailDomains: { has: domain } }, select: { id: true } }))?.id ?? null;
}

/**
 * The person behind a customer email, made a contact when new (joined to the account of their email domain). An
 * existing person with that email is reused (P01: one live person per email). Never call this for a sender that was
 * not proven (§14.3).
 */
export async function ensureContact(tx: Tx, org: string, email: string, name: string, by: string | null): Promise<{ personId: string; created: boolean }> {
  const address = email.toLowerCase();
  const existing = await tx.person.findFirst({ where: { organizationId: org, status: 'active', primaryEmail: address }, select: { id: true } });
  if (existing) {
    const has = await tx.sdCustomerContact.findFirst({ where: { organizationId: org, personId: existing.id }, select: { id: true } });
    if (!has && !(await isInternal(tx, org, existing.id))) await addContactRow(tx, org, existing.id, await accountByDomain(tx, org, address), by);
    return { personId: existing.id, created: false };
  }
  const [given, ...rest] = (name.trim() || address.split('@')[0]).split(/\s+/);
  const person = await tx.person.create({ data: { organizationId: org, givenName: given.slice(0, 100), familyName: rest.join(' ').slice(0, 100) || null, primaryEmail: address, createdBy: by } });
  await addContactRow(tx, org, person.id, await accountByDomain(tx, org, address), by);
  return { personId: person.id, created: true };
}

async function addContactRow(tx: Tx, org: string, personId: string, accountId: string | null, by: string | null) {
  const c = await tx.sdCustomerContact.create({ data: { organizationId: org, accountId, personId, createdBy: by } });
  await tx.personRole.create({ data: { organizationId: org, personId, roleType: 'external_login', sourceTable: 'sd_customer_contacts', sourceId: c.id, startOn: day(todayIst()) } });
  return c;
}

/** An employee or a login of the company (not an outside contact). */
export async function isInternal(tx: Tx, org: string, personId: string): Promise<boolean> {
  return Boolean(await tx.personRole.findFirst({ where: { organizationId: org, personId, roleType: { in: ['employee', 'login'] }, endOn: null }, select: { id: true } }));
}

/** Accounts an agent is limited to, with all their sub-accounts; null = not limited (US-G-037). */
export async function accountScopeOf(tx: Tx, org: string, userId: string): Promise<string[] | null> {
  const rows = await tx.sdAgentAccountScope.findMany({ where: { organizationId: org, userId }, select: { accountId: true } });
  if (!rows.length) return null;
  const all = new Set(rows.map((r) => r.accountId));
  let frontier = [...all];
  for (let i = 0; frontier.length && i < MAX_DEPTH; i++) {
    const kids = await tx.sdCustomerAccount.findMany({ where: { organizationId: org, parentId: { in: frontier } }, select: { id: true } });
    frontier = kids.map((k) => k.id).filter((k) => !all.has(k));
    frontier.forEach((k) => all.add(k));
  }
  return [...all];
}

@Injectable()
export class CustomersService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private tx<T>(a: DeskActor, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant(a.ctx, fn);
  }

  private async customerDesks(tx: Tx, a: DeskActor) {
    return (await tx.sdDesk.findMany({ where: { organizationId: a.ctx.organizationId, kind: 'customer_support' }, select: { id: true } })).map((d) => d.id);
  }

  /** Look-up: the Service Desk admin, or anyone with a seat on a Customer support desk and a desk key. */
  private async requireSee(tx: Tx, a: DeskActor) {
    if (has(a, 'desk.desk.create') && has(a, 'desk.customer.manage')) return;
    const desks = await this.customerDesks(tx, a);
    if (!desks.some((d) => a.roles.has(d)) || !(has(a, 'desk.customer.manage') || has(a, 'desk.ticket.view'))) throw new NotFoundException('No such page.');
  }

  private async requireManage(tx: Tx, a: DeskActor) {
    if (!has(a, 'desk.customer.manage')) throw new ForbiddenException('You need the right to manage customers (desk.customer.manage).');
    if (has(a, 'desk.desk.create')) return;
    const desks = await this.customerDesks(tx, a);
    if (!desks.some((d) => a.roles.has(d))) throw new ForbiddenException('Manage customers from a Customer support desk you are on.');
  }

  /** Agents limited to some accounts see only those (US-G-037). */
  private async scopeFilter(tx: Tx, a: DeskActor): Promise<Prisma.SdCustomerAccountWhereInput> {
    const scope = await accountScopeOf(tx, a.ctx.organizationId, a.userId);
    return scope ? { id: { in: scope } } : {};
  }

  async accounts(a: DeskActor, search = '') {
    return this.tx(a, async (tx) => {
      await this.requireSee(tx, a);
      const org = a.ctx.organizationId;
      const rows = await tx.sdCustomerAccount.findMany({
        where: { organizationId: org, ...(await this.scopeFilter(tx, a)), ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { emailDomains: { has: search.toLowerCase() } }] } : {}) },
        orderBy: { name: 'asc' },
        take: 200,
      });
      const counts = await tx.sdCustomerContact.groupBy({ by: ['accountId'], where: { organizationId: org, accountId: { in: rows.map((r) => r.id) }, status: 'active' }, _count: { _all: true } });
      const n = new Map(counts.map((c) => [c.accountId, c._count._all]));
      const names = new Map(rows.map((r) => [r.id, r.name]));
      const out = [];
      for (const r of rows) {
        const plan = await planFor(tx, org, r.id);
        out.push({ id: r.id, name: r.name, emailDomains: r.emailDomains, parentId: r.parentId, parent: r.parentId ? (names.get(r.parentId) ?? null) : null, status: r.status, contacts: n.get(r.id) ?? 0, plan: plan ? { plan: plan.plan, tier: plan.tier, inherited: plan.accountId !== r.id } : null, version: r.version });
      }
      return out;
    });
  }

  async account(a: DeskActor, id: string) {
    return this.tx(a, async (tx) => {
      await this.requireSee(tx, a);
      const org = a.ctx.organizationId;
      const acc = await tx.sdCustomerAccount.findFirst({ where: { organizationId: org, id, ...(await this.scopeFilter(tx, a)) } });
      if (!acc) throw new NotFoundException('No such account.');
      const [contacts, plans, children, owner, parent] = await Promise.all([
        tx.sdCustomerContact.findMany({ where: { organizationId: org, accountId: id }, orderBy: { createdAt: 'asc' } }),
        tx.sdEntitlement.findMany({ where: { organizationId: org, accountId: id }, orderBy: { validFrom: 'desc' } }),
        tx.sdCustomerAccount.findMany({ where: { organizationId: org, parentId: id }, select: { id: true, name: true } }),
        acc.ownerUserId ? tx.user.findFirst({ where: { organizationId: org, id: acc.ownerUserId }, select: { id: true, name: true, email: true } }) : null,
        acc.parentId ? tx.sdCustomerAccount.findFirst({ where: { organizationId: org, id: acc.parentId }, select: { id: true, name: true } }) : null,
      ]);
      const people = new Map((await tx.person.findMany({ where: { organizationId: org, id: { in: contacts.map((c) => c.personId) } }, select: { id: true, givenName: true, familyName: true, primaryEmail: true } })).map((p) => [p.id, p]));
      const current = await planFor(tx, org, id);
      return {
        id: acc.id,
        name: acc.name,
        emailDomains: acc.emailDomains,
        status: acc.status,
        version: acc.version,
        owner: owner ? { id: owner.id, name: owner.name || owner.email } : null,
        parent,
        children,
        plan: current ? { id: current.id, plan: current.plan, tier: current.tier, inherited: current.accountId !== acc.id } : null,
        contacts: contacts.map((c) => {
          const p = people.get(c.personId);
          return { id: c.id, personId: c.personId, name: p ? [p.givenName, p.familyName].filter(Boolean).join(' ') : 'Someone', email: p?.primaryEmail ?? null, role: c.role, seesAccountTickets: c.seesAccountTickets, status: c.status };
        }),
        entitlements: plans.map((p) => ({ id: p.id, plan: p.plan, tier: p.tier, ticketsAllowed: p.ticketsAllowed, hoursAllowed: p.hoursAllowed, channels: p.channels, whenUsedUp: p.whenUsedUp, validFrom: p.validFrom.toISOString().slice(0, 10), validTo: p.validTo?.toISOString().slice(0, 10) ?? null })),
      };
    });
  }

  private async checkDomains(tx: Tx, org: string, domains: string[], selfId: string | null) {
    for (const d of domains) {
      if (isPublicMailDomain(d)) throw new BadRequestException(`${d} is a public mail service, so it cannot belong to one account.`);
      const other = await tx.sdCustomerAccount.findFirst({ where: { organizationId: org, emailDomains: { has: d }, ...(selfId ? { id: { not: selfId } } : {}) }, select: { name: true } });
      if (other) throw new ConflictException(`${d} already belongs to ${other.name}.`);
    }
  }

  private async checkParent(tx: Tx, org: string, id: string | null, parentId: string | null | undefined) {
    if (!parentId) return;
    let cur: string | null = parentId;
    for (let i = 0; cur; i++) {
      if (cur === id || i >= MAX_DEPTH) throw new BadRequestException('A company group can be at most five levels deep and never loops.');
      cur = (await tx.sdCustomerAccount.findFirst({ where: { organizationId: org, id: cur }, select: { parentId: true } }))?.parentId ?? null;
    }
    if (!(await tx.sdCustomerAccount.findFirst({ where: { organizationId: org, id: parentId }, select: { id: true } }))) throw new BadRequestException('Choose a parent account.');
  }

  private async checkOwner(tx: Tx, org: string, ownerUserId: string | null | undefined) {
    if (ownerUserId && !(await tx.user.findFirst({ where: { organizationId: org, id: ownerUserId, status: 'active' }, select: { id: true } }))) throw new BadRequestException('Choose a colleague as the account owner.');
  }

  async createAccount(a: DeskActor, dto: AccountDto) {
    try {
      return await this.tx(a, async (tx) => {
        await this.requireManage(tx, a);
        const org = a.ctx.organizationId;
        await this.checkDomains(tx, org, dto.emailDomains ?? [], null);
        await this.checkParent(tx, org, null, dto.parentId);
        await this.checkOwner(tx, org, dto.ownerUserId);
        const acc = await tx.sdCustomerAccount.create({ data: { organizationId: org, name: dto.name, emailDomains: dto.emailDomains ?? [], ownerUserId: dto.ownerUserId ?? null, parentId: dto.parentId ?? null, createdBy: a.userId } });
        await audit(tx, a, 'desk.customer_account.created', 'sd_customer_account', acc.id, { name: acc.name, emailDomains: acc.emailDomains, parentId: acc.parentId });
        return { id: acc.id };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('An account with that name exists.');
      throw e;
    }
  }

  async updateAccount(a: DeskActor, id: string, dto: UpdateAccountDto) {
    return this.tx(a, async (tx) => {
      await this.requireManage(tx, a);
      const org = a.ctx.organizationId;
      const acc = await tx.sdCustomerAccount.findFirst({ where: { organizationId: org, id, ...(await this.scopeFilter(tx, a)) } });
      if (!acc) throw new NotFoundException('No such account.');
      if (acc.version !== dto.version) throw new ConflictException({ statusCode: 409, code: 'ACCOUNT_CHANGED', message: 'Someone changed this account. Reload to see the latest.' });
      if (dto.emailDomains) await this.checkDomains(tx, org, dto.emailDomains, id);
      if (dto.parentId !== undefined) await this.checkParent(tx, org, id, dto.parentId);
      await this.checkOwner(tx, org, dto.ownerUserId);
      const { version: _v, ...changes } = dto;
      await tx.sdCustomerAccount.update({ where: { id }, data: { ...changes, version: { increment: 1 } } });
      await audit(tx, a, 'desk.customer_account.updated', 'sd_customer_account', id, { changes });
      return { id };
    });
  }

  async addContact(a: DeskActor, accountId: string, dto: ContactDto) {
    return this.tx(a, async (tx) => {
      await this.requireManage(tx, a);
      const org = a.ctx.organizationId;
      if (!(await tx.sdCustomerAccount.findFirst({ where: { organizationId: org, id: accountId, ...(await this.scopeFilter(tx, a)) }, select: { id: true } }))) throw new NotFoundException('No such account.');
      const existing = await tx.person.findFirst({ where: { organizationId: org, status: 'active', primaryEmail: dto.email }, select: { id: true } });
      // A colleague is never turned into an outside contact (their tickets and sign-in stay internal).
      if (existing && (await isInternal(tx, org, existing.id))) throw new BadRequestException('That email belongs to someone in your company.');
      const [given, ...rest] = dto.name.split(/\s+/);
      const personId = existing?.id ?? (await tx.person.create({ data: { organizationId: org, givenName: given.slice(0, 100), familyName: rest.join(' ').slice(0, 100) || null, primaryEmail: dto.email, createdBy: a.userId } })).id;
      if (await tx.sdCustomerContact.findFirst({ where: { organizationId: org, accountId, personId }, select: { id: true } })) throw new ConflictException('That person is already a contact of this account.');
      // A contact with no account yet (they wrote in before the account existed) moves into it.
      const loose = await tx.sdCustomerContact.findFirst({ where: { organizationId: org, accountId: null, personId } });
      const c = loose
        ? await tx.sdCustomerContact.update({ where: { id: loose.id }, data: { accountId, role: dto.role ?? 'member', seesAccountTickets: dto.seesAccountTickets ?? false } })
        : await addContactRow(tx, org, personId, accountId, a.userId).then((row) => tx.sdCustomerContact.update({ where: { id: row.id }, data: { role: dto.role ?? 'member', seesAccountTickets: dto.seesAccountTickets ?? false } }));
      await audit(tx, a, 'desk.customer_contact.added', 'sd_customer_contact', c.id, { accountId, personId, role: c.role, seesAccountTickets: c.seesAccountTickets });
      return { id: c.id, personId };
    });
  }

  async updateContact(a: DeskActor, contactId: string, dto: UpdateContactDto) {
    return this.tx(a, async (tx) => {
      await this.requireManage(tx, a);
      const org = a.ctx.organizationId;
      const c = await tx.sdCustomerContact.findFirst({ where: { organizationId: org, id: contactId } });
      if (!c || (c.accountId && !(await tx.sdCustomerAccount.findFirst({ where: { organizationId: org, id: c.accountId, ...(await this.scopeFilter(tx, a)) }, select: { id: true } })))) throw new NotFoundException('No such contact.');
      await tx.sdCustomerContact.update({ where: { id: c.id }, data: dto });
      // Turning a contact off ends their portal sign-ins at once (YX-SEC-21).
      if (dto.status === 'inactive') await tx.sdPortalSession.updateMany({ where: { organizationId: org, personId: c.personId, endedAt: null }, data: { endedAt: new Date() } });
      await audit(tx, a, 'desk.customer_contact.updated', 'sd_customer_contact', c.id, { changes: dto });
      return { id: c.id };
    });
  }

  async addEntitlement(a: DeskActor, accountId: string, dto: EntitlementDto) {
    if (dto.validTo && dto.validTo < dto.validFrom) throw new BadRequestException('The end date is before the start date.');
    try {
      return await this.tx(a, async (tx) => {
        await this.requireManage(tx, a);
        const org = a.ctx.organizationId;
        if (!(await tx.sdCustomerAccount.findFirst({ where: { organizationId: org, id: accountId, ...(await this.scopeFilter(tx, a)) }, select: { id: true } }))) throw new NotFoundException('No such account.');
        const e = await tx.sdEntitlement.create({
          data: { organizationId: org, accountId, plan: dto.plan, tier: dto.tier, ticketsAllowed: dto.ticketsAllowed ?? null, hoursAllowed: dto.hoursAllowed ?? null, channels: dto.channels ?? ['email', 'portal'], whenUsedUp: dto.whenUsedUp ?? 'flag', validFrom: day(dto.validFrom.slice(0, 10)), validTo: dto.validTo ? day(dto.validTo.slice(0, 10)) : null, createdBy: a.userId },
        });
        await audit(tx, a, 'desk.entitlement.added', 'sd_entitlement', e.id, { accountId, plan: e.plan, tier: e.tier, validFrom: dto.validFrom, validTo: dto.validTo ?? null });
        return { id: e.id };
      });
    } catch (e) {
      if (String((e as Error).message).includes('sd_entitlements_no_overlap')) throw new ConflictException('Another plan covers some of those dates. End it first.');
      throw e;
    }
  }

  async endEntitlement(a: DeskActor, id: string, dto: EndEntitlementDto) {
    return this.tx(a, async (tx) => {
      await this.requireManage(tx, a);
      const org = a.ctx.organizationId;
      const e = await tx.sdEntitlement.findFirst({ where: { organizationId: org, id } });
      if (!e) throw new NotFoundException('No such plan.');
      const to = dto.validTo.slice(0, 10);
      if (to < e.validFrom.toISOString().slice(0, 10)) throw new BadRequestException('The end date is before the plan starts.');
      await tx.sdEntitlement.update({ where: { id }, data: { validTo: day(to) } });
      await audit(tx, a, 'desk.entitlement.ended', 'sd_entitlement', id, { validTo: to });
      return { id };
    });
  }

  async products(a: DeskActor) {
    return this.tx(a, async (tx) => {
      await this.requireSee(tx, a);
      return tx.sdProduct.findMany({ where: { organizationId: a.ctx.organizationId }, orderBy: { name: 'asc' }, select: { id: true, name: true, deskId: true, active: true } });
    });
  }

  async saveProduct(a: DeskActor, id: string | null, dto: ProductDto) {
    try {
      return await this.tx(a, async (tx) => {
        await this.requireManage(tx, a);
        const org = a.ctx.organizationId;
        if (dto.deskId && !(await tx.sdDesk.findFirst({ where: { organizationId: org, id: dto.deskId }, select: { id: true } }))) throw new BadRequestException('Choose a desk.');
        const data = { name: dto.name, deskId: dto.deskId ?? null, ...(dto.active !== undefined ? { active: dto.active } : {}) };
        const p = id ? ((await tx.sdProduct.updateMany({ where: { organizationId: org, id }, data })).count ? { id } : null) : await tx.sdProduct.create({ data: { organizationId: org, ...data, createdBy: a.userId } });
        if (!p) throw new NotFoundException('No such product.');
        await audit(tx, a, id ? 'desk.product.updated' : 'desk.product.created', 'sd_product', p.id, data);
        return { id: p.id };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('A product with that name exists.');
      throw e;
    }
  }

  /** US-G-037: the accounts an agent is limited to (empty = all). The agent must hold a seat on a Customer support desk. */
  async agentScope(a: DeskActor, userId: string) {
    return this.tx(a, async (tx) => {
      await this.requireManage(tx, a);
      return (await tx.sdAgentAccountScope.findMany({ where: { organizationId: a.ctx.organizationId, userId }, select: { accountId: true } })).map((r) => r.accountId);
    });
  }

  async setAgentScope(a: DeskActor, userId: string, dto: AccountScopeDto) {
    return this.tx(a, async (tx) => {
      await this.requireManage(tx, a);
      const org = a.ctx.organizationId;
      const desks = await this.customerDesks(tx, a);
      if (!(await tx.sdDeskMember.findFirst({ where: { organizationId: org, userId, deskId: { in: desks }, ...activeOn(todayIst()) }, select: { id: true } }))) throw new BadRequestException('That person has no seat on a Customer support desk.');
      if (dto.accountIds.length && (await tx.sdCustomerAccount.count({ where: { organizationId: org, id: { in: dto.accountIds } } })) !== dto.accountIds.length) throw new BadRequestException('Choose accounts of this company.');
      await tx.sdAgentAccountScope.deleteMany({ where: { organizationId: org, userId } });
      if (dto.accountIds.length) await tx.sdAgentAccountScope.createMany({ data: dto.accountIds.map((accountId) => ({ organizationId: org, userId, accountId, createdBy: a.userId })) });
      await audit(tx, a, 'desk.agent_scope.set', 'user', userId, { accountIds: dto.accountIds });
      return { accountIds: dto.accountIds };
    });
  }
}
