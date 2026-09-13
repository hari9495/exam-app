import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  TenantContext,
  TenantPrismaService,
  EmbeddingResolverService,
  EmbeddingNotConfiguredError,
  topKSimilar,
  topSimilarPairs,
} from '@exam-platform/shared';
import { QuotaService } from '../billing/quota.service';
import { JobsService } from '../jobs/jobs.service';

export interface CandidateMatch {
  candidateId: string;
  name: string;
  title: string | null;
  score: number;
}

export interface DuplicatePair {
  a: { candidateId: string; name: string; title: string | null };
  b: { candidateId: string; name: string; title: string | null };
  score: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
// ponytail: brute-force cosine over an org's embedded profiles loaded into memory. Fine at org scale
// (hundreds–few-thousand); move to a native vector index if a single tenant ever outgrows it.
const clampLimit = (n?: number) => Math.min(Math.max(n ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

// Near-duplicate defaults. Two résumés of the same person embed at ~0.95+; distinct people sit well
// below. The O(n^2) pair scan is bounded by DUP_MAX_SCAN so one huge tenant can't stall the request.
const DUP_DEFAULT_THRESHOLD = 0.92;
const DUP_MAX_PAIRS = 200;
const DUP_MAX_SCAN = 2000;
const clampThreshold = (n?: number) => Math.min(Math.max(n ?? DUP_DEFAULT_THRESHOLD, 0.5), 1);

type ProfileRow = { candidateId: string; embeddingJson: string | null; parsedTitle: string | null; candidate: { name: string } };
const toItem = (r: ProfileRow) => ({ item: { candidateId: r.candidateId, name: r.candidate.name, title: r.parsedTitle }, vector: JSON.parse(r.embeddingJson as string) as number[] });

@Injectable()
export class CandidateSearchService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly embeddingResolver: EmbeddingResolverService,
    private readonly quota: QuotaService,
    private readonly jobs: JobsService,
  ) {}

  // Natural-language search: embed the query, cosine top-K over the org's embedded candidates.
  async search(context: TenantContext, query: string, limit?: number): Promise<{ results: CandidateMatch[] }> {
    const q = (query ?? '').trim();
    if (!q) throw new BadRequestException('query is required');
    const orgId = context.organizationId as string;

    let provider;
    try {
      provider = await this.embeddingResolver.resolve(orgId);
    } catch (error) {
      if (error instanceof EmbeddingNotConfiguredError) throw new BadRequestException(error.message);
      throw error;
    }

    await this.quota.assertWithinLimit(context, 'ai_credits');
    const [qVec] = await provider.embed([q]);
    if (!qVec?.length) throw new BadRequestException('the embeddings provider returned no vector for the query');

    const rows = await this.loadEmbeddedProfiles(context);
    await this.tenantPrisma.forTenant(context, (tx) =>
      tx.aiCreditUsage.create({ data: { organizationId: orgId, source: 'candidate_search', credits: 1, sourceId: null } }),
    );

    return { results: this.rank(qVec, rows, limit) };
  }

  // Find candidates similar to an existing one — pure vector compare against the target's stored
  // embedding, so it needs no provider call or credit (inert only if the target isn't embedded yet).
  async findSimilar(context: TenantContext, candidateId: string, limit?: number): Promise<{ results: CandidateMatch[]; status: 'ok' | 'not_embedded' }> {
    const orgId = context.organizationId as string;
    const { target, rows } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const target = await tx.candidateProfile.findUnique({ where: { candidateId }, select: { embeddingJson: true } });
      if (target === null) throw new NotFoundException(`Candidate ${candidateId} has no profile`);
      const rows = target.embeddingJson
        ? await tx.candidateProfile.findMany({
            where: { organizationId: orgId, embeddingJson: { not: null }, candidateId: { not: candidateId } },
            select: { candidateId: true, embeddingJson: true, parsedTitle: true, candidate: { select: { name: true } } },
          })
        : [];
      return { target, rows };
    });

    if (!target.embeddingJson) return { results: [], status: 'not_embedded' };
    const qVec = JSON.parse(target.embeddingJson) as number[];
    return { results: this.rank(qVec, rows as ProfileRow[], limit), status: 'ok' };
  }

  // Enqueue an embed job for every candidate with a parsed résumé (the job skips ones already current
  // or without an embeddings provider). Returns how many were queued.
  async backfill(context: TenantContext, userId: string): Promise<{ queued: number }> {
    const orgId = context.organizationId as string;
    const ids = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.candidateProfile.findMany({ where: { organizationId: orgId, parseStatus: 'done' }, select: { candidateId: true } }),
    );
    for (const { candidateId } of ids) {
      await this.jobs.enqueue(context, 'candidate_embed', JSON.stringify({ candidateId }), userId);
    }
    return { queued: ids.length };
  }

  // Org-wide near-duplicate scan: every pair of embedded candidates at/above `threshold`, highest
  // first. Pure vector compare over stored embeddings — no provider call, no credit. Bounded scan.
  async findDuplicates(context: TenantContext, opts: { threshold?: number; limit?: number }): Promise<{ pairs: DuplicatePair[]; scanned: number; capped: boolean }> {
    const rows = await this.loadEmbeddedProfiles(context);
    const capped = rows.length > DUP_MAX_SCAN;
    const scanRows = capped ? rows.slice(0, DUP_MAX_SCAN) : rows;
    const threshold = clampThreshold(opts.threshold);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), DUP_MAX_PAIRS);

    const pairs = topSimilarPairs(scanRows.map(toItem), threshold, limit).map((p) => ({
      a: p.a,
      b: p.b,
      score: Math.round(p.score * 1000) / 1000,
    }));
    return { pairs, scanned: scanRows.length, capped };
  }

  private loadEmbeddedProfiles(context: TenantContext) {
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.candidateProfile.findMany({
        where: { organizationId: orgId, embeddingJson: { not: null } },
        select: { candidateId: true, embeddingJson: true, parsedTitle: true, candidate: { select: { name: true } } },
      }),
    ) as Promise<ProfileRow[]>;
  }

  private rank(queryVec: number[], rows: ProfileRow[], limit?: number): CandidateMatch[] {
    const top = topKSimilar(queryVec, rows.map(toItem), clampLimit(limit));
    return top.map((s) => ({ ...s.item, score: Math.round(s.score * 1000) / 1000 }));
  }
}
