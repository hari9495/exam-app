import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';

// Answers 2330 to 2334: the Accessibility menu's choices are saved on the person's own account (PATCH /users/me), so
// they follow them across devices. Only the person reads or writes them; bad values are refused with a 400.
describe('Accessibility choices on the account', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  let planId: string;
  const orgIds: string[] = [];
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  type Who = 'asha' | 'ravi' | 'other';
  const api = (who: Who, method: 'get' | 'patch', path: string) => request(app.getHttpServer())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const CHOICES = { contrast: 'high', textSize: 150, textSpacing: true, lineHeight: true, bigCursor: true, reduceMotion: true, strongFocus: true, underlineLinks: true };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn(async () => ({ success: true })) })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    // The same pipe as main.ts (no transform), so the nested validation is checked exactly as in production.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    planId = (await prisma.plan.create({ data: { name: `a11y-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const orgs: Record<string, { id: string; slug: string }> = {};
    for (const key of ['one', 'two']) {
      const o = await prisma.organization.create({ data: { name: `A11y ${key}`, slug: `a11y-${key}-${runId}`, planId } });
      orgs[key] = { id: o.id, slug: o.slug };
      orgIds.push(o.id);
    }
    for (const [who, orgKey] of [['asha', 'one'], ['ravi', 'one'], ['other', 'two']] as [Who, string][]) {
      const org = orgs[orgKey];
      const email = `${who}-${runId}@a11y.test`;
      users[who] = (await tenantPrisma.forTenant({ organizationId: org.id, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: org.id, email, name: who, passwordHash, role: 'recruiter' } }))).id;
      token[who] = (await request(app.getHttpServer()).post('/api/v1/auth/staff/login').send({ organizationSlug: org.slug, email, password: PASSWORD }).expect(200)).body.accessToken;
    }
  }, 120_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.refreshToken.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.session.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
        await tx.user.deleteMany({ where: { id: { in: Object.values(users) } } });
        await tx.organization.deleteMany({ where: { id: { in: orgIds } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('a new account has no choices yet (the defaults apply)', async () => {
    expect((await api('asha', 'get', '/users/me').expect(200)).body.accessibility).toBeNull();
  });

  it('saves the choices on the account and reads them back', async () => {
    const saved = await api('asha', 'patch', '/users/me').send({ accessibility: CHOICES }).expect(200);
    expect(saved.body.accessibility).toEqual(CHOICES);
    expect((await api('asha', 'get', '/users/me').expect(200)).body.accessibility).toEqual(CHOICES);
  });

  it('a name-only save keeps the choices', async () => {
    await api('asha', 'patch', '/users/me').send({ name: 'Asha K' }).expect(200);
    expect((await api('asha', 'get', '/users/me').expect(200)).body.accessibility).toEqual(CHOICES);
  });

  it('another person, in the same company or another, never sees them', async () => {
    expect((await api('ravi', 'get', '/users/me').expect(200)).body.accessibility).toBeNull();
    expect((await api('other', 'get', '/users/me').expect(200)).body.accessibility).toBeNull();
    // The staff list never carries them either.
    const list = await api('ravi', 'get', '/users/teammates').expect(200);
    expect(JSON.stringify(list.body)).not.toContain('accessibility');
  });

  it.each([
    ['an unknown contrast', { ...CHOICES, contrast: 'invert' }],
    ['a text size off the steps', { ...CHOICES, textSize: 300 }],
    ['a text size as text', { ...CHOICES, textSize: '150' }],
    ['a switch that is not true or false', { ...CHOICES, bigCursor: 'yes' }],
    ['a missing field', (({ underlineLinks: _u, ...rest }) => rest)(CHOICES)],
    ['an extra field', { ...CHOICES, saturation: 50 }],
    ['not an object', 'high'],
  ])('refuses %s with a 400 and keeps what was saved', async (_name, accessibility) => {
    await api('asha', 'patch', '/users/me').send({ accessibility }).expect(400);
    expect((await api('asha', 'get', '/users/me').expect(200)).body.accessibility).toEqual(CHOICES);
  });

  it('needs a signed-in person', async () => {
    await request(app.getHttpServer()).patch('/api/v1/users/me').send({ accessibility: CHOICES }).expect(401);
  });
});
