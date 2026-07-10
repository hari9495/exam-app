import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { TenantPrismaService } from '@exam-platform/shared';
import { AI_JOBS_QUEUE } from './ai-jobs.queue';

describe('JobsService', () => {
  let service: JobsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let queue: { add: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    queue = { add: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AI_JOBS_QUEUE, useValue: queue },
      ],
    }).compile();
    service = moduleRef.get(JobsService);
  });

  describe('enqueue', () => {
    it('creates an AiJob row and pushes a matching job onto the queue with no retries', async () => {
      const tx = {
        aiJob: { create: jest.fn().mockResolvedValue({ id: 'job-1', type: 'echo', inputJson: '{"a":1}' }) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.enqueue(context, 'echo', '{"a":1}', 'user-1');

      expect(result).toEqual({ id: 'job-1', type: 'echo', inputJson: '{"a":1}' });
      expect(tx.aiJob.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', type: 'echo', inputJson: '{"a":1}', createdBy: 'user-1' },
      });
      expect(queue.add).toHaveBeenCalledWith(
        'echo',
        { aiJobId: 'job-1', organizationId: 'org-1', type: 'echo' },
        { attempts: 1 },
      );
    });
  });

  describe('getById', () => {
    it("returns the job status when it exists in the caller's organization", async () => {
      const tx = {
        aiJob: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'job-1', type: 'echo', status: 'completed', outputJson: '{"echoed":1}', error: null,
            createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:05Z'),
          }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getById(context, 'job-1');

      expect(result).toEqual({
        id: 'job-1', type: 'echo', status: 'completed', outputJson: '{"echoed":1}', error: null,
        createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:05Z'),
      });
      expect(tx.aiJob.findFirst).toHaveBeenCalledWith({ where: { id: 'job-1', organizationId: 'org-1' } });
    });

    it('throws NotFoundException when the job does not exist in the org', async () => {
      const tx = { aiJob: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.getById(context, 'job-999')).rejects.toThrow(NotFoundException);
    });
  });
});
