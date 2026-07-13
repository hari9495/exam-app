import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';

describe('Auth refresh/logout accept the httpOnly cookie with no request body', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `refresh-cookie-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;
    const org = await prisma.organization.create({
      data: { name: 'Refresh Cookie Org', slug: `refresh-cookie-org-${randomUUID()}`, planId },
    });
    orgId = org.id;

    const passwordHash = await argon2.hash('RecruiterPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({
        data: { organizationId: orgId, email: 'recruiter@refresh-cookie.test', passwordHash, role: 'recruiter' },
      }),
    );
  });

  afterAll(async () => {
    await tenantPrisma
      .forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }))
      .catch(() => undefined);
    await tenantPrisma
      .forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } }))
      .catch(() => undefined);
    await tenantPrisma
      .forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.organization.delete({ where: { id: orgId } }))
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('refreshes using only the httpOnly cookie, with no body, then logs out the same way', async () => {
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ organizationSlug: org.slug, email: 'recruiter@refresh-cookie.test', password: 'RecruiterPassw0rd!' })
      .expect(200);
    const cookies = loginResponse.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);

    const refreshResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies)
      .send({})
      .expect(200);
    expect(refreshResponse.body.accessToken).toEqual(expect.any(String));
    const rotatedCookies = refreshResponse.headers['set-cookie'] as unknown as string[];
    expect(rotatedCookies.some((c) => c.startsWith('refresh_token='))).toBe(true);

    await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Cookie', rotatedCookies).send({}).expect(200);
  });

  it('rejects refresh with 401 when neither body nor cookie provide a token', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({}).expect(401);
  });
});
