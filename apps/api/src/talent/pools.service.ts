import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { boardPostings } from '../pipeline/pipeline.service';

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

  /** HIR-20: each list with its owner, its last change and how many members are kept with a current talent-pool consent. */
  list(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const pools = await tx.talentPool.findMany({ where: { organizationId: org, archivedAt: null }, orderBy: [{ kind: 'asc' }, { name: 'asc' }], include: { _count: { select: { members: true } } } });
      const members = await tx.talentPoolMember.findMany({ where: { organizationId: org, poolId: { in: pools.map((p) => p.id) } }, select: { poolId: true, candidateId: true, addedAt: true } });
      const consented = await poolConsented(tx, org, [...new Set(members.map((m) => m.candidateId))]);
      const owners = await tx.user.findMany({ where: { id: { in: pools.map((p) => p.ownerUserId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, email: true } });
      return pools.map(({ _count, ...p }) => {
        const mine = members.filter((m) => m.poolId === p.id);
        const owner = owners.find((u) => u.id === p.ownerUserId);
        const last = mine.reduce((a, m) => (m.addedAt > a ? m.addedAt : a), p.createdAt);
        return { ...p, members: _count.members, consented: mine.filter((m) => consented.has(m.candidateId)).length, ownerName: owner ? (owner.name ?? owner.email) : null, updatedAt: last };
      });
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
      // HIR-20: each member's talent-pool consent as it stands now (a hotlist needs none; a pool loses anyone who withdraws).
      const consented = await poolConsented(tx, c.organizationId, rows.map((r) => r.candidateId));
      return { pool, members: rows.map((r) => ({ ...r, consent: consented.has(r.candidateId) ? 'given' : 'none', candidate: people.find((p) => p.id === r.candidateId) ?? null })) };
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

  /**
   * HIR-20 Job-board postings: every job that is open or on hold, or still has a posting, with its postings on each
   * company board (the same postings the job workspace shows, from pipeline's boardPostings).
   */
  postings(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const jobs = await tx.job.findMany({
        where: { organizationId: org, deletedAt: null, OR: [{ status: { in: ['open', 'on_hold'] } }, { jobBoardPublications: { some: { postStatus: { not: 'removed' } } } }] },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      const out = [];
      for (const job of jobs) out.push({ jobId: job.id, title: job.title, status: job.status, jobBoardIds: (await tx.jobBoardPublication.findMany({ where: { jobId: job.id, postStatus: { not: 'removed' } }, select: { jobBoardId: true } })).map((p) => p.jobBoardId), postings: await boardPostings(tx, org, job) });
      return out;
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
