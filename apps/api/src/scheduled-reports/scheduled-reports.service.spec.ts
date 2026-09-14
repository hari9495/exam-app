import { ScheduledReportsService } from './scheduled-reports.service';
import { renderDigestCsv } from './report-digest';

const DAY = 24 * 60 * 60 * 1000;

const analytics: any = {
  funnel: { invited: 10, started: 8, submitted: 6, passed: 3, completionRate: 60, abandoned: 2 },
  scores: { count: 6, passRate: 50, avg: 70, median: 72, p25: 60, p75: 80, distribution: [] },
  integrity: { submittedAttempts: 6, highConcern: 1, review: 0, clear: 5, unanalyzed: 0, highConcernRate: 17, byType: [] },
  timing: { avgMinutes: 30, medianMinutes: 28, distribution: [] },
  examQuality: [{ examId: 'e1', examTitle: 'Backend, Senior', candidateCount: 6, avgScore: 70, passRate: 50, scoreSpread: 20, avgMinutes: 30, allottedMinutes: 60 }],
  questionDifficulty: [],
};
const summary: any = { stats: { totalCandidates: 0, invitationsSent: 0, attemptsInProgress: 0, pendingGradingCount: 2 }, attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 3 }, activity: [], upcomingExams: [] };

describe('ScheduledReportsService', () => {
  let tenantPrisma: { forTenant: jest.Mock };
  let dashboard: { getAnalytics: jest.Mock; getSummary: jest.Mock };
  let email: { send: jest.Mock };
  let tx: any;
  let service: ScheduledReportsService;
  const now = new Date('2026-09-14T12:00:00.000Z');

  function buildOrg(over: Partial<{ recipients: string[] | null; lastSentAt: Date | null }> = {}) {
    return {
      id: 'org-1',
      name: 'Acme',
      scheduledReportRecipientsJson: over.recipients === null ? null : JSON.stringify(over.recipients ?? ['u1']),
      scheduledReportLastSentAt: over.lastSentAt ?? null,
    };
  }

  beforeEach(() => {
    tx = {
      organization: { findMany: jest.fn().mockResolvedValue([buildOrg()]), update: jest.fn().mockResolvedValue({}) },
      user: { findMany: jest.fn().mockResolvedValue([{ email: 'u1@x.io' }]) },
    };
    tenantPrisma = { forTenant: jest.fn((_c: unknown, fn: (t: unknown) => unknown) => fn(tx)) };
    dashboard = { getAnalytics: jest.fn().mockResolvedValue(analytics), getSummary: jest.fn().mockResolvedValue(summary) };
    email = { send: jest.fn().mockResolvedValue({ success: true }) };
    service = new ScheduledReportsService(tenantPrisma as any, dashboard as any, email as any);
  });

  it('sends the digest (HTML + CSV attachment) to each recipient and stamps lastSentAt', async () => {
    await service.sweep(now);
    expect(email.send).toHaveBeenCalledTimes(1);
    const arg = email.send.mock.calls[0][0];
    expect(arg).toEqual(expect.objectContaining({ to: 'u1@x.io', organizationId: 'org-1', subject: expect.stringContaining('Acme') }));
    expect(arg.attachments[0].filename).toBe('weekly-report.csv');
    expect(Buffer.isBuffer(arg.attachments[0].content)).toBe(true);
    expect(tx.organization.update).toHaveBeenCalledWith({ where: { id: 'org-1' }, data: { scheduledReportLastSentAt: now } });
  });

  it('skips an org whose last send was under 7 days ago', async () => {
    tx.organization.findMany.mockResolvedValue([buildOrg({ lastSentAt: new Date(now.getTime() - 3 * DAY) })]);
    await service.sweep(now);
    expect(email.send).not.toHaveBeenCalled();
  });

  it('sends again once 7+ days have passed', async () => {
    tx.organization.findMany.mockResolvedValue([buildOrg({ lastSentAt: new Date(now.getTime() - 8 * DAY) })]);
    await service.sweep(now);
    expect(email.send).toHaveBeenCalledTimes(1);
  });

  it('skips an org with no recipients configured', async () => {
    tx.organization.findMany.mockResolvedValue([buildOrg({ recipients: null })]);
    await service.sweep(now);
    expect(email.send).not.toHaveBeenCalled();
  });

  it('does not stamp lastSentAt when no recipient resolves to a valid email (retries next run)', async () => {
    tx.user.findMany.mockResolvedValue([]);
    await service.sweep(now);
    expect(email.send).not.toHaveBeenCalled();
    expect(tx.organization.update).not.toHaveBeenCalled();
  });

  it('does not stamp lastSentAt when every send fails', async () => {
    email.send.mockRejectedValue(new Error('smtp down'));
    await service.sweep(now);
    expect(tx.organization.update).not.toHaveBeenCalled();
  });
});

describe('renderDigestCsv', () => {
  it('quotes fields containing commas', () => {
    const csv = renderDigestCsv(analytics);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Exam');
    expect(lines[1]).toContain('"Backend, Senior"'); // comma forces quoting
    expect(lines[1]).toContain('6'); // candidateCount
  });
});
