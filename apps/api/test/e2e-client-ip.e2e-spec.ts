import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { databaseName, e2eClientIp } from '../src/testing/e2e-database';

// The e2e set-up (fixtures/e2e-database.ts): this database's suites sign in from a loopback address of their own, so
// another worktree's run on the same Redis never shares their per-IP sign-in lock, OTP counter or throttles.
describe('e2e sign-ins come from this database’s own address', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  const run = randomUUID().slice(0, 8);
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const own = e2eClientIp(databaseName(process.env.DATABASE_URL!));
  let orgId = '';
  let planId = '';
  const login = () => request(app.getHttpServer()).post('/api/v1/auth/staff/login').send({ organizationSlug: `ip-${run}`, email: `a-${run}@ip.test`, password: PASSWORD });

  beforeAll(async () => {
    app = await bootAdminApp();
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(LOGIN_PROTECTION_REDIS);
    planId = (await prisma.plan.create({ data: { name: `ip-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    orgId = (await prisma.organization.create({ data: { name: `IP ${run}`, slug: `ip-${run}`, planId } })).id;
    await app.get(TenantPrismaService).forTenant({ organizationId: orgId, isSuperAdmin: false }, async (tx) => tx.user.create({ data: { organizationId: orgId, email: `a-${run}@ip.test`, name: 'A', passwordHash: await argon2.hash(PASSWORD), role: 'org_admin' } }));
  }, 180_000);

  afterAll(async () => {
    await redis.del(`auth:lp:ip:block:${own}`);
    await prisma.organization.deleteMany({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('is never 127.0.0.1, and the IP lock that counts is this database’s own', async () => {
    expect(own).not.toBe('127.0.0.1');
    expect(process.env.E2E_CLIENT_IP).toBe(own);
    await login().expect(200);
    // A lock on our own address applies (the limit itself is unchanged).
    await redis.set(`auth:lp:ip:block:${own}`, '1', 'PX', 60_000);
    expect((await login().expect(429)).body.retryAfterSeconds).toBeGreaterThan(0);
    await redis.del(`auth:lp:ip:block:${own}`);
    await login().expect(200);
  });
});
