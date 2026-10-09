import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { Tx } from '../org-structure/org-structure.service';
import { RuleError } from '../rules-engine/conditions';
import { DeskActor, audit, requireDesk, requireSetUp } from './desk-access';
import { LIFECYCLE_FIELDS, REQUIRABLE, REQUIRABLE_LABEL, parseLifecycle } from './lifecycle';

// SD-2.11 (US-G-062): the lifecycle designer's API. A desk admin (desk.lifecycle.manage + the admin seat) edits a draft
// per ticket type; publishing checks it (lifecycle.ts) and makes a new immutable version that new tickets of the type
// pin. Retiring stops new tickets from using it; tickets already on a version keep it.

type Lifecycle = Prisma.SdLifecycleGetPayload<object>;
const MAX_DRAFT = 60_000;

@Injectable()
export class LifecyclesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private tx<T>(a: DeskActor, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant(a.ctx, fn);
  }

  private async own(tx: Tx, a: DeskActor, id: string): Promise<Lifecycle> {
    const lc = await tx.sdLifecycle.findFirst({ where: { organizationId: a.ctx.organizationId, id } });
    if (!lc) throw new NotFoundException('No such lifecycle.');
    requireSetUp(a, lc.deskId, 'desk.lifecycle.manage');
    return lc;
  }

  private statusesOf(tx: Tx, org: string, deskId: string, typeId: string) {
    return tx.sdStatus.findMany({ where: { organizationId: org, deskId, active: true, OR: [{ ticketTypeId: null }, { ticketTypeId: typeId }] }, select: { id: true, label: true, systemState: true }, orderBy: { sortOrder: 'asc' } });
  }

  private draftOf(x: unknown): Prisma.InputJsonValue {
    const text = JSON.stringify(x ?? {});
    if (text.length > MAX_DRAFT) throw new BadRequestException('The lifecycle is too large.');
    return JSON.parse(text) as Prisma.InputJsonValue;
  }

  /** Everything the designer needs: the desk's types and statuses, the lifecycles, what a move can ask for. */
  async list(a: DeskActor, deskId: string) {
    requireSetUp(a, deskId, 'desk.lifecycle.manage');
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      await requireDesk(tx, a, deskId);
      const [types, statuses, rows] = await Promise.all([
        tx.sdTicketType.findMany({ where: { organizationId: org, deskId, active: true }, select: { id: true, name: true, kind: true }, orderBy: { sortOrder: 'asc' } }),
        tx.sdStatus.findMany({ where: { organizationId: org, deskId, active: true }, select: { id: true, label: true, systemState: true, ticketTypeId: true }, orderBy: { sortOrder: 'asc' } }),
        tx.sdLifecycle.findMany({ where: { organizationId: org, deskId }, orderBy: { createdAt: 'asc' } }),
      ]);
      const versions = await tx.sdLifecycleVersion.findMany({ where: { organizationId: org, deskId }, orderBy: { version: 'desc' }, select: { lifecycleId: true, version: true, publishedAt: true } });
      return {
        types,
        statuses,
        requirable: REQUIRABLE.map((k) => ({ key: k, label: REQUIRABLE_LABEL[k] })),
        conditionFields: LIFECYCLE_FIELDS,
        lifecycles: rows.map((l) => ({ id: l.id, ticketTypeId: l.ticketTypeId, name: l.name, state: l.state, currentVersion: l.currentVersion, draft: l.draft, version: l.version, versions: versions.filter((v) => v.lifecycleId === l.id).map((v) => ({ version: v.version, publishedAt: v.publishedAt })) })),
      };
    });
  }

  async create(a: DeskActor, dto: { deskId: string; ticketTypeId: string; name: string; draft?: unknown }) {
    requireSetUp(a, dto.deskId, 'desk.lifecycle.manage');
    try {
      return await this.tx(a, async (tx) => {
        const org = a.ctx.organizationId;
        await requireDesk(tx, a, dto.deskId);
        if (!(await tx.sdTicketType.findFirst({ where: { organizationId: org, deskId: dto.deskId, id: dto.ticketTypeId }, select: { id: true } }))) throw new BadRequestException('Choose a ticket type of this desk.');
        const lc = await tx.sdLifecycle.create({ data: { organizationId: org, deskId: dto.deskId, ticketTypeId: dto.ticketTypeId, name: dto.name, draft: this.draftOf(dto.draft), createdBy: a.userId } });
        await audit(tx, a, 'desk.lifecycle.created', 'sd_lifecycle', lc.id, { deskId: dto.deskId, ticketTypeId: dto.ticketTypeId, name: dto.name });
        return { id: lc.id, version: lc.version };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('That ticket type already has a lifecycle. Open it to change it.');
      throw e;
    }
  }

  async update(a: DeskActor, id: string, dto: { version: number; name?: string; draft?: unknown }) {
    return this.tx(a, async (tx) => {
      const lc = await this.own(tx, a, id);
      const res = await tx.sdLifecycle.updateMany({ where: { id: lc.id, version: dto.version }, data: { ...(dto.name ? { name: dto.name } : {}), ...(dto.draft !== undefined ? { draft: this.draftOf(dto.draft) } : {}), version: { increment: 1 }, updatedAt: new Date() } });
      if (!res.count) throw new ConflictException('Someone changed this lifecycle. Reload to see the latest.');
      await audit(tx, a, 'desk.lifecycle.saved', 'sd_lifecycle', lc.id, { name: dto.name });
      return { id: lc.id, version: dto.version + 1 };
    });
  }

  /** Checks the draft without publishing it: { ok } or the first problem in plain words. */
  async check(a: DeskActor, id: string) {
    return this.tx(a, async (tx) => {
      const lc = await this.own(tx, a, id);
      try {
        parseLifecycle(lc.draft, await this.statusesOf(tx, a.ctx.organizationId, lc.deskId, lc.ticketTypeId));
        return { ok: true, problem: null };
      } catch (e) {
        if (e instanceof RuleError) return { ok: false, problem: e.message };
        throw e;
      }
    });
  }

  async publish(a: DeskActor, id: string, version: number) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const lc = await this.own(tx, a, id);
      if (lc.version !== version) throw new ConflictException('Someone changed this lifecycle. Reload to see the latest.');
      let def;
      try {
        def = parseLifecycle(lc.draft, await this.statusesOf(tx, org, lc.deskId, lc.ticketTypeId));
      } catch (e) {
        if (e instanceof RuleError) throw new BadRequestException(e.message);
        throw e;
      }
      const next = (lc.currentVersion ?? 0) + 1;
      await tx.sdLifecycleVersion.create({ data: { organizationId: org, deskId: lc.deskId, lifecycleId: lc.id, version: next, startStatusId: def.startStatusId, statusIds: def.statusIds, transitions: def.transitions as unknown as Prisma.InputJsonValue, publishedBy: a.userId } });
      await tx.sdLifecycle.update({ where: { id: lc.id }, data: { currentVersion: next, state: 'active', draft: def as unknown as Prisma.InputJsonValue, version: { increment: 1 }, updatedAt: new Date() } });
      await audit(tx, a, 'desk.lifecycle.published', 'sd_lifecycle', lc.id, { version: next, statuses: def.statusIds.length, moves: def.transitions.length });
      return { id: lc.id, currentVersion: next, version: lc.version + 1 };
    });
  }

  async retire(a: DeskActor, id: string, version: number) {
    return this.tx(a, async (tx) => {
      const lc = await this.own(tx, a, id);
      const res = await tx.sdLifecycle.updateMany({ where: { id: lc.id, version, state: 'active' }, data: { state: 'retired', version: { increment: 1 }, updatedAt: new Date() } });
      if (!res.count) throw new ConflictException('This lifecycle is not in use, or someone changed it. Reload to see the latest.');
      await audit(tx, a, 'desk.lifecycle.retired', 'sd_lifecycle', lc.id, { version: lc.currentVersion });
      return { id: lc.id, version: version + 1 };
    });
  }
}
