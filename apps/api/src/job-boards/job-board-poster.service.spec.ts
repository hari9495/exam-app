import { JobBoardPosterService } from './job-board-poster.service';
import * as providers from './providers';

jest.mock('./providers', () => {
  const actual = jest.requireActual('./providers');
  return { ...actual, getJobBoardProvider: jest.fn() };
});
const mockGetProvider = providers.getJobBoardProvider as jest.Mock;

describe('JobBoardPosterService', () => {
  let service: JobBoardPosterService;
  let tx: { job: Record<string, jest.Mock>; jobBoardPublication: Record<string, jest.Mock>; organization: Record<string, jest.Mock> };
  let tenantPrisma: { forTenant: jest.Mock };
  let crypto: { encrypt: jest.Mock; decrypt: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: true } as any;

  const openJob = {
    id: 'job-1', title: 'Backend', description: 'd', location: 'Remote', employmentType: 'full_time',
    status: 'open', publicApplyEnabled: true, applyToken: 'tok-1',
  };

  function adapter() {
    return {
      id: 'http', label: 'Generic HTTP', configFields: [],
      validateConfig: jest.fn(),
      postJob: jest.fn().mockResolvedValue({ externalPostId: 'ext-1' }),
      closeJob: jest.fn().mockResolvedValue(undefined),
    };
  }

  beforeEach(() => {
    tx = {
      job: { findFirst: jest.fn().mockResolvedValue(openJob) },
      jobBoardPublication: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
      organization: { findUnique: jest.fn().mockResolvedValue({ name: 'Acme' }) },
    };
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    crypto = { encrypt: jest.fn(), decrypt: jest.fn().mockImplementation((s: string) => s.replace(/^enc\((.*)\)$/, '$1')) };
    mockGetProvider.mockReset();
    service = new JobBoardPosterService(tenantPrisma as any, crypto as any);
  });

  it('posts to a paid board that is not yet posted, storing the external id + posted status', async () => {
    const a = adapter();
    mockGetProvider.mockReturnValue(a);
    tx.jobBoardPublication.findMany.mockResolvedValue([
      { jobBoardId: 'b1', externalPostId: null, postStatus: null, jobBoard: { provider: 'http', configEncrypted: 'enc({"postUrl":"https://x"})' } },
    ]);

    await service.syncJobToPaidBoards(context, 'job-1');

    expect(a.postJob).toHaveBeenCalledTimes(1);
    // applyUrl was built from the token
    expect(a.postJob.mock.calls[0][1].applyUrl).toContain('/apply/tok-1');
    expect(tx.jobBoardPublication.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jobBoardId_jobId: { jobBoardId: 'b1', jobId: 'job-1' } },
        data: expect.objectContaining({ externalPostId: 'ext-1', postStatus: 'posted' }),
      }),
    );
  });

  it('does not re-post a board already marked posted', async () => {
    const a = adapter();
    mockGetProvider.mockReturnValue(a);
    tx.jobBoardPublication.findMany.mockResolvedValue([
      { jobBoardId: 'b1', externalPostId: 'ext-1', postStatus: 'posted', jobBoard: { provider: 'http', configEncrypted: 'enc({})' } },
    ]);
    await service.syncJobToPaidBoards(context, 'job-1');
    expect(a.postJob).not.toHaveBeenCalled();
  });

  it('retracts a posted board when the job is no longer public', async () => {
    const a = adapter();
    mockGetProvider.mockReturnValue(a);
    tx.job.findFirst.mockResolvedValue({ ...openJob, status: 'closed' });
    tx.jobBoardPublication.findMany.mockResolvedValue([
      { jobBoardId: 'b1', externalPostId: 'ext-1', postStatus: 'posted', jobBoard: { provider: 'http', configEncrypted: 'enc({})' } },
    ]);
    await service.syncJobToPaidBoards(context, 'job-1');
    expect(a.closeJob).toHaveBeenCalledWith(expect.anything(), 'ext-1');
    expect(tx.jobBoardPublication.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ postStatus: 'removed' }) }),
    );
  });

  it('is inert for an unconfigured paid board (no config blob)', async () => {
    const a = adapter();
    mockGetProvider.mockReturnValue(a);
    tx.jobBoardPublication.findMany.mockResolvedValue([
      { jobBoardId: 'b1', externalPostId: null, postStatus: null, jobBoard: { provider: 'http', configEncrypted: null } },
    ]);
    await service.syncJobToPaidBoards(context, 'job-1');
    expect(a.postJob).not.toHaveBeenCalled();
  });

  it('records failed status and never throws when the board API errors', async () => {
    const a = adapter();
    a.postJob.mockRejectedValue(new Error('LinkedIn API 500'));
    mockGetProvider.mockReturnValue(a);
    tx.jobBoardPublication.findMany.mockResolvedValue([
      { jobBoardId: 'b1', externalPostId: null, postStatus: null, jobBoard: { provider: 'http', configEncrypted: 'enc({})' } },
    ]);
    await expect(service.syncJobToPaidBoards(context, 'job-1')).resolves.toBeUndefined();
    expect(tx.jobBoardPublication.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ postStatus: 'failed' }) }),
    );
  });

  it('does nothing when the job has no paid-board memberships', async () => {
    tx.jobBoardPublication.findMany.mockResolvedValue([]);
    await service.syncJobToPaidBoards(context, 'job-1');
    expect(tx.jobBoardPublication.update).not.toHaveBeenCalled();
  });
});
