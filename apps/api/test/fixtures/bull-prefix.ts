import { randomUUID } from 'crypto';
import { Queue } from 'bullmq';

// Every e2e file boots its own app, and every app starts BullMQ workers. Without a prefix of their own, two test files
// running at once share the same queues in Redis and one app's worker takes the other's jobs (an AI job run with the
// wrong fake client, a sweep for another file's company). One prefix per test file keeps them apart.
process.env.BULLMQ_PREFIX = `e2e-${process.env.JEST_WORKER_ID ?? '0'}-${randomUUID().slice(0, 8)}`;

// A new job scheduler fires at once. With a queue prefix of its own, every test app would start every hourly and daily
// sweep (the day engine, payroll audit checks, accruals...) across all companies the moment it boots, and those
// sweeps hold connections and rows while the file's own transactions run (time-leave-b2's month lock went past
// Prisma's 5 s and came back 503). On a long-running server they run once per interval; here the first run of an
// hourly-or-slower sweep waits one interval, so it never runs during a test file. Tests call sweeps directly.
type Upsert = Queue['upsertJobScheduler'];
const upsert: Upsert = Queue.prototype.upsertJobScheduler;
Queue.prototype.upsertJobScheduler = function (this: Queue, id: Parameters<Upsert>[0], repeat: Parameters<Upsert>[1], template?: Parameters<Upsert>[2]) {
  const every = repeat.every ?? 0;
  const later = every >= 3_600_000 && !repeat.startDate ? { ...repeat, startDate: Date.now() + every } : repeat;
  return upsert.call(this, id, later, template);
} as Upsert;
