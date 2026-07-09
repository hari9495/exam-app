import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';

describe('Organization branding flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let orgSlug: string;
  let orgAdminAccessToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-branding-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    orgSlug = `ci-branding-org-${randomUUID()}`;
    const org = await prisma.organization.create({ data: { name: 'CI Branding Org', slug: orgSlug, planId } });
    orgId = org.id;

    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgId, email: 'admin@ci-branding.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
    );

    orgAdminAccessToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: orgSlug, email: 'admin@ci-branding.test', password: 'OrgAdminPassw0rd!' })
        .expect(200)
    ).body.accessToken;
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } }));
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('returns null branding for a freshly created org', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/organizations/branding')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(200);

    expect(response.body).toEqual({ logoUrl: null, primaryColor: null, accentColor: null });
  });

  it('updates brand colors and reflects them on the next read', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/organizations/branding')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .send({ primaryColor: '#1a73e8', accentColor: '#fbbc04' })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/api/v1/organizations/branding')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(200);

    expect(response.body).toEqual({ logoUrl: null, primaryColor: '#1a73e8', accentColor: '#fbbc04' });
  });

  it('rejects an invalid hex color', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/organizations/branding')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .send({ primaryColor: 'not-a-color' })
      .expect(400);
  });

  it('uploads a logo, serves it via /uploads, and rejects a non-image file', async () => {
    const pngBuffer = Buffer.from('89504e470d0a1a0a', 'hex');

    const uploadResponse = await request(app.getHttpServer())
      .post('/api/v1/organizations/branding/logo')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .attach('file', pngBuffer, { filename: 'logo.png', contentType: 'image/png' })
      .expect(201);

    expect(uploadResponse.body.logoUrl).toContain(`/uploads/logos/${orgId}.png`);

    const servedResponse = await request(app.getHttpServer()).get(`/uploads/logos/${orgId}.png`).expect(200);
    expect(Buffer.compare(servedResponse.body, pngBuffer)).toBe(0);
    expect(servedResponse.headers['x-content-type-options']).toBe('nosniff');
    expect(servedResponse.headers['content-security-policy']).toBe("default-src 'none'");

    await request(app.getHttpServer())
      .post('/api/v1/organizations/branding/logo')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .attach('file', Buffer.from('%PDF-1.4'), { filename: 'not-a-logo.pdf', contentType: 'application/pdf' })
      .expect(400);
  });

  it('exposes the same branding publicly by slug, and 404s for an unknown slug', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/organizations/by-slug/${orgSlug}/branding`).expect(200);

    expect(response.body).toEqual({ logoUrl: expect.stringContaining(`/uploads/logos/${orgId}.png`), primaryColor: '#1a73e8', accentColor: '#fbbc04' });

    await request(app.getHttpServer()).get('/api/v1/organizations/by-slug/no-such-org/branding').expect(404);
  });

  it('rejects an unauthenticated request to the staff-only branding routes', async () => {
    await request(app.getHttpServer()).get('/api/v1/organizations/branding').expect(401);
  });
});
