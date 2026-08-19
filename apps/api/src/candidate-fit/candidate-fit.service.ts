import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { JobsService } from '../jobs/jobs.service';
import { computeCriteriaHash } from './candidate-fit.core';

const IN_FLIGHT = ['pending', 'processing'];

export interface FitAssessmentView {
  entryId: string;
  status: string;
  overallScore: number | null;
  summary: string | null;
  strengths: string[];
  concerns: string[];
  dimensionScores: { label: string; weight: number; score: number }[] | null;
  scoredAt: Date | null;
  error: string | null;
  stale: boolean;
}

@Injectable()
export class CandidateFitService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly jobs: JobsService,
  ) {}

  async scoreEntry(context: TenantContext, userId: string, entryId: string): Promise<{ status: string }> {
    const orgId = context.organizationId as string;
    const eligible = await this.tenantPrisma.forTenant(context, async (tx) => {
      const entry = await tx.pipelineEntry.findFirst({ where: { id: entryId, organizationId: orgId } });
      if (!entry) throw new NotFoundException(`Pipeline entry ${entryId} not found`);
      const profile = await tx.candidateProfile.findFirst({ where: { candidateId: entry.candidateId, organizationId: orgId } });
      const hasResume = profile?.parseStatus === 'done';
      await tx.candidateFitAssessment.upsert({
        where: { entryId },
        create: {
          organizationId: orgId,
          entryId,
          jobId: entry.jobId,
          candidateId: entry.candidateId,
          status: hasResume ? 'pending' : 'skipped_no_resume',
        },
        update: { status: hasResume ? 'pending' : 'skipped_no_resume', error: null },
      });
      return hasResume;
    });

    if (!eligible) return { status: 'skipped_no_resume' };
    await this.jobs.enqueue(context, 'candidate_fit', JSON.stringify({ entryId }), userId);
    return { status: 'pending' };
  }

  async scoreJob(context: TenantContext, userId: string, jobId: string): Promise<{ queued: number; skipped: number }> {
    const orgId = context.organizationId as string;

    // Phase 1: one short read-only tx -- gather what's needed to decide eligibility.
    // No upserts here: a 100+-candidate loop inside forTenant's single interactive
    // tx blows past Prisma's 5s default timeout against cross-region SQL (P2028),
    // rolling back the whole batch. See WRITE_CHUNK below for the write-side fix.
    const { entries, parsedByCandidate, inFlightByEntry } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const job = await tx.job.findFirst({ where: { id: jobId, organizationId: orgId } });
      if (!job) throw new NotFoundException(`Job ${jobId} not found`);

      const entries = await tx.pipelineEntry.findMany({ where: { jobId, organizationId: orgId, rejected: false } });
      const candidateIds = entries.map((e) => e.candidateId);
      const profiles = candidateIds.length
        ? await tx.candidateProfile.findMany({ where: { candidateId: { in: candidateIds }, organizationId: orgId } })
        : [];
      const parsedByCandidate = new Map(profiles.map((p) => [p.candidateId, p.parseStatus === 'done']));
      const existing = await tx.candidateFitAssessment.findMany({ where: { jobId, organizationId: orgId } });
      const inFlightByEntry = new Set(existing.filter((a) => IN_FLIGHT.includes(a.status)).map((a) => a.entryId));

      return {
        entries: entries.map((e) => ({ id: e.id, candidateId: e.candidateId })),
        parsedByCandidate,
        inFlightByEntry,
      };
    });

    // Phase 2: decide in plain JS, then persist in small chunks -- each chunk its
    // own short tx, so no single interactive tx holds all N upserts.
    const toEnqueue: string[] = [];
    const toSkip: { entryId: string; candidateId: string }[] = [];
    for (const e of entries) {
      if (inFlightByEntry.has(e.id)) continue; // leave in-flight assessments alone
      const hasResume = parsedByCandidate.get(e.candidateId) === true;
      if (hasResume) toEnqueue.push(e.id);
      else toSkip.push({ entryId: e.id, candidateId: e.candidateId });
    }

    // ponytail: 25 upserts/tx keeps a chunk well under Prisma's 5s interactive-tx
    // timeout even at ~50ms/round-trip cross-region; raise only if that RTT figure moves.
    const WRITE_CHUNK = 25;

    for (let i = 0; i < toEnqueue.length; i += WRITE_CHUNK) {
      const batch = toEnqueue.slice(i, i + WRITE_CHUNK);
      await this.tenantPrisma.forTenant(context, async (tx) => {
        for (const entryId of batch) {
          const e = entries.find((x) => x.id === entryId)!;
          await tx.candidateFitAssessment.upsert({
            where: { entryId },
            create: { organizationId: orgId, entryId, jobId, candidateId: e.candidateId, status: 'pending' },
            update: { status: 'pending', error: null },
          });
        }
      });
    }

    for (let i = 0; i < toSkip.length; i += WRITE_CHUNK) {
      const batch = toSkip.slice(i, i + WRITE_CHUNK);
      await this.tenantPrisma.forTenant(context, async (tx) => {
        for (const { entryId, candidateId } of batch) {
          await tx.candidateFitAssessment.upsert({
            where: { entryId },
            create: { organizationId: orgId, entryId, jobId, candidateId, status: 'skipped_no_resume' },
            update: { status: 'skipped_no_resume', error: null },
          });
        }
      });
    }

    // Phase 3: enqueue OUTSIDE any tx (queue.add is network I/O to Redis).
    for (const entryId of toEnqueue) {
      await this.jobs.enqueue(context, 'candidate_fit', JSON.stringify({ entryId }), userId);
    }
    return { queued: toEnqueue.length, skipped: toSkip.length };
  }

  async getForEntry(context: TenantContext, entryId: string): Promise<FitAssessmentView | null> {
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const a = await tx.candidateFitAssessment.findFirst({ where: { entryId, organizationId: orgId } });
      if (!a) return null;
      const job = await tx.job.findFirst({ where: { id: a.jobId, organizationId: orgId } });
      const currentHash = job
        ? computeCriteriaHash({ title: job.title, description: job.description, fitCriteria: job.fitCriteria, fitRubric: job.fitRubric })
        : null;
      return {
        entryId: a.entryId,
        status: a.status,
        overallScore: a.overallScore,
        summary: a.summary,
        strengths: parseJsonArray(a.strengths),
        concerns: parseJsonArray(a.concerns),
        dimensionScores: a.dimensionScores ? JSON.parse(a.dimensionScores) : null,
        scoredAt: a.scoredAt,
        error: a.error,
        stale: a.status === 'done' && currentHash !== null && a.criteriaHash !== currentHash,
      };
    });
  }
}

function parseJsonArray(s: string | null): string[] {
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
