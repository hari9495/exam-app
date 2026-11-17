import { logBullErrors, bullOpts } from './redis-connection';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

// One shared queue holding the recurring housekeeping "sweeps" that used to be per-service
// unref'd setInterval timers. Each sweep is a BullMQ job scheduler (a cron-driven repeatable job)
// so it fires exactly once per tick across the whole cluster instead of once per API instance —
// the setInterval version had no multi-instance guard and would send duplicate reminder/digest
// emails once the API scales past one process.
export const SCHEDULED_SWEEPS_QUEUE = 'SCHEDULED_SWEEPS_QUEUE';
export const SCHEDULED_SWEEPS_QUEUE_NAME = 'scheduled-sweeps';

export function createScheduledSweepsQueue(connection: Redis): Queue {
  return logBullErrors(new Queue(SCHEDULED_SWEEPS_QUEUE_NAME, bullOpts(connection)), SCHEDULED_SWEEPS_QUEUE_NAME);
}

export interface SweepDefinition {
  /** Stable id — the BullMQ job-scheduler id AND the job name the worker dispatches on. */
  id: string;
  /** Standard 5-field cron pattern, interpreted in UTC (see registrar). */
  cron: string;
}

// Fixed nightly UTC crons, staggered across the low-traffic early-morning window so no two heavy
// sweeps overlap. Cadence matches the old daily interval (the weekly scheduled-report digest still
// self-limits internally via scheduledReportLastSentAt, so running its sweep daily is correct).
// The `id`s here MUST match the handler keys in ScheduledSweepsWorkerService.
export const SWEEP_SCHEDULE: SweepDefinition[] = [
  // S-8 (5.4): hourly; each company's digest goes out at its own time (notify.digest.time).
  { id: 'notification-digests', cron: '0 * * * *' },
  { id: 'staff-reminders', cron: '30 1 * * *' },
  { id: 'scheduled-reports', cron: '0 2 * * *' },
  { id: 'system-events-retention', cron: '0 3 * * *' },
  { id: 'recycle-bin-retention', cron: '30 3 * * *' },
  { id: 'api-usage-retention', cron: '0 4 * * *' },
  { id: 'face-retention', cron: '30 4 * * *' },
  { id: 'proctoring-retention', cron: '0 5 * * *' },
  // Hourly (not nightly): drip steps have per-step day delays but should go out promptly once due,
  // and each run is bounded (SWEEP_BATCH). Sends due nurture-campaign steps.
  { id: 'drip-steps', cron: '0 * * * *' },
  // P06 YX-HIS-04/05: scheduled employee changes take effect at 00:00 in each employee's location time zone.
  // Every 15 minutes covers half- and quarter-hour zones (IST is UTC+5:30); the run is idempotent.
  { id: 'employee-changes', cron: '*/15 * * * *' },
  // M01 §3.4 / YX-LC-01: probation reminders and escalation on the local date; each step is marked once.
  { id: 'probations', cron: '7 * * * *' },
  // W-006: verified company email domains, re-checked against DNS (daily by default; DOMAIN_RECHECK_CRON).
  { id: 'domain-verification-recheck', cron: process.env.DOMAIN_RECHECK_CRON?.trim() || '30 5 * * *' },
  // M10 AT4: candidate retention (renewal emails, then anonymisation), daily at 03:15 IST.
  { id: 'candidate-retention', cron: '45 21 * * *' },
  // M10 AT5: due rejection messages and scorecard reminders, every 5 minutes.
  { id: 'hiring-due', cron: '*/5 * * * *' },
  // PPL-07: saved employee imports are deleted 30 days after they were saved.
  { id: 'import-drafts-retention', cron: '15 22 * * *' },
  // People follow-up 12: Special data past its period is deleted, only for companies that turned it on (04:15 IST).
  { id: 'privacy-erasure', cron: '45 22 * * *' },
  // Founder answer 385: a default recruiter who left or lost the recruiter key is reported once (hourly at :20).
  { id: 'hiring-default-recruiter', cron: '20 * * * *' },
  // HIR-20: campaign steps every 15 minutes (the send window and daily cap are checked per company); sourced profiles
  // without consent past the company limit are erased hourly.
  { id: 'crm-campaigns', cron: '*/15 * * * *' },
  { id: 'sourced-purge', cron: '40 * * * *' },
  // Visitors (answers 611, 608): forgotten check-outs every 15 minutes; visits past the retention period nightly (04:20 IST).
  { id: 'visitors-close', cron: '*/15 * * * *' },
  { id: 'visitors-retention', cron: '50 22 * * *' },
  // Visitors slice 2: walk-ins nobody decided by the end of their day, and acknowledgements past their use.
  { id: 'visitors-walkins', cron: '5,20,35,50 * * * *' },
  // Help answer 973: access requests waiting 2 working days remind the System Admins once (hourly at :25, so a request
  // is reminded early on its due IST day).
  { id: 'access-request-reminders', cron: '25 * * * *' },
  // Help answer 974: Not found references past the company's period are deleted (04:35 IST).
  { id: 'not-found-retention', cron: '5 23 * * *' },
  // Ask YukthiX: chats past help.assistant.keep_days.
  { id: 'assistant-retention', cron: '15 23 * * *' },
  // Console C-8 (answer 1124): breach reminders before the CERT-In and DPDP due times, every 5 minutes.
  { id: 'incident-breach-reminders', cron: '*/5 * * * *' },
  // Console 1165: each company's health snapshot for the India day, alert follow-up sync and the snapshot purge (01:30 IST).
  { id: 'cs-health-snapshot', cron: '0 20 * * *' },
  // Console 1243: invited staff who never signed in are deactivated after staff.invite.expire_days (02:15 IST).
  { id: 'staff-invite-expiry', cron: '45 20 * * *' },
  // Answer 2222: console notices read more than notices.read_keep_days ago are deleted (02:25 IST).
  { id: 'staff-notices-retention', cron: '55 20 * * *' },
  // Settings 1523: payroll setting changes nobody decided lapse (02:00 IST).
  { id: 'settings-change-lapse', cron: '30 20 * * *' },
  // Projects P-1 (answer 1405): budget burn alerts at the company's levels (80% and 100% by default), hourly at :35.
  { id: 'project-burn', cron: '35 * * * *' },
  // Projects P-5 (1412, 1413, 1445): project cost totals (payroll access) and cost burn alerts, nightly.
  { id: 'project-cost', cron: '20 2 * * *' },
  // Console 1216: the product-analytics summary per company, feature family and India day (00:40 IST).
  { id: 'analytics-summary', cron: '10 19 * * *' },
  // Settings 1976: a purged company's kept statutory records are removed once their day has passed (03:05 IST).
  { id: 'retention-expiry', cron: '35 21 * * *' },
  // Assessments answer 2129: one note a day to bank writers with questions waiting for their review (09:30 IST).
  { id: 'question-review-nudges', cron: '0 4 * * *' },
];
