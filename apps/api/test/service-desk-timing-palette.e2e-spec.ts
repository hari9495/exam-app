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

// Helpdesk answers 1648 and 1649, end to end against the real database (forced RLS, the app role): fuller timing on a
// ticket's SLA timeline for agents (the SLA engine's business time, never a second clock), and the desk actions the
// command palette calls (go to a ticket number, saved replies, scenarios, my status), each refused without its key.
describe('Helpdesk timing and palette actions (1648, 1649)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'agent' | 'agent2' | 'lead' | 'deskAdmin' | 'divya' | 'agentB' | 'outsider';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
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

    planId = (await prisma.plan.create({ data: { name: `hdtp-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HDTP Org ${k}`, slug: `hdtp-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, key: string) =>
      (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${key}-${run}-${randomUUID().slice(0, 4)}`, permissionsJson: JSON.stringify(ROLE_TEMPLATES.find((t) => t.key === key)!.permissions) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['agent', 'A', 'panel', 'desk_agent'],
      ['agent2', 'A', 'panel', 'desk_agent'],
      ['outsider', 'A', 'panel', 'desk_agent'],
      ['lead', 'A', 'panel', 'desk_lead'],
      ['deskAdmin', 'A', 'panel', 'desk_admin'],
      ['divya', 'A', 'panel', null],
      ['agentB', 'B', 'panel', 'desk_agent'],
    ];
    for (const [who, k, role, tpl] of roster) {
      const o = org[k].id;
      const permissionProfileId = tpl ? await profile(o, tpl) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}-${run}@hdtp.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}-${run}@hdtp.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await tenantPrisma.forTenant(asA(), async (tx) => {
      const p = await tx.person.create({ data: { organizationId: org.A.id, givenName: 'Divya', primaryEmail: `divya-${run}@hdtp.test` } });
      ids.divyaPerson = p.id;
      await tx.personRole.create({ data: { organizationId: org.A.id, personId: p.id, roleType: 'login', sourceTable: 'users', sourceId: users.divya, startOn: new Date('2026-01-01') } });
    });
    ids.desk = (await api('adminA', 'post', '/desk/desks').send({ name: 'IT help desk', key: 'IT', kind: 'it' }).expect(201)).body.id;
    for (const [who, role] of [['agent', 'agent'], ['agent2', 'agent'], ['lead', 'lead'], ['deskAdmin', 'admin']] as const) await api('adminA', 'post', `/desk/desks/${ids.desk}/members`).send({ userId: users[who], role }).expect(201);
    ids.deskB = (await api('adminB', 'post', '/desk/desks').send({ name: 'B IT', key: 'BIT', kind: 'it' }).expect(201)).body.id;
    await api('adminB', 'post', `/desk/desks/${ids.deskB}/members`).send({ userId: users.agentB, role: 'agent' }).expect(201);
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

  const SUPER_TX = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant(SUPER, fn);

  describe('1648: fuller timing on the ticket', () => {
    it('matches a known history: the average wait for a reply, time on hold, moves and the agents involved', async () => {
      const t = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.desk, subject: `Laptop will not charge ${run}`, description: 'It stopped charging this morning.' }).expect(201)).body as { id: string };
      ids.ticket = t.id;
      const desk = (await api('deskAdmin', 'get', `/desk/desks/${ids.desk}`).expect(200)).body as { statuses: { id: string; systemState: string }[] };
      const hold = desk.statuses.find((s) => s.systemState === 'on_hold')!.id;
      const open = desk.statuses.find((s) => s.systemState === 'open')!.id;
      // The known history, in hours after the ticket was opened (messages and events are never edited, so they are written
      // at those times; round the clock: no business calendar on this ticket's targets): agent at +1 h (a 1 h wait);
      // requester at +2 h; on hold from +2.5 h to +3.5 h (1 h); hand-over at +3 h; agent2 at +4 h (a 2 h wait).
      await SUPER_TX(async (tx) => {
        const opened = await tx.sdTicket.findUniqueOrThrow({ where: { id: t.id } });
        const at = (h: number) => new Date(opened.createdAt.getTime() + h * 3_600_000);
        await tx.sdSlaTimer.updateMany({ where: { ticketId: t.id }, data: { calendarId: null } });
        const first = await tx.sdTicketMessage.findFirstOrThrow({ where: { ticketId: t.id } });
        const msg = (side: 'agent' | 'requester', who: string | null, text: string, h: number) => ({ organizationId: org.A.id, deskId: ids.desk!, ticketId: t.id, kind: 'reply', side, authorUserId: side === 'agent' ? who : null, authorPersonId: side === 'requester' ? first.authorPersonId : null, bodyHtml: `<p>${text}</p>`, bodyText: text, channel: first.channel, createdAt: at(h) });
        await tx.sdTicketMessage.createMany({ data: [msg('agent', users.agent, 'Which charger do you use?', 1), msg('requester', null, 'The office one, 65 W.', 2), msg('agent', users.agent2, 'A new charger is on its way.', 4)] });
        const ev = (kind: string, fromValue: string | null, toValue: string | null, h: number) => ({ organizationId: org.A.id, deskId: ids.desk!, ticketId: t.id, kind, fromValue, toValue, byUserId: users.lead, at: at(h) });
        await tx.sdTicketEvent.createMany({ data: [ev('assigned', null, users.agent, 0.5), ev('status_changed', open, hold, 2.5), ev('assigned', users.agent, users.agent2, 3), ev('status_changed', hold, open, 3.5)] });
      });
      const timing = (await api('agent2', 'get', `/desk/tickets/${t.id}/work`).expect(200)).body.timing;
      expect(timing).toEqual({ averageReplySeconds: 5400, agentReplies: 2, onHoldSeconds: 3600, moves: 1, agents: [`agent ${run}`, `agent2 ${run}`].sort() });
      // A team lead on the desk sees the same; nothing else changed on the ticket.
      expect((await api('lead', 'get', `/desk/tickets/${t.id}/work`).expect(200)).body.timing).toEqual(timing);
    });

    it('a requester never sees agent timing; nor does someone off the desk or in another company', async () => {
      await api('divya', 'get', `/desk/tickets/${ids.ticket}/work`).expect(403);
      const mine = JSON.stringify((await api('divya', 'get', `/desk/my/tickets/${ids.ticket}`).expect(200)).body);
      for (const word of ['timing', 'averageReplySeconds', 'onHoldSeconds', 'agentReplies', '"moves"']) expect(mine).not.toContain(word);
      await api('outsider', 'get', `/desk/tickets/${ids.ticket}/work`).expect(404);
      await api('agentB', 'get', `/desk/tickets/${ids.ticket}/work`).expect(404);
    });
  });

  describe('1649: the palette’s desk actions, each with its key', () => {
    it('go to a ticket number: only a ticket the agent may open', async () => {
      const number = (await api('agent', 'get', `/desk/tickets/${ids.ticket}`).expect(200)).body.number as string;
      expect((await api('agent', 'get', `/desk/tickets/by-number/${number}`).expect(200)).body).toEqual({ id: ids.ticket, number });
      expect((await api('agent', 'get', `/desk/tickets/by-number/${number.toLowerCase()}`).expect(200)).body.id).toBe(ids.ticket);
      await api('agent', 'get', '/desk/tickets/by-number/IT-999999').expect(404);
      await api('agent', 'get', `/desk/tickets/by-number/${encodeURIComponent('IT 1; drop')}`).expect(404);
      await api('outsider', 'get', `/desk/tickets/by-number/${number}`).expect(404); // not on this desk
      await api('agentB', 'get', `/desk/tickets/by-number/${number}`).expect(404); // another company
      await api('divya', 'get', `/desk/tickets/by-number/${number}`).expect(403); // the requester has no desk key
    });

    it('saved replies, scenarios and my status: an agent may; the requester is refused', async () => {
      await api('adminA', 'post', `/desk/desks/${ids.desk}/canned-responses`).send({ title: 'Charger on its way', bodyHtml: '<p>Hi {{requester.first_name}}, a new charger is on its way.</p>' }).expect(201);
      expect((await api('agent', 'get', `/desk/desks/${ids.desk}/canned-responses`).expect(200)).body.map((c: { title: string }) => c.title)).toContain('Charger on its way');
      await api('divya', 'get', `/desk/desks/${ids.desk}/canned-responses`).expect(403);
      const sc = (await api('adminA', 'post', `/desk/desks/${ids.desk}/scenarios`).send({ name: 'Tag hardware', actions: { addTags: ['hardware'] } }).expect(201)).body as { id: string };
      const v = (await api('agent2', 'get', `/desk/tickets/${ids.ticket}`).expect(200)).body.version as number;
      await api('divya', 'post', `/desk/tickets/${ids.ticket}/scenarios/${sc.id}`).send({ version: v }).expect(403);
      await api('agent2', 'post', `/desk/tickets/${ids.ticket}/scenarios/${sc.id}`).send({ version: v }).expect(200);
      expect((await api('agent2', 'get', `/desk/tickets/${ids.ticket}`).expect(200)).body.tags).toContain('hardware');
      await api('divya', 'put', '/desk/me/status').send({ status: 'away' }).expect(403);
      await api('agent', 'put', '/desk/me/status').send({ status: 'busy' }).expect(200);
      expect((await api('agent', 'get', '/desk/me/status').expect(200)).body.status).toBe('busy');
      await api('agent', 'put', '/desk/me/status').send({ status: 'sleeping' }).expect(400);
    });
  });
});
