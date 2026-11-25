import { EmployeeImportDraftsService } from '../people/employee-import-drafts.service';
import { ErasureService } from '../people/erasure.service';
import { LearningAssignService } from '../learning/learning-assign.service';
import { SpeakupService } from '../speakup/speakup.service';
import { CompanyDocsService } from '../library/company-docs.service';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { REDIS_CONNECTION, logBullErrors, bullOpts } from './redis-connection';
import { SCHEDULED_SWEEPS_QUEUE, SCHEDULED_SWEEPS_QUEUE_NAME, SWEEP_SCHEDULE } from './scheduled-sweeps.queue';
import { RemindersService } from '../reminders/reminders.service';
import { ScheduledReportsService } from '../scheduled-reports/scheduled-reports.service';
import { NotificationDigestService } from '../notifications/notification-digest.service';
import { SystemEventsRetentionService } from '../system-events/system-events-retention.service';
import { RecycleBinRetentionService } from '../recycle-bin/recycle-bin-retention.service';
import { ApiUsageRetentionService } from '../api-usage/api-usage-retention.service';
import { FaceRetentionService } from '../face-enrolment/face-retention.service';
import { ProctoringRetentionService } from '../proctoring-retention/proctoring-retention.service';
import { DripService } from '../drip/drip.service';
import { EmployeeHistoryService } from '../employee-history/employee-history.service';
import { PeopleService } from '../people/people.service';
import { IdentityProvidersService } from '../auth/identity-providers.service';
import { CandidateRetentionService } from '../talent/retention.service';
import { HiringBoardService } from '../interviewing/hiring-board.service';
import { ScorecardsService } from '../interviewing/scorecards.service';
import { HiringSettingsService } from '../hiring/hiring-settings.service';
import { CampaignsService } from '../talent-crm/campaigns.service';
import { CrmConsentsService } from '../talent-crm/consents.service';
import { VisitorsService } from '../visitors/visitors.service';
import { WalkInsService } from '../visitors/walkins.service';
import { AccessRequestsService } from '../access/access-requests.service';
import { NotFoundRetentionService } from '../help/not-found-retention.service';
import { AssistantService } from '../help/assistant/assistant.service';
import { IncidentsService } from '../platform/incidents.service';
import { CsFollowupService } from '../platform/cs-followup.service';
import { StaffRolesService } from '../platform/staff-roles.service';
import { StaffNoticesService } from '../platform/staff-notices.service';
import { AnalyticsService } from '../platform/analytics.service';
import { CompanyDeletionService } from '../platform/company-deletion.service';
import { QuestionReviewNudgesService } from '../questions/bank/review-nudges.service';
import { SettingChangeNoticesService } from '../org-structure/setting-change-notices.service';

import { ProjectsService } from '../projects/projects.service';
import { ProjectCostService } from '../projects/project-cost.service';

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Owns the single Worker that runs every recurring housekeeping sweep, and registers the cron job
// schedulers on boot. Dispatches by job name to the owning service's sweep/prune method — the
// methods themselves are unchanged from the old setInterval versions; only what triggers them moved.
@Injectable()
export class ScheduledSweepsWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduledSweepsWorkerService.name);
  private readonly worker: Worker;
  private readonly handlers: Record<string, () => Promise<unknown>>;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    @Inject(SCHEDULED_SWEEPS_QUEUE) private readonly queue: Queue,
    reminders: RemindersService,
    scheduledReports: ScheduledReportsService,
    notificationDigest: NotificationDigestService,
    systemEventsRetention: SystemEventsRetentionService,
    recycleBinRetention: RecycleBinRetentionService,
    apiUsageRetention: ApiUsageRetentionService,
    faceRetention: FaceRetentionService,
    proctoringRetention: ProctoringRetentionService,
    drip: DripService,
    employeeHistory: EmployeeHistoryService,
    people: PeopleService,
    identityProviders: IdentityProvidersService,
    candidateRetention: CandidateRetentionService,
    hiringBoard: HiringBoardService,
    scorecards: ScorecardsService,
    importDrafts: EmployeeImportDraftsService,
    erasure: ErasureService,
    hiringSettings: HiringSettingsService,
    campaigns: CampaignsService,
    crmConsents: CrmConsentsService,
    visitors: VisitorsService,
    walkIns: WalkInsService,
    accessRequests: AccessRequestsService,
    notFoundRetention: NotFoundRetentionService,
    assistant: AssistantService,
    incidents: IncidentsService,
    csFollowup: CsFollowupService,
    staffRoles: StaffRolesService,
    projects: ProjectsService,
    settingNotices: SettingChangeNoticesService,
    projectCost: ProjectCostService,
    analytics: AnalyticsService,
    deletions: CompanyDeletionService,
    questionReviews: QuestionReviewNudgesService,
    staffNotices: StaffNoticesService,
    learning: LearningAssignService,
    speakup: SpeakupService,
    companyDocs: CompanyDocsService,
  ) {
    // Keys MUST match SWEEP_SCHEDULE ids.
    this.handlers = {
      // Projects P-1 (answer 1405).
      'project-burn': () => projects.burnSweep(),
      // Projects P-5 (1412, 1413, 1445).
      'project-cost': () => projectCost.costSweep(),
      'notification-digests': () => notificationDigest.sweep(),
      'staff-reminders': () => reminders.sweep(),
      'scheduled-reports': () => scheduledReports.sweep(),
      'system-events-retention': () => systemEventsRetention.prune(),
      'recycle-bin-retention': () => recycleBinRetention.prune(),
      'api-usage-retention': () => apiUsageRetention.prune(),
      'face-retention': () => faceRetention.prune(),
      // AS-5 part 3 (PRC-28): candidates' erasure requests first, then the retention sweep.
      'proctoring-retention': async () => (await proctoringRetention.eraseRequested()) + (await proctoringRetention.prune()) + (await proctoringRetention.pruneAccommodation()),
      'drip-steps': () => drip.sweep(),
      'employee-changes': () => employeeHistory.applyDue(),
      // M01 §3.4 / YX-LC-01: probation review reminders, escalation and opt-in auto-confirmation.
      probations: () => people.probationSweep(),
      'domain-verification-recheck': () => identityProviders.recheckDomains(),
      // M10 AT4 (YX-ATS-53): candidate renewal emails and anonymisation after the company's period.
      'candidate-retention': () => candidateRetention.sweep(),
      // M10 AT5: rejection messages after their undo window, and scorecard reminders at 24 h / 48 h.
      'hiring-due': () => Promise.all([hiringBoard.sendDue(), scorecards.remind()]),
      'import-drafts-retention': () => importDrafts.prune(),
      // People follow-up 12: Special data past privacy.retention.special_years, companies that turned it on.
      'privacy-erasure': () => erasure.sweep(),
      // Founder answer 385: tell the hiring settings holders once when the default recruiter goes stale.
      'hiring-default-recruiter': () => hiringSettings.staleRecruiterSweep(),
      // HIR-20: due campaign steps (inside the send window, under the daily cap), and sourced profiles past their limit.
      'crm-campaigns': () => campaigns.sweep(),
      'sourced-purge': () => crmConsents.purgeSourced(),
      // Visitors answers 611 and 608: close forgotten check-outs at the end of the window; delete visits after the period.
      'visitors-close': () => visitors.closeSweep(),
      'visitors-retention': () => visitors.retentionSweep(),
      'visitors-walkins': () => walkIns.sweep(),
      // Help answers 973 and 974.
      'access-request-reminders': () => accessRequests.remindSweep(),
      'not-found-retention': () => notFoundRetention.prune(),
      'assistant-retention': () => assistant.sweep(),
      // Console C-8 (answer 1124).
      'incident-breach-reminders': () => incidents.remindSweep(),
      'cs-health-snapshot': () => csFollowup.nightly(),
      'staff-invite-expiry': () => staffRoles.expireInvites(),
      // Answer 2222.
      'staff-notices-retention': () => staffNotices.retentionSweep(),
      'settings-change-lapse': () => settingNotices.lapseSweep(),
      // Console 1216.
      'analytics-summary': () => analytics.summariseNightly(),
      // Settings 1976: kept statutory records past their day.
      'retention-expiry': () => deletions.releaseSweep(),
      // Assessments answer 2129.
      'question-review-nudges': () => questionReviews.sweep(),
      'learning-daily': () => learning.sweep(),
      'speakup-ic-terms': () => speakup.remindIcTerms(),
      'company-docs-expiry': () => companyDocs.remindExpiring(),
    };
    this.worker = logBullErrors(new Worker(SCHEDULED_SWEEPS_QUEUE_NAME, (job) => this.dispatch(job), bullOpts(this.connection)), SCHEDULED_SWEEPS_QUEUE_NAME);
    this.worker.on('failed', (job, err) => this.logger.error(`Sweep "${job?.name}" failed: ${msg(err)}`));
  }

  onModuleInit(): void {
    // Fire-and-forget: upserting a scheduler talks to Redis, which may be unavailable at boot (the
    // whole app is designed to start without it). The command buffers and resolves once Redis is up;
    // never block startup on it.
    void this.registerSchedulers().catch((e) => this.logger.error(`Failed to register sweep schedulers: ${msg(e)}`));
  }

  private async registerSchedulers(): Promise<void> {
    for (const { id, cron } of SWEEP_SCHEDULE) {
      if (!this.handlers[id]) {
        this.logger.error(`Sweep schedule "${id}" has no handler — skipping registration`);
        continue;
      }
      // upsert = idempotent by id, so re-running on every deploy just refreshes the cron.
      await this.queue.upsertJobScheduler(id, { pattern: cron, tz: 'UTC' }, { name: id });
    }
    this.logger.log(`Registered ${SWEEP_SCHEDULE.length} scheduled sweeps`);
  }

  private async dispatch(job: Job): Promise<unknown> {
    const handler = this.handlers[job.name];
    if (!handler) {
      this.logger.warn(`No handler for sweep "${job.name}" — ignoring`);
      return undefined;
    }
    this.logger.log(`Running scheduled sweep "${job.name}"`);
    return handler();
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    await this.connection.quit();
  }
}
