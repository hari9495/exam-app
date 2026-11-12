process.env.SD_SCANNER = 'dev-fake';
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

// The small Helpdesk items (founder answers 1642, 1643, 1646, 1647, 1661, 1662), end to end against the real database
// (forced RLS, the app role). Positive and negative: the employee, an agent, a lead, a desk admin, another company.
describe('Helpdesk small items', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'agent' | 'lead' | 'deskAdmin' | 'divya' | 'agentB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'patch' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const asA = (): TenantContext => ({ organizationId: org.A.id, isSuperAdmin: false, userId: null });
  const titles = (b: { title: string }[]) => b.map((x) => x.title);

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

    planId = (await prisma.plan.create({ data: { name: `small-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Small Org ${k}`, slug: `small-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, key: string) =>
      (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${key}-${run}-${randomUUID().slice(0, 4)}`, permissionsJson: JSON.stringify(ROLE_TEMPLATES.find((t) => t.key === key)!.permissions) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['agent', 'A', 'panel', 'desk_agent'],
      ['lead', 'A', 'panel', 'desk_lead'],
      ['deskAdmin', 'A', 'panel', 'desk_admin'],
      ['divya', 'A', 'panel', null],
      ['agentB', 'B', 'panel', 'desk_agent'],
    ];
    for (const [who, k, role, tpl] of roster) {
      const o = org[k].id;
      const permissionProfileId = tpl ? await profile(o, tpl) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}-${run}@small.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}-${run}@small.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await tenantPrisma.forTenant(asA(), async (tx) => {
      const p = await tx.person.create({ data: { organizationId: org.A.id, givenName: 'Divya', primaryEmail: `divya-${run}@small.test` } });
      ids.divyaPerson = p.id;
      await tx.personRole.create({ data: { organizationId: org.A.id, personId: p.id, roleType: 'login', sourceTable: 'users', sourceId: users.divya, startOn: new Date('2026-01-01') } });
    });
    ids.desk = (await api('adminA', 'post', '/desk/desks').send({ name: 'IT help desk', key: 'IT', kind: 'it' }).expect(201)).body.id;
    for (const [who, role] of [['agent', 'agent'], ['lead', 'lead'], ['deskAdmin', 'admin']] as const) await api('adminA', 'post', `/desk/desks/${ids.desk}/members`).send({ userId: users[who], role }).expect(201);
    ids.deskB = (await api('adminB', 'post', '/desk/desks').send({ name: 'B IT', key: 'BIT', kind: 'it' }).expect(201)).body.id;
    await api('adminB', 'post', `/desk/desks/${ids.deskB}/members`).send({ userId: users.agentB, role: 'agent' }).expect(201);
    ids.space = (await api('deskAdmin', 'post', '/desk/kb/spaces').send({ deskId: ids.desk, name: 'IT help', slug: 'it-help', audience: 'requesters' }).expect(201)).body.id;
    ids.art = (await api('agent', 'post', '/desk/kb/articles').send({ spaceId: ids.space, title: `Withdraw your provident fund ${run}`, bodyHtml: '<p>Use the EPFO member portal with your account number.</p>' }).expect(201)).body.id;
    await api('agent', 'post', `/desk/kb/articles/${ids.art}/submit`).send({ version: 1 }).expect(200);
    await api('lead', 'post', `/desk/kb/articles/${ids.art}/review`).send({ version: 1, approve: true }).expect(200);
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

  // ------------------------------------------------------------------------------------------ 1642 search synonyms
  describe('1642: search words that mean the same', () => {
    const suggest = (q: string) => api('divya', 'get', `/desk/my/kb/suggest?q=${encodeURIComponent(q)}`).expect(200);
    it('the Indian HR starter list: "PF" finds the provident fund article; the settings show the list and the starter', async () => {
      expect(titles((await suggest('PF')).body)).toContain(`Withdraw your provident fund ${run}`);
      const s = (await api('agent', 'get', '/desk/kb/settings').expect(200)).body as { synonyms: string; synonymsDefault: string };
      expect(s.synonyms).toContain('pf, provident fund, epf');
      expect(s.synonyms).toBe(s.synonymsDefault);
    });

    it('the Service Desk owner changes the list (audited); without the PF line, "PF" no longer finds it; another company keeps its own', async () => {
      const mine = 'cl, casual leave\nuan, universal account number';
      expect((await api('adminA', 'put', '/desk/kb/settings').send({ synonyms: mine }).expect(200)).body.synonyms).toBe(mine);
      expect(titles((await suggest('PF')).body)).not.toContain(`Withdraw your provident fund ${run}`);
      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'desk.kb.settings_changed', entityId: 'desk.kb.synonyms' } }))).toBe(1);
      expect((await api('agentB', 'get', '/desk/kb/settings').expect(200)).body.synonyms).toContain('pf, provident fund');
      await api('adminA', 'put', '/desk/kb/settings').send({ synonyms: 'pf, provident fund, epf' }).expect(200);
      expect(titles((await suggest('EPF')).body)).toContain(`Withdraw your provident fund ${run}`);
    });

    it('negative: a line with one word or odd characters is refused naming the line; an agent, a desk admin and the employee may not change it', async () => {
      expect((await api('adminA', 'put', '/desk/kb/settings').send({ synonyms: 'pf, provident fund\ncanteen' }).expect(400)).body.message).toMatch(/Line 2/);
      expect((await api('adminA', 'put', '/desk/kb/settings').send({ synonyms: 'pf; drop, x' }).expect(400)).body.message).toMatch(/Line 1/);
      for (const who of ['agent', 'deskAdmin', 'divya'] as const) await api(who, 'put', '/desk/kb/settings').send({ synonyms: 'a1, b1' }).expect(403);
    });
  });

  // ------------------------------------------------------------------------------------------ 1643 rating reasons
  const raiseAndSolve = async (subject: string) => {
    const t = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.desk, subject, description: 'Please help with this.' }).expect(201)).body;
    await api('agent', 'post', `/desk/tickets/${t.id}/messages`).send({ kind: 'reply', bodyHtml: '<p>Done. Try again now.</p>' }).expect(201);
    const fresh = (await api('agent', 'get', `/desk/tickets/${t.id}`).expect(200)).body;
    await api('agent', 'post', `/desk/tickets/${t.id}/resolve`).send({ version: fresh.version }).expect(200);
    return t.id as string;
  };
  const deskVersion = async () => (await api('deskAdmin', 'get', `/desk/desks/${ids.desk}`).expect(200)).body.desk.version as number;

  describe('1643: a preset reason with the rating', () => {
    it('a desk starts with the starter reasons; the requester sees them on a solved ticket and rates with one; the agent, the reports and the audit show it', async () => {
      const desk = (await api('deskAdmin', 'get', `/desk/desks/${ids.desk}`).expect(200)).body.desk;
      expect(desk.ratingReasons).toEqual(['Quick help', 'Solved my problem', 'Friendly and clear', 'Slow', 'Not solved', 'Had to explain again']);
      const id = await raiseAndSolve(`Printer jams ${run}`);
      const mine = (await api('divya', 'get', `/desk/my/tickets/${id}`).expect(200)).body;
      expect(mine).toMatchObject({ canRate: true, ratingReasons: desk.ratingReasons });
      expect((await api('divya', 'get', '/desk/my/tickets').expect(200)).body.find((x: { id: string }) => x.id === id).ratingReasons).toEqual(desk.ratingReasons);
      // Matched without case; kept as the desk words it.
      await api('divya', 'post', `/desk/my/tickets/${id}/rating`).send({ score: 2, reason: 'slow' }).expect(200);
      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.sdRating.findFirstOrThrow({ where: { ticketId: id }, select: { score: true, reason: true } }))).toEqual({ score: 2, reason: 'Slow' });
      expect((await api('agent', 'get', `/desk/tickets/${id}`).expect(200)).body).toMatchObject({ rating: 2, ratingReason: 'Slow' });
      const csat = (await api('lead', 'get', '/desk/reports/library/csat').expect(200)).body as { columns: string[]; rows: unknown[][] };
      const col = csat.columns.indexOf('Reasons given');
      expect(col).toBeGreaterThan(-1);
      expect(csat.rows.map((r) => r[col])).toContain('Slow 1');
      const rep = (await api('lead', 'post', '/desk/reports/custom').send({ name: `Ratings ${run}`, columns: ['number', 'rating', 'rating_reason'], filters: { deskIds: [ids.desk] } }).expect(201)).body.id;
      const out = (await api('lead', 'get', `/desk/reports/custom/${rep}/run`).expect(200)).body as { columns: string[]; rows: unknown[][] };
      expect(out.columns).toEqual(['Number', 'Rating', 'Rating reason']);
      expect(out.rows.some((r) => r[1] === 2 && r[2] === 'Slow')).toBe(true);
      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'desk.ticket.rated', entityId: id, metadataJson: { contains: '"reason":"Slow"' } } }))).toBe(1);
    });

    it('the desk admin changes the list (audited); an empty list asks for none; a rating without a reason still works', async () => {
      await api('deskAdmin', 'patch', `/desk/desks/${ids.desk}`).send({ version: await deskVersion(), ratingReasons: ['  Great   help ', 'Too slow'] }).expect(200);
      expect((await api('deskAdmin', 'get', `/desk/desks/${ids.desk}`).expect(200)).body.desk.ratingReasons).toEqual(['Great help', 'Too slow']);
      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'desk.desk.updated', entityId: ids.desk } }))).toBeGreaterThan(0);
      const id = await raiseAndSolve(`Mouse broken ${run}`);
      await api('divya', 'post', `/desk/my/tickets/${id}/rating`).send({ score: 5 }).expect(200);
      expect((await tenantPrisma.forTenant(SUPER, (tx) => tx.sdRating.findFirstOrThrow({ where: { ticketId: id } }))).reason).toBeNull();
      await api('deskAdmin', 'patch', `/desk/desks/${ids.desk}`).send({ version: await deskVersion(), ratingReasons: [] }).expect(200);
      const id2 = await raiseAndSolve(`Monitor flickers ${run}`);
      expect((await api('divya', 'get', `/desk/my/tickets/${id2}`).expect(200)).body.ratingReasons).toEqual([]);
      await api('divya', 'post', `/desk/my/tickets/${id2}/rating`).send({ score: 3, reason: 'Slow' }).expect(400);
    });

    it('negative: a reason not on the list is refused; a list too long, repeated or with a one-letter reason is refused; an agent or another company cannot change it', async () => {
      await api('deskAdmin', 'patch', `/desk/desks/${ids.desk}`).send({ version: await deskVersion(), ratingReasons: ['Quick help', 'Slow'] }).expect(200);
      const id = await raiseAndSolve(`Keyboard sticky ${run}`);
      expect((await api('divya', 'post', `/desk/my/tickets/${id}/rating`).send({ score: 1, reason: 'Rude' }).expect(400)).body.message).toMatch(/reasons shown/);
      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.sdRating.count({ where: { ticketId: id } }))).toBe(0);
      const v = await deskVersion();
      await api('deskAdmin', 'patch', `/desk/desks/${ids.desk}`).send({ version: v, ratingReasons: Array.from({ length: 13 }, (_, i) => `Reason ${i}`) }).expect(400);
      await api('deskAdmin', 'patch', `/desk/desks/${ids.desk}`).send({ version: v, ratingReasons: ['Slow', 'slow '] }).expect(400);
      await api('deskAdmin', 'patch', `/desk/desks/${ids.desk}`).send({ version: v, ratingReasons: ['A'] }).expect(400);
      await api('agent', 'patch', `/desk/desks/${ids.desk}`).send({ version: v, ratingReasons: ['Lovely'] }).expect(403);
      await api('adminB', 'patch', `/desk/desks/${ids.desk}`).send({ version: v, ratingReasons: ['Lovely'] }).expect(404);
      expect((await api('deskAdmin', 'get', `/desk/desks/${ids.desk}`).expect(200)).body.desk.ratingReasons).toEqual(['Quick help', 'Slow']);
    });
  });

  // ------------------------------------------------------------------------------------------ 1646 we're closed now
  describe('1646: "We are closed now" with the next opening time', () => {
    // Calendars that are open or closed whatever the time the suite runs: every day all day, and one whose hours only
    // start on Tue 1 Jan 2030 (so it is closed now and opens then at 09:00 India time).
    const calendar = (name: string, weekdays: number[], start: number, end: number, validFrom: string) =>
      tenantPrisma.forTenant(asA(), async (tx) => {
        const c = await tx.businessCalendar.create({ data: { organizationId: org.A.id, name: `${name} ${run}`, timeZone: 'Asia/Kolkata' } });
        await tx.businessCalendarHours.createMany({ data: weekdays.map((weekday) => ({ organizationId: org.A.id, calendarId: c.id, weekday, startMinute: start, endMinute: end, validFrom: new Date(validFrom) })) });
        return c.id;
      });
    const setDesk = (change: Record<string, unknown>, who: Who = 'deskAdmin') => deskVersion().then((version) => api(who, 'patch', `/desk/desks/${ids.desk}`).send({ version, ...change }));
    const myDesk = async () => (await api('divya', 'get', '/desk/my/desks').expect(200)).body.find((d: { id: string }) => d.id === ids.desk);
    const raise = async (subject: string) => (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.desk, subject, description: 'Please help.' }).expect(201)).body.id as string;
    const OPENS = '2030-01-01T03:30:00.000Z';

    beforeAll(async () => {
      ids.calOpen = await calendar('Always', [1, 2, 3, 4, 5, 6, 7], 0, 1440, '2020-01-01');
      ids.calLater = await calendar('From 2030', [1, 2, 3, 4, 5, 6, 7], 540, 1080, '2030-01-01');
      // The portal serves customer desks only: a customer care desk on the same closed calendar.
      ids.care = (await api('adminA', 'post', '/desk/desks').send({ name: 'Customer care', key: 'CARE', kind: 'customer_support' }).expect(201)).body.id;
      const care = (await api('adminA', 'get', `/desk/desks/${ids.care}`).expect(200)).body.desk;
      await api('adminA', 'patch', `/desk/desks/${ids.care}`).send({ version: care.version, calendarId: ids.calLater }).expect(200);
      await api('adminA', 'post', '/desk/portals').send({ slug: 'care', name: 'Care', deskIds: [ids.care], signUp: 'open', openRequests: false }).expect(201);
    });

    it('closed: the help centre and the portal show the desk message and the next opening; a ticket raised then is marked; the requester never sees the mark', async () => {
      await setDesk({ calendarId: ids.calLater }).then((r) => expect(r.status).toBe(200));
      const d = await myDesk();
      expect(d.closed).toEqual({ message: expect.stringContaining('{opens}'), opensAt: OPENS });
      const info = (await request(server()).get(`/api/v1/desk/portal/${org.A.slug}/care`).expect(200)).body;
      expect(info.desks[0]).toMatchObject({ id: ids.care, closed: { message: d.closed.message, opensAt: OPENS } });
      expect(info.desks[0]).not.toHaveProperty('calendarId');
      const id = await raise(`Night ticket ${run}`);
      expect((await api('agent', 'get', `/desk/tickets/${id}`).expect(200)).body.raisedOutsideHours).toBe(true);
      expect((await api('divya', 'get', `/desk/my/tickets/${id}`).expect(200)).body).not.toHaveProperty('raisedOutsideHours');
    });

    it('the desk admin words the message (audited); open hours or no calendar: not closed and tickets are not marked', async () => {
      expect((await setDesk({ closedMessage: 'IT is shut. Back {opens}.' })).status).toBe(200);
      expect((await myDesk()).closed).toEqual({ message: 'IT is shut. Back {opens}.', opensAt: OPENS });
      const logs = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'desk.desk.updated', entityId: ids.desk, metadataJson: { contains: 'closedMessage' } } }));
      expect(logs).toHaveLength(1);
      await setDesk({ calendarId: ids.calOpen }).then((r) => expect(r.status).toBe(200));
      expect((await myDesk()).closed).toBeNull();
      const id = await raise(`Day ticket ${run}`);
      expect((await api('agent', 'get', `/desk/tickets/${id}`).expect(200)).body.raisedOutsideHours).toBe(false);
      await setDesk({ calendarId: null }).then((r) => expect(r.status).toBe(200));
      expect((await myDesk()).closed).toBeNull();
    });

    it('negative: an empty or too long message is refused; an agent or another company cannot change it', async () => {
      expect((await setDesk({ closedMessage: ' ' })).status).toBe(400);
      expect((await setDesk({ closedMessage: 'x'.repeat(301) })).status).toBe(400);
      expect((await setDesk({ closedMessage: 'Gone' }, 'agent')).status).toBe(403);
      expect((await setDesk({ closedMessage: 'Gone' }, 'adminB')).status).toBe(404);
      expect((await api('deskAdmin', 'get', `/desk/desks/${ids.desk}`).expect(200)).body.desk.closedMessage).toBe('IT is shut. Back {opens}.');
    });
  });

  // ------------------------------------------------------------------------------------------ 1647 where a ticket came from
  describe('1647: where a ticket came from (article or search), and articles that led to tickets', () => {
    const today = new Date().toISOString().slice(0, 10);
    const gaps = (who: Who) => api(who, 'get', `/desk/kb/gaps?from=${today}&to=${today}`);
    const raise = (extra: Record<string, unknown>) => api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.desk, subject: `From help ${run}`, description: 'The article did not answer it.', ...extra });

    it('a ticket raised from an article keeps the article and the search; the gaps count it per article', async () => {
      const before = ((await gaps('lead').expect(200)).body.ledToTickets as { articleId: string }[]).length;
      expect(before).toBe(0);
      const a = (await raise({ originArticleId: ids.art, originQuery: '  PF withdrawal ' }).expect(201)).body.id;
      const b = (await raise({ originArticleId: ids.art }).expect(201)).body.id;
      const c = (await raise({ originQuery: 'gratuity' }).expect(201)).body.id;
      const rows = await tenantPrisma.forTenant(SUPER, (tx) => tx.sdTicket.findMany({ where: { id: { in: [a, b, c] } }, select: { id: true, originArticleId: true, originQuery: true } }));
      expect(rows.find((r) => r.id === a)).toMatchObject({ originArticleId: ids.art, originQuery: 'PF withdrawal' });
      expect(rows.find((r) => r.id === b)).toMatchObject({ originArticleId: ids.art, originQuery: null });
      expect(rows.find((r) => r.id === c)).toMatchObject({ originArticleId: null, originQuery: 'gratuity' });
      const led = (await gaps('lead').expect(200)).body.ledToTickets;
      expect(led).toEqual([{ articleId: ids.art, number: expect.any(Number), title: `Withdraw your provident fund ${run}`, tickets: 2 }]);
      // Another company sees none of it.
      expect((await gaps('adminB').expect(200)).body.ledToTickets).toEqual([]);
    });

    it('negative: an unknown article is refused and nothing is raised; the employee cannot read the gaps', async () => {
      const n = await tenantPrisma.forTenant(SUPER, (tx) => tx.sdTicket.count({ where: { organizationId: org.A.id } }));
      expect((await raise({ originArticleId: randomUUID() }).expect(400)).body.message).toMatch(/No such help article/);
      await raise({ originArticleId: 'not-a-uuid' }).expect(400);
      await raise({ originQuery: 'x'.repeat(201) }).expect(400);
      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.sdTicket.count({ where: { organizationId: org.A.id } }))).toBe(n);
      await gaps('divya').expect(403);
    });
  });

  // ------------------------------------------------------------------------------------------ 1661, 1662 the device
  describe('1661 and 1662: the device an IT ticket is about', () => {
    beforeAll(async () => {
      const today = new Date().toISOString().slice(0, 10);
      await tenantPrisma.forTenant(asA(), async (tx) => {
        ids.otherPerson = (await tx.person.create({ data: { organizationId: org.A.id, givenName: 'Other', primaryEmail: `other-${run}@small.test` } })).id;
        const asset = async (name: string, tag: string, status: string, holder?: string) => {
          const a = await tx.asset.create({ data: { organizationId: org.A.id, category: 'Laptop', name, tag, status } });
          if (holder) await tx.assetAssignment.create({ data: { organizationId: org.A.id, assetId: a.id, personId: holder, issuedOn: new Date(`${today}T00:00:00Z`), issueCondition: 'Good' } });
          return a.id;
        };
        ids.myLaptop = await asset('Dell Latitude 5440', `SM-LT-${run}-1`, 'assigned', ids.divyaPerson);
        ids.otherLaptop = await asset('Lenovo ThinkPad E14', `SM-LT-${run}-2`, 'assigned', ids.otherPerson);
        ids.retired = await asset('Old HP', `SM-LT-${run}-3`, 'retired');
      });
      ids.hr = (await api('adminA', 'post', '/desk/desks').send({ name: 'HR help', key: 'HR', kind: 'hr' }).expect(201)).body.id;
      await api('adminA', 'post', `/desk/desks/${ids.hr}/members`).send({ userId: users.agent, role: 'agent' }).expect(201);
      // Back to open hours so these tickets are ordinary ones.
      await api('deskAdmin', 'patch', `/desk/desks/${ids.desk}`).send({ version: await deskVersion(), calendarId: null }).expect(200);
    });
    const raiseOn = (deskId: string, extra: Record<string, unknown> = {}) => api('divya', 'post', '/desk/my/tickets').send({ deskId, subject: `Device ${run}`, description: 'It will not start.', ...extra });

    it('1662: the IT desk asks which device; the person sees and may pick only their own; the agent sees it on the ticket', async () => {
      const desks = (await api('divya', 'get', '/desk/my/desks').expect(200)).body as { id: string; askDevice: boolean }[];
      expect(desks.find((d) => d.id === ids.desk)!.askDevice).toBe(true);
      expect(desks.find((d) => d.id === ids.hr)!.askDevice).toBe(false);
      expect((await api('divya', 'get', '/desk/my/pick/assets?q=').expect(200)).body.map((x: { id: string }) => x.id)).toEqual([ids.myLaptop]);
      const id = (await raiseOn(ids.desk, { assetId: ids.myLaptop }).expect(201)).body.id;
      const view = (await api('agent', 'get', `/desk/tickets/${id}`).expect(200)).body;
      expect(view).toMatchObject({ device: { id: ids.myLaptop, label: `Dell Latitude 5440 (SM-LT-${run}-1)`, detail: 'Laptop' }, canSetDevice: true });
      ids.devTicket = id;
    });

    it('1662 negative: someone else\'s device or a device on a non-IT desk is refused, and nothing is raised', async () => {
      const n = await tenantPrisma.forTenant(SUPER, (tx) => tx.sdTicket.count({ where: { organizationId: org.A.id } }));
      expect((await raiseOn(ids.desk, { assetId: ids.otherLaptop }).expect(400)).body.message).toMatch(/your own devices/);
      expect((await raiseOn(ids.desk, { assetId: randomUUID() }).expect(400)).body.message).toMatch(/your own devices/);
      expect((await raiseOn(ids.hr, { assetId: ids.myLaptop }).expect(400)).body.message).toMatch(/Only IT desk/);
      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.sdTicket.count({ where: { organizationId: org.A.id } }))).toBe(n);
    });

    it('1661: an IT agent searches any company device, changes and clears it (audited, on the timeline)', async () => {
      const found = (await api('agent', 'get', `/desk/pick/assets?deskId=${ids.desk}&q=SM-LT-${run}`).expect(200)).body.map((x: { id: string }) => x.id);
      expect(found.sort()).toEqual([ids.myLaptop, ids.otherLaptop].sort());
      expect((await api('agent', 'put', `/desk/tickets/${ids.devTicket}/device`).send({ assetId: ids.otherLaptop }).expect(200)).body.device.id).toBe(ids.otherLaptop);
      expect((await api('agent', 'get', `/desk/tickets/${ids.devTicket}`).expect(200)).body.device.id).toBe(ids.otherLaptop);
      await api('agent', 'put', `/desk/tickets/${ids.devTicket}/device`).send({ assetId: null }).expect(200);
      expect((await api('agent', 'get', `/desk/tickets/${ids.devTicket}`).expect(200)).body.device).toBeNull();
      const audits = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'desk.ticket.device_set', entityId: ids.devTicket } }));
      expect(audits).toBe(2);
      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.sdTicketEvent.count({ where: { ticketId: ids.devTicket, kind: 'device_changed' } }))).toBe(2);
    });

    it('1661 negative: a non-IT agent, a retired device, a desk admin without a seat, another company and the employee are all refused', async () => {
      const hrTicket = (await raiseOn(ids.hr).expect(201)).body.id;
      expect((await api('agent', 'get', `/desk/tickets/${hrTicket}`).expect(200)).body.canSetDevice).toBe(false);
      expect((await api('agent', 'put', `/desk/tickets/${hrTicket}/device`).send({ assetId: ids.myLaptop }).expect(403)).body.message).toMatch(/IT desk/);
      await api('agent', 'get', `/desk/pick/assets?deskId=${ids.hr}&q=`).expect(403);
      expect((await api('agent', 'put', `/desk/tickets/${ids.devTicket}/device`).send({ assetId: ids.retired }).expect(400)).body.message).toMatch(/from the list/);
      await api('agent', 'put', `/desk/tickets/${ids.devTicket}/device`).send({ assetId: 'nope' }).expect(400);
      await api('deskAdmin', 'put', `/desk/tickets/${ids.devTicket}/device`).send({ assetId: ids.myLaptop }).expect(403);
      expect([403, 404]).toContain((await api('agentB', 'put', `/desk/tickets/${ids.devTicket}/device`).send({ assetId: ids.myLaptop })).status);
      await api('divya', 'put', `/desk/tickets/${ids.devTicket}/device`).send({ assetId: ids.myLaptop }).expect(403);
      expect((await api('agent', 'get', `/desk/tickets/${ids.devTicket}`).expect(200)).body.device).toBeNull();
    });
  });
});
