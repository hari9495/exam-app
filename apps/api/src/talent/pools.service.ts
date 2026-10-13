import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { Tx, audit, inCompany } from '../org-structure/org-structure.service';

/** Candidates whose latest talent-pool consent is given and not withdrawn. */
export async function poolConsented(tx: Tx, organizationId: string, candidateIds: string[]): Promise<Set<string>> {
  if (!candidateIds.length) return new Set();
  const rows = await tx.candidateConsent.findMany({ where: { organizationId, candidateId: { in: candidateIds }, purpose: 'talent_pool' }, orderBy: { givenAt: 'desc' }, select: { candidateId: true, withdrawnAt: true } });
  const latest = new Map<string, boolean>();
  for (const r of rows) if (!latest.has(r.candidateId)) latest.set(r.candidateId, r.withdrawnAt === null);
  return new Set([...latest].filter(([, ok]) => ok).map(([id]) => id));
}

/** Withdraws a purpose and, for the talent pool, takes the candidate out of every pool at once (§13). */
export async function withdrawConsent(tx: Tx, organizationId: string, candidateId: string, purpose: 'application' | 'talent_pool'): Promise<number> {
  const { count } = await tx.candidateConsent.updateMany({ where: { organizationId, candidateId, purpose, withdrawnAt: null }, data: { withdrawnAt: new Date() } });
  if (purpose === 'talent_pool') await tx.talentPoolMember.deleteMany({ where: { organizationId, candidateId, pool: { kind: 'pool' } } });
  return count;
}

// Recruitment batch AT4 (M10-BUILD-DESIGN §7.3): talent pools (only candidates who agreed to be kept for other roles)
// and hotlists (a short list for a current need). Membership never extends retention.
@Injectable()
export class TalentPoolsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const pools = await tx.talentPool.findMany({ where: { organizationId: c.organizationId, archivedAt: null }, orderBy: [{ kind: 'asc' }, { name: 'asc' }], include: { _count: { select: { members: true } } } });
      return pools.map(({ _count, ...p }) => ({ ...p, members: _count.members }));
    });
  }

  create(ctx: TenantContext, dto: { name: string; kind: 'pool' | 'hotlist'; description?: string | null }) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const pool = await tx.talentPool.create({ data: { organizationId: c.organizationId, name: dto.name, kind: dto.kind, description: dto.description || null, ownerUserId: c.userId ?? null } });
      await audit(tx, c, 'ats.pool.created', 'talent_pool', pool.id, { kind: pool.kind });
      return pool;
    });
  }

  archive(ctx: TenantContext, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { count } = await tx.talentPool.updateMany({ where: { id, organizationId: c.organizationId, archivedAt: null }, data: { archivedAt: new Date() } });
      if (!count) throw new NotFoundException('List not found.');
      await audit(tx, c, 'ats.pool.archived', 'talent_pool', id);
      return { archived: true };
    });
  }

  members(ctx: TenantContext, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const pool = await tx.talentPool.findFirst({ where: { id, organizationId: c.organizationId } });
      if (!pool) throw new NotFoundException('List not found.');
      const rows = await tx.talentPoolMember.findMany({ where: { poolId: id, organizationId: c.organizationId }, orderBy: { addedAt: 'desc' } });
      const people = await tx.candidate.findMany({ where: { id: { in: rows.map((r) => r.candidateId) } }, select: { id: true, name: true, email: true, globalStage: true } });
      return { pool, members: rows.map((r) => ({ ...r, candidate: people.find((p) => p.id === r.candidateId) ?? null })) };
    });
  }

  /** Adds candidates; a talent pool takes only those with a current talent-pool consent (the rest are reported). */
  add(ctx: TenantContext, id: string, candidateIds: string[], note?: string | null) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const pool = await tx.talentPool.findFirst({ where: { id, organizationId: org, archivedAt: null } });
      if (!pool) throw new NotFoundException('List not found.');
      const live = await tx.candidate.findMany({ where: { organizationId: org, id: { in: candidateIds }, erasedAt: null, mergedIntoId: null }, select: { id: true } });
      if (live.length !== new Set(candidateIds).size) throw new BadRequestException('Some candidates were not found, or were erased or merged.');
      const allowed = pool.kind === 'pool' ? await poolConsented(tx, org, candidateIds) : new Set(candidateIds);
      const add = candidateIds.filter((x) => allowed.has(x));
      if (!add.length && candidateIds.length) throw new ConflictException('None of these candidates agreed to be kept for other roles, so they cannot join a talent pool.');
      const { count } = await tx.talentPoolMember.createMany({ data: add.map((candidateId) => ({ organizationId: org, poolId: id, candidateId, addedBy: c.userId ?? null, note: note || null })), skipDuplicates: true });
      await audit(tx, c, 'ats.pool.members_added', 'talent_pool', id, { added: count });
      return { added: count, refused: candidateIds.filter((x) => !allowed.has(x)) };
    });
  }

  remove(ctx: TenantContext, id: string, candidateId: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { count } = await tx.talentPoolMember.deleteMany({ where: { poolId: id, candidateId, organizationId: c.organizationId } });
      if (count) await audit(tx, c, 'ats.pool.member_removed', 'talent_pool', id);
      return { removed: count > 0 };
    });
  }
}
