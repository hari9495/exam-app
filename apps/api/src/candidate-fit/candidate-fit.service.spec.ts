import { NotFoundException } from '@nestjs/common';
import { CandidateFitService } from './candidate-fit.service';
import { computeCriteriaHash } from './candidate-fit.core';

describe('CandidateFitService', () => {
  const context = { organizationId: 'org-1', isSuperAdmin: false };
  let tx: any;
  let tenantPrisma: any;
  let jobsService: any;
  let service: CandidateFitService;

  const job = { id: 'job-1', title: 'Eng', description: 'd', fitCriteria: null, fitRubric: null, organizationId: 'org-1' };

  beforeEach(() => {
    tx = {
      job: { findFirst: jest.fn().mockResolvedValue(job) },
      pipelineEntry: {
        findFirst: jest.fn().mockResolvedValue({ id: 'entry-1', jobId: 'job-1', candidateId: 'cand-1', organizationId: 'org-1' }),
        findMany: jest.fn(),
      },
      candidateProfile: { findMany: jest.fn(), findFirst: jest.fn().mockResolvedValue({ parseStatus: 'done' }) },
      candidateFitAssessment: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    tenantPrisma = { forTenant: jest.fn(async (_c: any, fn: any) => fn(tx)) };
    jobsService = { enqueue: jest.fn().mockResolvedValue({ id: 'aijob-1' }) };
    service = new CandidateFitService(tenantPrisma, jobsService);
  });

  describe('scoreEntry', () => {
    it('upserts a pending assessment and enqueues a candidate_fit job', async () => {
      const out = await service.scoreEntry(context, 'user-1', 'entry-1');
      expect(tx.candidateFitAssessment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { entryId: 'entry-1' }, update: expect.objectContaining({ status: 'pending' }) }),
      );
      expect(jobsService.enqueue).toHaveBeenCalledWith(context, 'candidate_fit', JSON.stringify({ entryId: 'entry-1' }), 'user-1');
      expect(out).toEqual({ status: 'pending' });
    });

    it('records skipped_no_resume and does NOT enqueue when there is no parsed profile', async () => {
      tx.candidateProfile.findFirst.mockResolvedValue({ parseStatus: 'pending' });
      const out = await service.scoreEntry(context, 'user-1', 'entry-1');
      expect(jobsService.enqueue).not.toHaveBeenCalled();
      expect(out).toEqual({ status: 'skipped_no_resume' });
    });

    it('404s when the entry does not exist in this org', async () => {
      tx.pipelineEntry.findFirst.mockResolvedValue(null);
      await expect(service.scoreEntry(context, 'user-1', 'nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('scoreJob', () => {
    it('enqueues one job per eligible entry, skips no-résumé and in-flight, returns counts', async () => {
      tx.pipelineEntry.findMany.mockResolvedValue([
        { id: 'e1', candidateId: 'c1', jobId: 'job-1' },
        { id: 'e2', candidateId: 'c2', jobId: 'job-1' }, // no résumé
        { id: 'e3', candidateId: 'c3', jobId: 'job-1' }, // in-flight
      ]);
      tx.candidateProfile.findMany.mockResolvedValue([
        { candidateId: 'c1', parseStatus: 'done' },
        { candidateId: 'c2', parseStatus: 'pending' },
        { candidateId: 'c3', parseStatus: 'done' },
      ]);
      tx.candidateFitAssessment.findMany.mockResolvedValue([{ entryId: 'e3', status: 'processing' }]);

      const out = await service.scoreJob(context, 'user-1', 'job-1');
      expect(jobsService.enqueue).toHaveBeenCalledTimes(1);
      expect(jobsService.enqueue).toHaveBeenCalledWith(context, 'candidate_fit', JSON.stringify({ entryId: 'e1' }), 'user-1');
      // e2 gets a skipped_no_resume row, e3 is left alone
      expect(out).toEqual({ queued: 1, skipped: 1 });
    });
  });

  describe('getForEntry', () => {
    it('returns null when no assessment exists', async () => {
      expect(await service.getForEntry(context, 'entry-1')).toBeNull();
    });
    it('flags stale=true when the job criteria hash has changed since scoring', async () => {
      tx.candidateFitAssessment.findFirst.mockResolvedValue({
        entryId: 'entry-1', jobId: 'job-1', status: 'done', overallScore: 80,
        summary: 's', strengths: '["a"]', concerns: '["b"]', dimensionScores: null,
        criteriaHash: 'OLD', scoredAt: new Date(), error: null,
      });
      const view = await service.getForEntry(context, 'entry-1');
      const currentHash = computeCriteriaHash({ title: job.title, description: job.description, fitCriteria: job.fitCriteria, fitRubric: job.fitRubric });
      expect(view!.stale).toBe('OLD' !== currentHash);
      expect(view!.strengths).toEqual(['a']);
      expect(view!.overallScore).toBe(80);
    });
  });
});
