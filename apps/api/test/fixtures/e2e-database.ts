import { resolve } from 'path';
import { config } from 'dotenv';
import express from 'express';
import { e2eClientIp, e2eDatabase } from '../../src/testing/e2e-database';

// Runs before every e2e file (first in setupFiles): picks the database and refuses the test app's (answer 798).
// apps/api/.env is read here, without overriding what the shell set; Nest's ConfigModule then keeps these values.
config({ path: resolve(__dirname, '../../.env'), quiet: true });
const db = e2eDatabase(process.env);
process.env.DATABASE_URL = db.url;
if (db.migrationUrl) process.env.MIGRATION_DATABASE_URL = db.migrationUrl;

// Sign in from this database's own loopback address (e2eClientIp): every worktree shares one local Redis, so the
// per-IP sign-in lock, OTP counter and throttles of 127.0.0.1 were shared by every builder's run. Only loopback callers
// change; suites that test other addresses (X-Forwarded-For with trust proxy) keep theirs. The limits are unchanged.
const ownIp = e2eClientIp(db.name);
const ipOf = Object.getOwnPropertyDescriptor(express.request, 'ip')!;
Object.defineProperty(express.request, 'ip', {
  configurable: true,
  enumerable: true,
  get(this: express.Request) {
    const ip = ipOf.get!.call(this) as string | undefined;
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' ? ownIp : ip;
  },
});
process.env.E2E_CLIENT_IP = ownIp;
