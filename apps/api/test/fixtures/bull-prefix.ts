import { randomUUID } from 'crypto';

// Every e2e file boots its own app, and every app starts BullMQ workers. Without a prefix of their own, two test files
// running at once share the same queues in Redis and one app's worker takes the other's jobs (an AI job run with the
// wrong fake client, a sweep for another file's company). One prefix per test file keeps them apart.
process.env.BULLMQ_PREFIX = `e2e-${process.env.JEST_WORKER_ID ?? '0'}-${randomUUID().slice(0, 8)}`;
