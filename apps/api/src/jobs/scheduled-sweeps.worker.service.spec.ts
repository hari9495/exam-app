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
      proctoringRetention: { prune: jest.fn().mockResolvedValue(0), eraseRequested: jest.fn().mockResolvedValue(0), pruneAccommodation: jest.fn().mockResolvedValue(0) },
      drip: { sweep: jest.fn().mockResolvedValue(undefined) },
      employeeHistory: { applyDue: jest.fn().mockResolvedValue(0) },
      people: { probationSweep: jest.fn().mockResolvedValue(0) },
      identityProviders: { recheckDomains: jest.fn().mockResolvedValue({ checked: 0, lapsed: 0 }) },
      candidateRetention: { sweep: jest.fn().mockResolvedValue(0) },
      hiringBoard: { sendDue: jest.fn().mockResolvedValue(0) },
      scorecards: { remind: jest.fn().mockResolvedValue(0) },
      importDrafts: { prune: jest.fn().mockResolvedValue(0) },
      erasure: { sweep: jest.fn().mockResolvedValue(0) },
      hiringSettings: { staleRecruiterSweep: jest.fn().mockResolvedValue(0) },
      campaigns: { sweep: jest.fn().mockResolvedValue({ sent: 0, stopped: 0 }) },
      crmConsents: { purgeSourced: jest.fn().mockResolvedValue({ erased: 0 }) },
      visitors: { closeSweep: jest.fn().mockResolvedValue(0), retentionSweep: jest.fn().mockResolvedValue(0) },
      walkIns: { sweep: jest.fn().mockResolvedValue({ closed: 0, acknowledgementsDeleted: 0 }) },
      accessRequests: { remindSweep: jest.fn().mockResolvedValue(0) },
      notFoundRetention: { prune: jest.fn().mockResolvedValue(0) },
      assistant: { sweep: jest.fn().mockResolvedValue({ chats: 0, counts: 0 }) },
      incidents: { remindSweep: jest.fn().mockResolvedValue(0) },
      csFollowup: { nightly: jest.fn().mockResolvedValue({ companies: 0, opened: 0, resolved: 0, purged: 0 }) },
      staffRoles: { expireInvites: jest.fn().mockResolvedValue({ days: 30, deactivated: [] }) },
      projects: { burnSweep: jest.fn().mockResolvedValue(0) },
      settingNotices: { lapseSweep: jest.fn().mockResolvedValue(0) },
      projectCost: { costSweep: jest.fn().mockResolvedValue({ companies: 0, restated: 0, alerts: 0 }) },
      analytics: { summariseNightly: jest.fn().mockResolvedValue({ rows: 0 }) },
      deletions: { releaseSweep: jest.fn().mockResolvedValue({ companies: 0, released: 0 }) },
      questionReviews: { sweep: jest.fn().mockResolvedValue(0) },
      staffNotices: { retentionSweep: jest.fn().mockResolvedValue(0) },
      learning: { sweep: jest.fn().mockResolvedValue({ enrolled: 0, reminded: 0 }) },
      speakup: { remindIcTerms: jest.fn().mockResolvedValue(0) },
      companyDocs: { remindExpiring: jest.fn().mockResolvedValue(0) },
      reportSchedules: { sendDue: jest.fn().mockResolvedValue(0) },
      assetAlerts: { warrantySweep: jest.fn().mockResolvedValue(0), contractSweep: jest.fn().mockResolvedValue(0), licenceSweep: jest.fn().mockResolvedValue(0), bookingSweep: jest.fn().mockResolvedValue(0) },
      internalApplications: { releaseHandOver: jest.fn().mockResolvedValue(0) },
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
      services.employeeHistory as never,
      services.people as never,
      services.identityProviders as never,
      services.candidateRetention as never,
      services.hiringBoard as never,
      services.scorecards as never,
      services.importDrafts as never,
      services.erasure as never,
      services.hiringSettings as never,
      services.campaigns as never,
      services.crmConsents as never,
      services.visitors as never,
      services.walkIns as never,
      services.accessRequests as never,
      services.notFoundRetention as never,
      services.assistant as never,
      services.incidents as never,
      services.csFollowup as never,
      services.staffRoles as never,
      services.projects as never,
      services.settingNotices as never,
      services.projectCost as never,
      services.analytics as never,
      services.deletions as never,
      services.questionReviews as never,
      services.staffNotices as never,
      services.learning as never,
      services.speakup as never,
      services.companyDocs as never,
      services.reportSchedules as never,
      services.assetAlerts as never,
      services.internalApplications as never,
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
      'employee-changes': services.employeeHistory.applyDue,
      probations: services.people.probationSweep,
      'domain-verification-recheck': services.identityProviders.recheckDomains,
      'candidate-retention': services.candidateRetention.sweep,
      'hiring-due': services.hiringBoard.sendDue,
      'import-drafts-retention': services.importDrafts.prune,
      'privacy-erasure': services.erasure.sweep,
      'hiring-default-recruiter': services.hiringSettings.staleRecruiterSweep,
      'crm-campaigns': services.campaigns.sweep,
      'sourced-purge': services.crmConsents.purgeSourced,
      'visitors-close': services.visitors.closeSweep,
      'visitors-retention': services.visitors.retentionSweep,
      'visitors-walkins': services.walkIns.sweep,
      'access-request-reminders': services.accessRequests.remindSweep,
      'not-found-retention': services.notFoundRetention.prune,
      'assistant-retention': services.assistant.sweep,
      'incident-breach-reminders': services.incidents.remindSweep,
      'cs-health-snapshot': services.csFollowup.nightly,
      'staff-invite-expiry': services.staffRoles.expireInvites,
      'staff-notices-retention': services.staffNotices.retentionSweep,
      'project-burn': services.projects.burnSweep,
      'settings-change-lapse': services.settingNotices.lapseSweep,
      'project-cost': services.projectCost.costSweep,
      'analytics-summary': services.analytics.summariseNightly,
      'retention-expiry': services.deletions.releaseSweep,
      'question-review-nudges': services.questionReviews.sweep,
      'learning-daily': services.learning.sweep,
      'speakup-ic-terms': services.speakup.remindIcTerms,
      'company-docs-expiry': services.companyDocs.remindExpiring,
      'report-schedules': services.reportSchedules.sendDue,
      'asset-warranty-alerts': services.assetAlerts.warrantySweep,
      'asset-contract-alerts': services.assetAlerts.contractSweep,
      'asset-licence-alerts': services.assetAlerts.licenceSweep,
      'asset-booking-alerts': services.assetAlerts.bookingSweep,
      'internal-release-handover': services.internalApplications.releaseHandOver,
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
