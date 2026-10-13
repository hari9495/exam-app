import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';

// Recruitment batch AT1 end to end against the real database (M10-BUILD-DESIGN §3, §16.1, §17): the YukthiX hiring keys
// stand in for the older ones (founder D2) only company-wide; the older keys keep working; jobs link to the P01 masters
// of their own company; offers, interview feedback and referrals are hidden from a YukthiX support session (D14).

describe('Recruitment batch AT1', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'atsRec' | 'legacyRec' | 'scoped' | 'viewer';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'patch' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `ats1-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `ATS1 Org ${k}`, slug: `ats1-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['atsRec', 'A', 'panel', ['ats.job.manage', 'ats.candidate.manage']],
      ['legacyRec', 'A', 'recruiter', null],
      ['scoped', 'A', 'panel', []],
      ['viewer', 'A', 'panel', []],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@ats1-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Foods Pvt Ltd', shortName: `KF${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...x, legalEntityId: ids.entity, name: 'Chennai', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...x, id: deptId, name: 'Finance', code: 'FIN', path: `/${deptId}/` } })).id;
      // The hiring product's default pipeline (an organisation gets one when it signs up).
      const pipe = await tx.pipeline.create({ data: { ...x, name: 'Standard', isDefault: true } });
      for (const [i, [name, category]] of [['Applied', 'active'], ['Interview', 'active'], ['Offer', 'offer'], ['Hired', 'hired'], ['Rejected', 'rejected']].entries()) await tx.pipelineStage.create({ data: { ...x, pipelineId: pipe.id, name, category, position: i } });
      const role = await tx.permissionProfile.create({ data: { ...x, name: `scoped-hiring-${run}`, permissionsJson: JSON.stringify(['ats.job.manage', 'ats.candidate.manage']) } });
      await tx.roleGrant.create({ data: { ...x, userId: users.scoped, permissionProfileId: role.id, scopeType: 'legal_entity', legalEntityId: ids.entity, validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'Entity recruiter', grantedBy: users.adminA } });
    });
    await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, async (tx) => {
      const deptId = randomUUID();
      ids.deptB = (await tx.department.create({ data: { organizationId: org.B.id, id: deptId, name: 'Finance', code: 'FIN', path: `/${deptId}/` } })).id;
    });
    for (const [who, k] of Object.entries({ adminA: 'A', adminB: 'B', atsRec: 'A', legacyRec: 'A', scoped: 'A', viewer: 'A' }) as [Who, 'A' | 'B'][]) {
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@ats1-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('ats.* keys stand in for the older keys company-wide; the older keys still work; a scoped grant does not (AT-1.01)', async () => {
    const job = (await api('atsRec', 'post', '/jobs').send({ title: `Accountant ${run}` }).expect(201)).body;
    ids.job = job.id;
    expect((await api('atsRec', 'get', '/jobs').expect(200)).body.map((j: { id: string }) => j.id)).toContain(job.id);
    await api('legacyRec', 'post', '/jobs').send({ title: `Clerk ${run}` }).expect(201);
    await api('scoped', 'post', '/jobs').send({ title: `Scoped ${run}` }).expect(403);
    await api('viewer', 'post', '/jobs').send({ title: `Viewer ${run}` }).expect(403);
    const held = (await api('atsRec', 'get', '/rbac/me/permissions?keys=ats.job.manage,pipeline:manage,candidate:data_rights').expect(200)).body as string[];
    expect(held.sort()).toEqual(['ats.job.manage', 'pipeline:manage']);
  });

  it('a job links to its own company’s masters only; the older free-text columns follow (AT-1.05)', async () => {
    const j = (await api('atsRec', 'post', '/jobs').send({ title: `Analyst ${run}`, departmentId: ids.dept, legalEntityId: ids.entity }).expect(201)).body;
    expect(j).toMatchObject({ departmentId: ids.dept, department: 'Finance', legalEntityId: ids.entity });
    expect((await api('atsRec', 'post', '/jobs').send({ title: `Bad ${run}`, departmentId: ids.deptB }).expect(400)).body.message).toMatch(/department of this company/);
    const p = (await api('atsRec', 'patch', `/jobs/${j.id}`).send({ locationId: ids.loc }).expect(200)).body;
    expect(p).toMatchObject({ locationId: ids.loc, location: 'Chennai' });
    await api('atsRec', 'patch', `/jobs/${j.id}`).send({ departmentId: null }).expect(200);
    expect((await inA((tx) => tx.job.findUniqueOrThrow({ where: { id: j.id } }))).departmentId).toBeNull();
  });

  it('offers, interview feedback and referrals are hidden from a YukthiX support session, even in SQL (AT-1.02, D14)', async () => {
    await inA(async (tx) => {
      const cand = await tx.candidate.create({ data: { organizationId: org.A.id, email: `asha-${run}@x.test`, name: 'Asha' } });
      const entry = await tx.pipelineEntry.create({ data: { organizationId: org.A.id, jobId: ids.job, candidateId: cand.id, enteredVia: 'manual' } });
      await tx.offer.create({ data: { organizationId: org.A.id, pipelineEntryId: entry.id, candidateId: cand.id, compensation: '9,00,000', startDate: new Date(), expiresAt: new Date(Date.now() + 7 * 86_400_000), letterSubject: 'Offer', letterBody: 'Body' } });
      await tx.pipelineFeedback.create({ data: { organizationId: org.A.id, entryId: entry.id, authorUserId: users.atsRec, note: 'Strong', rating: 4 } });
      await tx.referral.create({ data: { organizationId: org.A.id, referrerUserId: users.atsRec, jobId: ids.job, candidateId: cand.id, entryId: entry.id } });
    });
    const count = (support: boolean) =>
      inA(async (tx) => {
        if (support) await tx.$executeRaw`SELECT set_config('app.support_session', ${randomUUID()}, true)`;
        return [await tx.offer.count(), await tx.pipelineFeedback.count(), await tx.referral.count(), await tx.candidate.count()];
      });
    expect(await count(false)).toEqual([1, 1, 1, 1]);
    // Candidates stay readable (masked by the API in a support session, D14); hiring decisions do not.
    expect(await count(true)).toEqual([0, 0, 0, 1]);
  });

  it('companies stay apart', async () => {
    await api('adminB', 'get', `/jobs/${ids.job}`).expect(404);
    expect((await api('adminB', 'get', '/jobs').expect(200)).body).toEqual([]);
  });
});
