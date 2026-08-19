import { CandidateFitController } from './candidate-fit.controller';

describe('CandidateFitController', () => {
  const tenant = { organizationId: 'org-1', isSuperAdmin: false };
  let service: any;
  let controller: CandidateFitController;

  beforeEach(() => {
    service = {
      scoreJob: jest.fn().mockResolvedValue({ queued: 3, skipped: 1 }),
      scoreEntry: jest.fn().mockResolvedValue({ status: 'pending' }),
      getForEntry: jest.fn().mockResolvedValue(null),
    };
    controller = new CandidateFitController(service);
  });

  it('scoreJob delegates with tenant + user + jobId', async () => {
    await controller.scoreJob(tenant as any, 'user-1', 'job-1');
    expect(service.scoreJob).toHaveBeenCalledWith(tenant, 'user-1', 'job-1');
  });
  it('scoreEntry delegates with tenant + user + entryId', async () => {
    await controller.scoreEntry(tenant as any, 'user-1', 'entry-1');
    expect(service.scoreEntry).toHaveBeenCalledWith(tenant, 'user-1', 'entry-1');
  });
  it('getForEntry delegates with tenant + entryId', async () => {
    await controller.getForEntry(tenant as any, 'entry-1');
    expect(service.getForEntry).toHaveBeenCalledWith(tenant, 'entry-1');
  });
});
