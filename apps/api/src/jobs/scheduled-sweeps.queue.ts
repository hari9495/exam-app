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
  return new Queue(SCHEDULED_SWEEPS_QUEUE_NAME, { connection });
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
  { id: 'notification-digests', cron: '0 1 * * *' },
  { id: 'staff-reminders', cron: '30 1 * * *' },
  { id: 'scheduled-reports', cron: '0 2 * * *' },
  { id: 'system-events-retention', cron: '0 3 * * *' },
  { id: 'recycle-bin-retention', cron: '30 3 * * *' },
  { id: 'api-usage-retention', cron: '0 4 * * *' },
  { id: 'face-retention', cron: '30 4 * * *' },
  { id: 'proctoring-retention', cron: '0 5 * * *' },
];
