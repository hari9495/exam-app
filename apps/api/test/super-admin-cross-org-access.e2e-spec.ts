import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp } from './dual-app';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';

describe('Super Admin Cross-Org Access', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let org1Id: string;
  let org2Id: string;
  let superAdminId: string;
  let superAccessToken: string;
  let actingAccessToken: string;
  const runId = randomUUID();

  beforeAll(async () => {
    app = await bootAdminApp();
    http = app.getHttpServer();
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-cross-org-plan-${runId}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org1 = await prisma.organization.create({ data: { name: 'CI Cross Org One', slug: `ci-cross-org-one-${runId}`, planId } });
    const org2 = await prisma.organization.create({ data: { name: 'CI Cross Org Two', slug: `ci-cross-org-two-${runId}`, planId } });
    org1Id = org1.id;
    org2Id = org2.id;

    // One user per org -- these two prove GET /users/directory's cross-org query has no
    // org filter, and the shared "ci-cross-org-<runId>" substring in both emails lets the
    // directory search narrow to exactly these two rows regardless of what else concurrent
    // suites have seeded into the shared dev database.
    const org1UserHash = await argon2.hash('Org1UserPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: org1Id, isSuperAdmin: false }, (tx) =>
      tx.user.create({
        data: { organizationId: org1Id, email: `admin@ci-cross-org-${runId}-one.test`, passwordHash: org1UserHash, role: 'org_admin' },
      }),
    );
    const org2UserHash = await argon2.hash('Org2UserPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: org2Id, isSuperAdmin: false }, (tx) =>
      tx.user.create({
        data: { organizationId: org2Id, email: `admin@ci-cross-org-${runId}-two.test`, passwordHash: org2UserHash, role: 'org_admin' },
      }),
    );

    // Seed a super_admin directly (bypassing HTTP), same bootstrap pattern as auth-flow.e2e-spec.ts.
    const superAdminHash = await argon2.hash('SuperPassw0rd!');
    const superAdmin = await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.user.create({
        data: { email: `super-cross-org-${runId}@platform.test`, passwordHash: superAdminHash, role: 'super_admin', organizationId: null },
      }),
    );
    superAdminId = superAdmin.id;

    superAccessToken = (
      await request(http).post('/api/v1/auth/staff/login').send({ email: superAdmin.email, password: 'SuperPassw0rd!' }).expect(200)
    ).body.accessToken;
  });

  afterAll(async () => {
    await tenantPrisma
      .forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.auditLog.deleteMany({ where: { organizationId: { in: [org1Id, org2Id] } } }))
      .catch(() => undefined);
    await tenantPrisma
      .forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
        tx.refreshToken.deleteMany({ where: { user: { organizationId: { in: [org1Id, org2Id] } } } }),
      )
      .catch(() => undefined);
    await tenantPrisma
      .forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { userId: superAdminId } }))
      .catch(() => undefined);
    await tenantPrisma
      .forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.user.deleteMany({ where: { organizationId: { in: [org1Id, org2Id] } } }))
      .catch(() => undefined);
    await tenantPrisma
      .forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.user.deleteMany({ where: { id: superAdminId } }))
      .catch(() => undefined);
    await prisma.organization.deleteMany({ where: { id: { in: [org1Id, org2Id] } } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('switch-into mints an acting token scoped to the target org, without touching the refresh cookie', async () => {
    const response = await request(http)
      .post(`/api/v1/auth/super-admin/switch-into/${org1Id}`)
      .set('Authorization', `Bearer ${superAccessToken}`)
      .expect(200);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.headers['set-cookie']).toBeUndefined();
    actingAccessToken = response.body.accessToken;

    const payload = JSON.parse(Buffer.from(actingAccessToken.split('.')[1], 'base64').toString('utf8'));
    expect(payload.organizationId).toBe(org1Id);
    expect(payload.actingSuperAdmin).toBe(true);
    expect(payload.role).toBe('super_admin');

    const auditEntry = await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.auditLog.findFirst({ where: { action: 'super_admin.org_switch_in', entityId: org1Id, actorUserId: superAdminId } }),
    );
    expect(auditEntry).not.toBeNull();
  });

  it('lets the acting token through a recruiter-only permission the base super_admin role does not hold', async () => {
    await request(http).get('/api/v1/questions').set('Authorization', `Bearer ${actingAccessToken}`).expect(200);
  });

  it('lets the acting token through an org-scoped endpoint, returning only that org\'s users', async () => {
    const response = await request(http).get('/api/v1/users').set('Authorization', `Bearer ${actingAccessToken}`).expect(200);

    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.data.every((u: { organizationId: string }) => u.organizationId === org1Id)).toBe(true);
  });

  it('switch-out succeeds and records its own audit entry, without touching the refresh cookie', async () => {
    const response = await request(http)
      .post('/api/v1/auth/super-admin/switch-out')
      .set('Authorization', `Bearer ${actingAccessToken}`)
      .expect(200);

    expect(response.body).toEqual({ success: true });
    expect(response.headers['set-cookie']).toBeUndefined();

    const auditEntry = await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.auditLog.findFirst({ where: { action: 'super_admin.org_switch_out', entityId: org1Id, actorUserId: superAdminId } }),
    );
    expect(auditEntry).not.toBeNull();
  });

  it('rejects the same elevated call with the original, non-acting super_admin token -- the elevation was genuinely temporary', async () => {
    const response = await request(http).get('/api/v1/questions').set('Authorization', `Bearer ${superAccessToken}`).expect(403);
    expect(response.body.message).toContain('question_bank:manage');
  });

  it('GET /users/directory returns users from at least two different organizations in one response, with no org filter', async () => {
    const response = await request(http)
      .get('/api/v1/users/directory')
      .query({ search: `ci-cross-org-${runId}`, pageSize: 50 })
      .set('Authorization', `Bearer ${superAccessToken}`)
      .expect(200);

    const orgIds = new Set(response.body.data.map((u: { organizationId: string | null }) => u.organizationId));
    expect(orgIds.has(org1Id)).toBe(true);
    expect(orgIds.has(org2Id)).toBe(true);
  });
});
