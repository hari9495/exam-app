import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { AuditService, PrismaService, TenantContext, TenantPrismaService, resolvePermissionGrants } from '@exam-platform/shared';
import { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';

// Who may do what on which desk (M14 §6). Two things must both hold, checked on the server for every route:
//   1. the permission key, held company-wide through the person's role, profile or role grant (P02 YX-SEC-01);
//   2. a seat on that desk today (sd_desk_members): agent / lead to work tickets, admin to set the desk up.
// Service Desk admins (desk.desk.create) set up every desk without a seat but see no tickets without one.
// Ticket visibility (§5.7): agents and leads of the desk see all its tickets; a desk admin sees only standard
// tickets on a standard desk; a collaborator sees only the tickets they were added to. Never by role alone.

export const DESK_KEYS = [
  'desk.ticket.view',
  'desk.ticket.work',
  'desk.ticket.note',
  'desk.ticket.assign',
  'desk.ticket.bulk',
  'desk.ticket.merge',
  'desk.ticket.export',
  'desk.settings.manage',
  'desk.member.manage',
  'desk.sla.manage',
  'desk.desk.create',
  'desk.task.work',
  'desk.audit.view',
  'desk.pii.unmask',
  'desk.report.view',
  'request.raise_on_behalf',
] as const;
export type DeskKey = (typeof DESK_KEYS)[number];
export type DeskRole = 'agent' | 'lead' | 'admin' | 'collaborator';
export type SetupKey = 'desk.settings.manage' | 'desk.member.manage' | 'desk.sla.manage';
/** How the signed-in person sees one ticket. observer = a desk admin's read-only view of a standard ticket. */
export type TicketAccess = 'agent' | 'observer' | 'collaborator';

export interface DeskActor {
  ctx: CompanyContext;
  userId: string;
  keys: ReadonlySet<string>;
  /** Seats held today, by desk. */
  roles: ReadonlyMap<string, DeskRole>;
}

interface RequestUser {
  userId?: string;
  role: string;
  organizationId?: string | null;
  permissionProfileId?: string | null;
  actingSuperAdmin?: boolean;
  impersonatorUserId?: string;
}

/** A seat active today (IST, the company calendar until P21). */
export const activeOn = (day: string): Prisma.SdDeskMemberWhereInput => ({
  validFrom: { lte: new Date(`${day}T00:00:00Z`) },
  OR: [{ validTo: null }, { validTo: { gte: new Date(`${day}T00:00:00Z`) } }],
});

export const companyOf = (ctx: TenantContext): CompanyContext => {
  if (!ctx.organizationId) throw new ForbiddenException('Sign in to a company to use the Service Desk.');
  return { ...ctx, organizationId: ctx.organizationId };
};

/** Things are changed by the signed-in person themselves, never by YukthiX staff or an impersonation (P02 YX-SEC-20). */
export function assertOwnSession(req: Request): void {
  const user = req.user as RequestUser | undefined;
  if (user?.impersonatorUserId || user?.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else');
}

export const SEAT_REQUIRED = { statusCode: 403, code: 'DESK_AGENT_SEAT_REQUIRED', message: 'Only an agent of this desk can do that.' };

@Injectable()
export class DeskAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  /** The person behind this request with their desk keys and today's seats. Staff acting in a company get neither. */
  async actor(req: Request, tenant: TenantContext): Promise<DeskActor> {
    const ctx = companyOf(tenant);
    const user = req.user as RequestUser;
    if (!user?.userId) throw new ForbiddenException('Not authenticated');
    if (user.impersonatorUserId || user.actingSuperAdmin) return { ctx, userId: user.userId, keys: new Set(), roles: new Map() };
    const keys = await resolvePermissionGrants(this.prisma, this.tenantPrisma, { role: user.role, organizationId: ctx.organizationId, permissionProfileId: user.permissionProfileId, userId: user.userId }, [...DESK_KEYS]);
    const seats = await this.tenantPrisma.forTenant(ctx, (tx) =>
      tx.sdDeskMember.findMany({ where: { organizationId: ctx.organizationId, userId: user.userId, ...activeOn(todayIst()) }, select: { deskId: true, role: true } }),
    );
    return { ctx, userId: user.userId, keys, roles: new Map(seats.map((s) => [s.deskId, s.role as DeskRole])) };
  }
}

export const has = (a: DeskActor, key: DeskKey) => a.keys.has(key);
export const isLead = (a: DeskActor, deskId: string) => a.roles.get(deskId) === 'lead';
export const isAgentOn = (a: DeskActor, deskId: string) => ['agent', 'lead'].includes(a.roles.get(deskId) ?? '');
export const canWork = (a: DeskActor, deskId: string) => has(a, 'desk.ticket.work') && isAgentOn(a, deskId);
export const canLead = (a: DeskActor, deskId: string, key: 'desk.ticket.assign' | 'desk.ticket.bulk' | 'desk.ticket.merge') => has(a, key) && a.roles.get(deskId) === 'lead';
export const canSetUp = (a: DeskActor, deskId: string, key: SetupKey) => has(a, key) && (has(a, 'desk.desk.create') || a.roles.get(deskId) === 'admin');

/** 404 rather than 403 when the person has no seat at all, so desk ids are not confirmed to outsiders. */
export function requireSetUp(a: DeskActor, deskId: string, key: SetupKey): void {
  if (canSetUp(a, deskId, key)) return;
  if (!has(a, 'desk.desk.create') && !a.roles.has(deskId)) throw new NotFoundException('No such desk.');
  throw new ForbiddenException(`You need the desk admin role on this desk (${key}).`);
}

export function requireWork(a: DeskActor, deskId: string): void {
  if (!canWork(a, deskId)) throw new ForbiddenException(SEAT_REQUIRED);
}

/** Desks whose tickets the person sees as an agent, and standard desks they observe as desk admin. */
export function deskReach(a: DeskActor, standardDesks: ReadonlySet<string>): { agent: string[]; observe: string[] } {
  if (!has(a, 'desk.ticket.view')) return { agent: [], observe: [] };
  const agent = [...a.roles].filter(([, r]) => r === 'agent' || r === 'lead').map(([d]) => d);
  const observe = [...a.roles].filter(([d, r]) => r === 'admin' && standardDesks.has(d)).map(([d]) => d);
  return { agent, observe };
}

/** §5.7: the list filter. Sensitive and private tickets only for agents of the desk and the record's collaborators. */
export async function visibleTickets(tx: Tx, a: DeskActor): Promise<Prisma.SdTicketWhereInput> {
  const org = a.ctx.organizationId;
  if (!has(a, 'desk.ticket.view')) return { id: { in: [] } };
  const adminDesks = [...a.roles].filter(([, r]) => r === 'admin').map(([d]) => d);
  const standard = adminDesks.length ? (await tx.sdDesk.findMany({ where: { organizationId: org, id: { in: adminDesks }, privacy: 'standard' }, select: { id: true } })).map((d) => d.id) : [];
  const reach = deskReach(a, new Set(standard));
  const collab = (await tx.sdTicketCollaborator.findMany({ where: { organizationId: org, userId: a.userId }, select: { ticketId: true } })).map((c) => c.ticketId);
  return {
    organizationId: org,
    OR: [
      { deskId: { in: reach.agent } },
      { deskId: { in: reach.observe }, sensitive: false, private: false },
      // A collaborator reaches a record only while they still hold a seat on its desk.
      { id: { in: collab }, deskId: { in: [...a.roles.keys()] } },
    ],
  };
}

/** How the person sees this ticket, or null (then the caller answers 404). */
export async function ticketAccess(tx: Tx, a: DeskActor, t: { id: string; deskId: string; sensitive: boolean; private: boolean }): Promise<TicketAccess | null> {
  if (!has(a, 'desk.ticket.view')) return null;
  if (isAgentOn(a, t.deskId)) return 'agent';
  const collab = a.roles.has(t.deskId) && (await tx.sdTicketCollaborator.findFirst({ where: { organizationId: a.ctx.organizationId, ticketId: t.id, userId: a.userId }, select: { userId: true } }));
  if (collab) return 'collaborator';
  if (a.roles.get(t.deskId) === 'admin' && !t.sensitive && !t.private) {
    const desk = await tx.sdDesk.findFirst({ where: { organizationId: a.ctx.organizationId, id: t.deskId }, select: { privacy: true } });
    if (desk?.privacy === 'standard') return 'observer';
  }
  return null;
}

/** One audit row in the caller's transaction (P08: no change without its audit row). */
export function audit(tx: Tx, a: { ctx: CompanyContext; userId: string }, action: string, entityType: string, entityId: string, metadata?: Record<string, unknown>) {
  return AuditService.recordIn(tx, a.ctx, { actorUserId: a.userId, action, entityType, entityId, metadata });
}

/** A business event through the transactional outbox (YX-NTF-01). Sensitive records carry ids only (YX-API-10). */
export function emit(tx: Tx, organizationId: string, eventType: string, payload: Record<string, unknown>) {
  return tx.eventOutbox.create({ data: { organizationId, eventType, payload: payload as Prisma.InputJsonValue } });
}

/**
 * §5.7: the desk's own background work (SLA timers, virus scan, auto-close, reminders, the meter) runs with
 * app.sd_system on inside its transaction, so the restrictive visibility policy lets it reach sensitive records. No
 * request path calls this; a person always reads through their own session.
 */
export function deskSystem<T>(tenantPrisma: TenantPrismaService, ctx: TenantContext, fn: (tx: Tx) => Promise<T>, options?: { timeout?: number }): Promise<T> {
  return tenantPrisma.forTenant(
    ctx,
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
      return fn(tx);
    },
    options,
  );
}
