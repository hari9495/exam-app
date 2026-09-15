// Capture the Worker's processor fn so we can exercise dispatch without a real Redis.
const mockWorker: { processor: ((job: { name: string }) => Promise<unknown>) | null; on: jest.Mock; close: jest.Mock } = {
  processor: null,
  on: jest.fn(),
  close: jest.fn(),
};
jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation((_name: string, processor: (job: { name: string }) => Promise<unknown>) => {
    mockWorker.processor = processor;
    return mockWorker;
  }),
}));

import { ScheduledSweepsWorkerService } from './scheduled-sweeps.worker.service';
import { SWEEP_SCHEDULE } from './scheduled-sweeps.queue';

describe('ScheduledSweepsWorkerService', () => {
  const make = () => {
    const queue = { upsertJobScheduler: jest.fn().mockResolvedValue(undefined), close: jest.fn() };
    const connection = { quit: jest.fn() };
    const services = {
      reminders: { sweep: jest.fn().mockResolvedValue(undefined) },
      scheduledReports: { sweep: jest.fn().mockResolvedValue(undefined) },
      notificationDigest: { sweep: jest.fn().mockResolvedValue(undefined) },
      systemEventsRetention: { prune: jest.fn().mockResolvedValue(0) },
      recycleBinRetention: { prune: jest.fn().mockResolvedValue(0) },
      apiUsageRetention: { prune: jest.fn().mockResolvedValue(0) },
      faceRetention: { prune: jest.fn().mockResolvedValue(0) },
      proctoringRetention: { prune: jest.fn().mockResolvedValue(0) },
      drip: { sweep: jest.fn().mockResolvedValue(undefined) },
    };
    const service = new ScheduledSweepsWorkerService(
      connection as never,
      queue as never,
      services.reminders as never,
      services.scheduledReports as never,
      services.notificationDigest as never,
      services.systemEventsRetention as never,
      services.recycleBinRetention as never,
      services.apiUsageRetention as never,
      services.faceRetention as never,
      services.proctoringRetention as never,
      services.drip as never,
    );
    return { service, queue, connection, services };
  };

  beforeEach(() => {
    mockWorker.processor = null;
    jest.clearAllMocks();
  });

  it('registers one UTC cron scheduler per sweep, id-matched, with a handler for each', async () => {
    const { service, queue } = make();
    await (service as unknown as { registerSchedulers(): Promise<void> }).registerSchedulers();

    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(SWEEP_SCHEDULE.length);
    for (const { id, cron } of SWEEP_SCHEDULE) {
      expect(queue.upsertJobScheduler).toHaveBeenCalledWith(id, { pattern: cron, tz: 'UTC' }, { name: id });
    }
  });

  it('every scheduled id has a matching handler (no silent no-op sweeps)', async () => {
    const { service, services } = make();
    // Dispatch each scheduled id and assert the corresponding service method ran.
    const expectations: Record<string, jest.Mock> = {
      'notification-digests': services.notificationDigest.sweep,
      'staff-reminders': services.reminders.sweep,
      'scheduled-reports': services.scheduledReports.sweep,
      'system-events-retention': services.systemEventsRetention.prune,
      'recycle-bin-retention': services.recycleBinRetention.prune,
      'api-usage-retention': services.apiUsageRetention.prune,
      'face-retention': services.faceRetention.prune,
      'proctoring-retention': services.proctoringRetention.prune,
      'drip-steps': services.drip.sweep,
    };
    for (const { id } of SWEEP_SCHEDULE) {
      await mockWorker.processor!({ name: id });
      expect(expectations[id]).toHaveBeenCalledTimes(1);
    }
  });

  it('ignores an unknown job name without throwing or calling any sweep', async () => {
    const { services } = make();
    await expect(mockWorker.processor!({ name: 'does-not-exist' })).resolves.toBeUndefined();
    expect(services.reminders.sweep).not.toHaveBeenCalled();
  });

  it('closes the worker, queue and connection on destroy', async () => {
    const { service, queue, connection } = make();
    await service.onModuleDestroy();
    expect(mockWorker.close).toHaveBeenCalled();
    expect(queue.close).toHaveBeenCalled();
    expect(connection.quit).toHaveBeenCalled();
  });
});
