process.env.SD_SCANNER = 'dev-fake';
process.env.APPROVAL_CHANNELS = 'dev-fake';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Helpdesk ITSM (docs/yukthix/helpdesk-itsm-plan.md; answers 1931-1943). ITSM-1: change and problem are ticket kinds on
// IT desks only, never raised as tickets or by requesters; the desk's change settings and the company's change window,
// each with its default. Positive and negative; one company never sees another's.
describe('Helpdesk ITSM: changes and problems', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'agent' | 'lead' | 'deskAdmin' | 'owner' | 'board1' | 'board2' | 'divya';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const people = {} as Record<string, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'patch' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const typeOf = async (deskId: string, kind: string) => ((await api('adminA', 'get', `/desk/desks/${deskId}`).expect(200)).body.types as { id: string; kind: string }[]).find((t) => t.kind === kind)?.id;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn().mockResolvedValue({ success: true }) })
      .overrideProvider(BlobStorageService)
      .useValue(createFakeBlobStorage())
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: `itsm-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `ITSM Org ${k}`, slug: `itsm-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, key: string) =>
      (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${key}-${run}-${randomUUID().slice(0, 4)}`, permissionsJson: JSON.stringify(ROLE_TEMPLATES.find((t) => t.key === key)!.permissions) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['agent', 'A', 'panel', 'desk_agent'],
      ['lead', 'A', 'panel', 'desk_agent'],
      ['deskAdmin', 'A', 'panel', 'desk_admin'],
      ['owner', 'A', 'panel', null],
      ['board1', 'A', 'panel', null],
      ['board2', 'A', 'panel', null],
      ['divya', 'A', 'panel', null],
    ];
    for (const [who, k, role, tpl] of roster) {
      const o = org[k].id;
      const permissionProfileId = tpl ? await profile(o, tpl) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}-${run}@itsm.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}-${run}@itsm.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, async (tx) => {
      for (const who of ['divya', 'agent'] as const) {
        const p = await tx.person.create({ data: { organizationId: org.A.id, givenName: who, primaryEmail: `${who}-${run}@itsm.test` } });
        await tx.personRole.create({ data: { organizationId: org.A.id, personId: p.id, roleType: 'login', sourceTable: 'users', sourceId: users[who], startOn: new Date('2026-01-01') } });
        people[who] = p.id;
      }
    });
    ids.it = (await api('adminA', 'post', '/desk/desks').send({ name: 'IT help desk', key: 'IT', kind: 'it' }).expect(201)).body.id;
    ids.hr = (await api('adminA', 'post', '/desk/desks').send({ name: 'HR help desk', key: 'HR', kind: 'hr' }).expect(201)).body.id;
    await api('adminA', 'post', `/desk/desks/${ids.it}/members`).send({ userId: users.agent, role: 'agent' }).expect(201);
    await api('adminA', 'post', `/desk/desks/${ids.it}/members`).send({ userId: users.lead, role: 'lead' }).expect(201);
    await api('adminA', 'post', `/desk/desks/${ids.it}/members`).send({ userId: users.deskAdmin, role: 'admin' }).expect(201);
    ids.itB = (await api('adminB', 'post', '/desk/desks').send({ name: 'IT help desk', key: 'IT', kind: 'it' }).expect(201)).body.id;
  }, 240_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
        await tx.user.deleteMany({ where: { id: { in: all } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  // ------------------------------------------------------------------------------------------------ ITSM-1

  it('an IT desk has Change and Problem types; other desks do not and cannot add them', async () => {
    ids.changeType = (await typeOf(ids.it, 'change'))!;
    ids.problemType = (await typeOf(ids.it, 'problem'))!;
    expect(ids.changeType && ids.problemType).toBeTruthy();
    expect(await typeOf(ids.hr, 'change')).toBeUndefined();
    const bad = await api('adminA', 'post', `/desk/desks/${ids.hr}/ticket-types`).send({ name: 'Change', kind: 'change' }).expect(400);
    expect(bad.body.message).toMatch(/IT desks only/);
    await api('adminA', 'post', `/desk/desks/${ids.it}/ticket-types`).send({ name: 'Network change', kind: 'change' }).expect(201);
  });

  it('requesters never see or raise changes; agents cannot raise one as a ticket or turn a ticket into one', async () => {
    const mine = (await api('divya', 'get', '/desk/my/desks').expect(200)).body as { id: string; types: { id: string }[] }[];
    const it = mine.find((d) => d.id === ids.it)!;
    expect(it.types.map((t) => t.id)).not.toContain(ids.changeType);
    expect(it.types.map((t) => t.id)).not.toContain(ids.problemType);
    const raise = await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.it, typeId: ids.changeType, subject: 'Please upgrade the VPN', description: 'Tonight.' }).expect(400);
    expect(raise.body.message).toMatch(/Changes and problems are raised from/);
    expect((await api('agent', 'post', '/desk/tickets').send({ deskId: ids.it, typeId: ids.problemType, requesterPersonId: people.divya, subject: 'Repeat outage', bodyHtml: '<p>x</p>' }).expect(400)).body.message).toMatch(/raised from/);
    // A ticket raised without a type never lands on Change (its type list starts with the employee types).
    const t = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.it, subject: 'VPN keeps dropping', description: 'Since Monday.' }).expect(201)).body;
    ids.incident = t.id;
    const row = await tenantPrisma.forTenant(SUPER, (tx) => tx.sdTicket.findFirstOrThrow({ where: { id: t.id }, select: { kind: true } }));
    expect(['incident', 'request', 'question']).toContain(row.kind);
    const conv = await api('agent', 'post', `/desk/tickets/${t.id}/convert`).send({ typeId: ids.changeType, reason: 'It is a change' }).expect(400);
    expect(conv.body.message).toMatch(/keeps its type/);
    // "Fixes" is only from a change to a problem.
    const other = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.it, subject: 'Printer jam', description: 'Floor 2.' }).expect(201)).body;
    await api('agent', 'post', `/desk/tickets/${t.id}/links`).send({ ticketId: other.id, kind: 'fixes' }).expect(400);
  });

  it('desk settings: defaults, saved by the desk admin with a version, refused for others and for other companies', async () => {
    const s = (await api('agent', 'get', `/desk/desks/${ids.it}/itsm-settings`).expect(200)).body;
    expect([s.routeLow, s.routeMedium, s.routeHigh, s.boardRule, s.emergencyReviewDays, s.bannerHours, s.reviewDays, s.repeatCount, s.repeatDays, s.version]).toEqual(['lead', 'lead_owner', 'board', 'majority', 2, 24, 5, 3, 7, 0]);
    expect(s.riskQuestions).toHaveLength(5);
    expect([s.canEdit, s.window.weekdayFrom, s.window.weekdayTo, s.window.freezeDates]).toEqual([false, '20:00', '06:00', [7, 15, 20]]);
    await api('agent', 'put', `/desk/desks/${ids.it}/itsm-settings`).send({ version: 0, reviewDays: 3 }).expect(403);
    // The board route needs a board.
    const noBoard = await api('deskAdmin', 'put', `/desk/desks/${ids.it}/itsm-settings`).send({ version: 0, reviewDays: 3 }).expect(400);
    expect(noBoard.body.message).toMatch(/change board/);
    await api('deskAdmin', 'put', `/desk/desks/${ids.it}/itsm-settings`).send({ version: 0, boardUserIds: [users.adminB] }).expect(400);
    await api('deskAdmin', 'put', `/desk/desks/${ids.it}/itsm-settings`).send({ version: 0, riskQuestions: [{ id: 'x', label: 'Too short?', options: [{ value: '5', label: 'a' }, { value: '0', label: 'b' }] }] }).expect(400);
    const saved = (await api('deskAdmin', 'put', `/desk/desks/${ids.it}/itsm-settings`).send({ version: 0, boardUserIds: [users.board1, users.board2, users.lead], reviewDays: 4 }).expect(200)).body;
    expect([saved.version, saved.reviewDays, saved.board.length]).toEqual([1, 4, 3]);
    await api('deskAdmin', 'put', `/desk/desks/${ids.it}/itsm-settings`).send({ version: 0, reviewDays: 6 }).expect(409);
    await api('adminA', 'put', `/desk/desks/${ids.hr}/itsm-settings`).send({ version: 0, reviewDays: 6 }).expect(400);
    await api('adminB', 'get', `/desk/desks/${ids.it}/itsm-settings`).expect(404);
    await api('adminB', 'put', `/desk/desks/${ids.it}/itsm-settings`).send({ version: 1, reviewDays: 6 }).expect(404);
    expect((await api('adminB', 'get', `/desk/desks/${ids.itB}/itsm-settings`).expect(200)).body.version).toBe(0);
    expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'desk.itsm.settings_changed' } }))).toBe(1);
  });

  it('the company change window: only the Service Desk owner changes it; bad dates are refused; one company only', async () => {
    await api('deskAdmin', 'put', '/desk/itsm/window').send({ weekdayFrom: '21:00' }).expect(403);
    await api('adminA', 'put', '/desk/itsm/window').send({ freezeDates: '7, 40' }).expect(400);
    await api('adminA', 'put', '/desk/itsm/window').send({ weekdayFrom: '21:15' }).expect(400);
    await api('adminA', 'put', '/desk/itsm/window').send({ weekdayFrom: '06:00' }).expect(400);
    const w = (await api('adminA', 'put', '/desk/itsm/window').send({ weekdayFrom: '21:00', freezeDates: '15, 7', freezeLastDays: 2 }).expect(200)).body.window;
    expect([w.weekdayFrom, w.freezeDates, w.freezeLastDays, w.freezeFirstDays]).toEqual(['21:00', [7, 15], 2, 7]);
    expect((await api('agent', 'get', `/desk/desks/${ids.it}/itsm-settings`).expect(200)).body.window.weekdayFrom).toBe('21:00');
    expect((await api('adminB', 'get', `/desk/desks/${ids.itB}/itsm-settings`).expect(200)).body.window.weekdayFrom).toBe('20:00');
  });
});
