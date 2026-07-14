import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { AppModule as RuntimeAppModule } from '../../exam-runtime/src/app.module';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';

describe('Candidate-auth refresh/logout accept the httpOnly cookie with no request body', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let examId: string;
  let invitationToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [RuntimeAppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `candidate-cookie-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;
    const org = await prisma.organization.create({
      data: { name: 'Candidate Cookie Org', slug: `candidate-cookie-org-${randomUUID()}`, planId },
    });
    orgId = org.id;

    const passwordHash = await argon2.hash('TestPassw0rd!');
    const user = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({
        data: { organizationId: orgId, email: 'recruiter@cookie-test.test', passwordHash, role: 'recruiter' },
      }),
    );

    const exam = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.exam.create({
        data: { organizationId: orgId, title: 'Cookie Test Exam', durationMinutes: 30, status: 'published', createdBy: user.id },
      }),
    );
    examId = exam.id;

    const candidate = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.candidate.create({ data: { organizationId: orgId, name: 'Cookie Candidate', email: 'cookie-candidate@test.com' } }),
    );

    const invitation = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.invitation.create({
        data: {
          examId,
          candidateId: candidate.id,
          token: randomUUID(),
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      }),
    );
    invitationToken = invitation.token;
  });

  afterAll(async () => {
    await tenantPrisma
      .forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.candidateRefreshToken.deleteMany({ where: { invitation: { examId } } }))
      .catch(() => undefined);
    await tenantPrisma
      .forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.invitation.deleteMany({ where: { examId } }))
      .catch(() => undefined);
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.candidate.deleteMany({ where: { organizationId: orgId } })).catch(() => undefined);
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.exam.deleteMany({ where: { organizationId: orgId } })).catch(() => undefined);
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } })).catch(() => undefined);
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } })).catch(() => undefined);
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.organization.delete({ where: { id: orgId } })).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('redeems and sets an httpOnly candidate_refresh_token cookie, then refreshes/logs out using only that cookie', async () => {
    const redeemResponse = await request(app.getHttpServer())
      .post('/api/v1/candidate-auth/redeem')
      .send({ token: invitationToken })
      .expect(200);
    const cookies = redeemResponse.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('candidate_refresh_token=') && /httponly/i.test(c))).toBe(true);

    const refreshResponse = await request(app.getHttpServer())
      .post('/api/v1/candidate-auth/refresh')
      .set('Cookie', cookies)
      .send({})
      .expect(200);
    expect(refreshResponse.body.accessToken).toEqual(expect.any(String));
    const rotatedCookies = refreshResponse.headers['set-cookie'] as unknown as string[];
    expect(rotatedCookies.some((c) => c.startsWith('candidate_refresh_token='))).toBe(true);

    await request(app.getHttpServer()).post('/api/v1/candidate-auth/logout').set('Cookie', rotatedCookies).send({}).expect(200);
  });

  it('rejects refresh with 401 when neither body nor cookie provide a token', async () => {
    await request(app.getHttpServer()).post('/api/v1/candidate-auth/refresh').send({}).expect(401);
  });
});
