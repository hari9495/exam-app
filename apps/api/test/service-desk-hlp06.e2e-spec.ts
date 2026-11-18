process.env.SD_SCANNER = 'dev-fake';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { REDIS_CONNECTION } from '../src/jobs/redis-connection';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// HLP-06 speak-up filing end to end against the real database (forced RLS, the app role). Positive and negative: named
// and anonymous reports, the company's anonymous setting, routing to the ethics team, the Internal Committee and the
// escalation list (never the officer a report is about), only routed officers see a case (HR, the manager, the System
// Admin and another company get 404), every look audited, the reply code (shown once, kept as a hash, wrong tries
// counted and locked), POSH always named and refused with no committee, bad input, append-only messages.
describe('HLP-06 speak-up filing', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let redis: Redis;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hr' | 'manager' | 'divya' | 'ethics1' | 'ethics2' | 'ic1' | 'chair';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1/desk/speakup${path}`).set('Authorization', `Bearer ${token[who]}`);
  const pub = (path: string) => request(server()).post(`/api/v1/desk/speakup/public${path}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  // Answer 2591: the committee list asks whether a member is a woman and when the term ends.
  const IC = { woman: true, termEndsOn: new Date(Date.now() + 330 * 60_000 + 2 * 365 * 86_400_000).toISOString().slice(0, 10) };
  const shift = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const setting = (key: string, value: string) =>
    inA(async (tx) => {
      await tx.setting.deleteMany({ where: { organizationId: org.A.id, key } });
      await tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key, value } });
    });
  const clearTries = async () => {
    const keys = await redis.keys('speakup:try:*');
    if (keys.length) await redis.del(...keys);
  };
  const REPORT = { kind: 'grievance', category: 'Transport', summary: 'The night shift cab skipped my stop three times last week.', happenedOn: shift(-3) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn(async () => ({ success: true })) })
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
    redis = moduleRef.get<Redis>(REDIS_CONNECTION, { strict: false });
    await clearTries();

    planId = (await prisma.plan.create({ data: { name: `hlp06-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HLP06 Org ${k}`, slug: `hlp06-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hr', 'A', 'panel', tpl('hr_admin')],
      ['manager', 'A', 'panel', []],
      ['divya', 'A', 'panel', []],
      ['ethics1', 'A', 'panel', []],
      ['ethics2', 'A', 'panel', []],
      ['ic1', 'A', 'panel', []],
      ['chair', 'A', 'panel', []],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hlp06-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hlp06-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
  }, 120_000);

  afterAll(async () => {
    await clearTries();
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('before set-up nothing can be filed; only speakup.setup.manage chooses the officers (not HR)', async () => {
    expect((await api('divya', 'get', '/form').expect(200)).body).toMatchObject({ anonymous: 'all', ready: { grievance: false, whistleblower: false, posh: false }, categories: { grievance: ['Pay and benefits', 'Working conditions', 'A manager', 'Transport', 'Safety', 'Other'] } });
    expect((await api('divya', 'post', '/reports').send(REPORT).expect(409)).body.code).toBe('SPEAKUP_NO_TEAM');
    await api('hr', 'get', '/setup').expect(403);
    await api('hr', 'post', '/setup/members').send({ team: 'ethics', userId: users.hr }).expect(403);
    await api('adminA', 'post', '/setup/members').send({ team: 'board', userId: users.ethics1 }).expect(400);
    await api('adminA', 'post', '/setup/members').send({ team: 'ethics', userId: users.adminB }).expect(400);
    for (const [team, who, role] of [['ethics', 'ethics1'], ['ethics', 'ethics2'], ['ic', 'ic1', 'presiding'], ['escalation', 'chair']] as const) await api('adminA', 'post', '/setup/members').send({ team, userId: users[who], ...(role ? { role } : {}), ...(team === 'ic' ? IC : {}) }).expect(201);
    await api('adminA', 'post', '/setup/members').send({ team: 'ethics', userId: users.ethics1 }).expect(409);
    await api('adminA', 'post', '/setup/members').send({ team: 'ic', userId: users.chair, role: 'presiding', ...IC }).expect(409);
    const form = (await api('divya', 'get', '/form').expect(200)).body;
    expect(form.ready).toEqual({ grievance: true, whistleblower: true, posh: true });
    expect(form.posh).toMatchObject({ filingMonths: 3, extensionMonths: 3, source: 'IN.POSH 2013-v2 (verify)' });
    expect(form.officers.map((o: { id: string }) => o.id).sort()).toEqual([users.ethics1, users.ethics2].sort());
  });

  it('a named grievance: bad input refused; numbered, routed (no grievance team → ethics), clocks from the settings and IN.GRC', async () => {
    await api('divya', 'post', '/reports').send({ ...REPORT, summary: 'short' }).expect(400);
    await api('divya', 'post', '/reports').send({ ...REPORT, happenedOn: shift(2) }).expect(400);
    await api('divya', 'post', '/reports').send({ ...REPORT, category: 'Gossip' }).expect(400);
    await api('divya', 'post', '/reports').send({ ...REPORT, kind: 'rumour' }).expect(400);
    await api('divya', 'post', '/reports').send({ ...REPORT, aboutUserId: users.manager }).expect(400);
    const r = (await api('divya', 'post', '/reports').send({ ...REPORT, retaliationWorry: true }).expect(201)).body;
    expect(r).toMatchObject({ number: 'GRV-0001', routedTo: 'ethics', clock: [{ key: 'ack', due: shift(2) }, { key: 'decide', due: shift(30) }], source: 'IN.GRC 2020-v1 (verify)' });
    ids.named = r.id;
  });

  it('only the officers it was routed to see it, with the reporter; HR, the manager, the System Admin and another company get 404; each look is audited', async () => {
    for (const who of ['hr', 'manager', 'adminA', 'ic1', 'chair', 'divya', 'adminB'] as const) await api(who, 'get', `/cases/${ids.named}`).expect(404);
    expect((await api('hr', 'get', '/cases').expect(200)).body).toEqual([]);
    const c = (await api('ethics1', 'get', `/cases/${ids.named}`).expect(200)).body;
    expect(c).toMatchObject({ number: 'GRV-0001', identity: 'named', reporter: { name: `divya ${run}` }, retaliationWorry: true, category: 'Transport' });
    expect((await api('ethics2', 'get', '/cases').expect(200)).body.map((x: { id: string }) => x.id)).toEqual([ids.named]);
    const logs = await inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'speakup.case_viewed', entityId: ids.named } }));
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0].metadataJson!)).toEqual({ identityShown: true });
    expect(logs[0].actorUserId).toBe(users.ethics1);
  });

  it('an anonymous ethics concern about an officer: no reporter, no actor, the code only as a hash; it skips that officer for the escalation list', async () => {
    await pub('/reports').send({ org: org.A.slug, kind: 'whistleblower', summary: 'Vendor invoices approved without the goods arriving.', aboutUserId: 'not-a-uuid' }).expect(400);
    await pub('/reports').send({ org: 'no-such-company', kind: 'whistleblower', summary: 'Vendor invoices approved without the goods arriving.' }).expect(404);
    const r = (await pub('/reports').send({ org: org.A.slug, kind: 'whistleblower', category: 'Fraud or theft', summary: 'Vendor invoices approved without the goods arriving.', aboutUserId: users.ethics1 }).expect(201)).body;
    expect(r).toMatchObject({ number: 'WB-0001', routedTo: 'escalation', clock: [{ key: 'ack' }] });
    expect(r.code).toMatch(/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
    ids.anon = r.id;
    ids.code = r.code;
    const row = await inA((tx) => tx.speakupCase.findFirstOrThrow({ where: { id: r.id } }));
    expect(row).toMatchObject({ identity: 'anonymous', reporterUserId: null, reporterEmployeeId: null, aboutUserId: users.ethics1 });
    expect(row.replyCodeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.replyCodeHash).not.toContain(r.code.replace(/-/g, ''));
    const log = await inA((tx) => tx.auditLog.findFirstOrThrow({ where: { organizationId: org.A.id, action: 'speakup.filed', entityId: r.id } }));
    expect(log.actorUserId).toBeNull();
    await api('ethics1', 'get', `/cases/${r.id}`).expect(404);
    const c = (await api('chair', 'get', `/cases/${r.id}`).expect(200)).body;
    expect(c).toMatchObject({ identity: 'anonymous', reporter: null });
  });

  it('the anonymous setting: off refuses, ethics_only refuses grievances only; POSH is never anonymous', async () => {
    await setting('speakup.anonymous', 'off');
    expect((await pub('/reports').send({ org: org.A.slug, kind: 'whistleblower', summary: 'Someone is taking bribes from vendors.' }).expect(403)).body.code).toBe('SPEAKUP_ANON_OFF');
    await setting('speakup.anonymous', 'ethics_only');
    await pub('/reports').send({ org: org.A.slug, ...REPORT }).expect(403);
    await pub('/reports').send({ org: org.A.slug, kind: 'whistleblower', summary: 'Someone is taking bribes from vendors.' }).expect(201);
    await setting('speakup.anonymous', 'all');
    await pub('/reports').send({ org: org.A.slug, kind: 'posh', summary: 'Repeated unwelcome remarks by a colleague.' }).expect(403);
  });

  it('POSH goes only to the Internal Committee, with the inquiry clock from IN.POSH; with no committee it is refused, never sent elsewhere', async () => {
    const r = (await api('divya', 'post', '/reports').send({ kind: 'posh', summary: 'Repeated unwelcome remarks by a colleague in meetings.', happenedOn: shift(-120) }).expect(201)).body;
    expect(r).toMatchObject({ number: 'POSH-0001', routedTo: 'ic', late: true, clock: [{ key: 'ack' }, { key: 'inquiry', due: shift(90) }] });
    for (const who of ['ethics1', 'chair', 'hr', 'adminA', 'manager'] as const) await api(who, 'get', `/cases/${r.id}`).expect(404);
    await api('ic1', 'get', `/cases/${r.id}`).expect(200);
    const ic = (await api('adminA', 'get', '/setup').expect(200)).body.members.find((m: { team: string }) => m.team === 'ic');
    await api('adminA', 'post', `/setup/members/${ic.id}/remove`).expect(201);
    expect((await api('divya', 'post', '/reports').send({ kind: 'posh', summary: 'Repeated unwelcome remarks by a colleague in meetings.' }).expect(409)).body.code).toBe('SPEAKUP_NO_IC');
    await api('adminA', 'post', '/setup/members').send({ team: 'ic', userId: users.ic1, role: 'presiding', ...IC }).expect(201);
  });

  it('answer 2591: the committee list needs woman and term end (at most 3 years, after today); a man cannot preside; other lists refuse them', async () => {
    const add = (body: object) => api('adminA', 'post', '/setup/members').send({ team: 'ic', userId: users.chair, ...body });
    await add({}).expect(400);
    await add({ woman: true }).expect(400);
    await add({ woman: true, termEndsOn: today }).expect(400);
    await add({ woman: true, termEndsOn: shift(3 * 365 + 5) }).expect(400);
    await add({ woman: 'yes', termEndsOn: shift(30) }).expect(400);
    await api('adminA', 'post', '/setup/members').send({ team: 'escalation', userId: users.divya, woman: true }).expect(400);
    const ok = (await add({ woman: false, termEndsOn: shift(365) }).expect(201)).body;
    const row = (await api('adminA', 'get', '/setup').expect(200)).body.members.find((m: { id: string }) => m.id === ok.id);
    expect(row).toMatchObject({ team: 'ic', role: 'member', woman: false, termEndsOn: shift(365) });
    await api('adminA', 'post', `/setup/members/${ok.id}/remove`).expect(201);
    // Removing the presiding officer first so a man may be tried as presiding.
    const po = (await api('adminA', 'get', '/setup').expect(200)).body.members.find((m: { team: string; role: string }) => m.team === 'ic' && m.role === 'presiding');
    await api('adminA', 'post', `/setup/members/${po.id}/remove`).expect(201);
    expect((await add({ role: 'presiding', woman: false, termEndsOn: shift(365) }).expect(400)).body.message).toMatch(/senior woman/);
    await api('adminA', 'post', '/setup/members').send({ team: 'ic', userId: users.ic1, role: 'presiding', ...IC }).expect(201);
  });

  it('answer 2592: a workplace committee takes that workplace’s POSH complaints; others go to the company committee; each committee’s presiding and console are its own', async () => {
    const loc = await inA(async (tx) => {
      const e = await tx.legalEntity.create({ data: { organizationId: org.A.id, name: 'HLP06 Foods', shortName: `H6${run.slice(0, 4).toUpperCase()}`, isDefault: true } });
      return (await tx.location.create({ data: { organizationId: org.A.id, legalEntityId: e.id, name: 'Hosur plant', code: 'HSR', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
    });
    const add = (body: object) => api('adminA', 'post', '/setup/members').send({ team: 'ic', ...IC, ...body });
    await api('adminA', 'post', '/setup/members').send({ team: 'ethics', userId: users.chair, locationId: loc }).expect(400);
    await add({ userId: users.ethics2, locationId: '00000000-0000-4000-8000-000000000000' }).expect(400);
    await add({ userId: users.ethics2, role: 'presiding', locationId: loc }).expect(201);
    await add({ userId: users.ethics2, locationId: loc }).expect(409);
    await add({ userId: users.chair, role: 'presiding', locationId: loc }).expect(409);
    // ic1 presides the company committee and may sit on the workplace's too.
    await add({ userId: users.ic1, locationId: loc }).expect(201);
    const setup = (await api('adminA', 'get', '/setup').expect(200)).body;
    expect(setup.locations).toEqual(expect.arrayContaining([{ id: loc, name: 'Hosur plant' }]));
    expect(setup.members.filter((m: { team: string; locationId: string | null }) => m.team === 'ic' && m.locationId === loc)).toHaveLength(2);
    const at = (await api('divya', 'post', '/reports').send({ kind: 'posh', summary: 'Unwelcome remarks at the plant canteen.', locationId: loc }).expect(201)).body;
    expect(await inA((tx) => tx.speakupCase.findFirstOrThrow({ where: { id: at.id }, select: { icLocationId: true } }))).toEqual({ icLocationId: loc });
    expect((await inA((tx) => tx.speakupCaseMember.findMany({ where: { caseId: at.id }, select: { userId: true } }))).map((m) => m.userId).sort()).toEqual([users.ethics2, users.ic1].sort());
    await api('ethics2', 'get', `/cases/${at.id}`).expect(200);
    await api('chair', 'get', `/cases/${at.id}`).expect(404);
    const co = (await api('divya', 'post', '/reports').send({ kind: 'posh', summary: 'Unwelcome remarks in the head office.' }).expect(201)).body;
    expect((await inA((tx) => tx.speakupCaseMember.findMany({ where: { caseId: co.id }, select: { userId: true } }))).map((m) => m.userId)).toEqual([users.ic1]);
    await api('ethics2', 'get', `/cases/${co.id}`).expect(404);
    const mine = (await api('ethics2', 'get', '/ic').expect(200)).body.members;
    expect(mine.map((m: { committee: string }) => m.committee)).toEqual(['Hosur plant', 'Hosur plant']);
    const both = (await api('ic1', 'get', '/ic').expect(200)).body.members;
    expect(new Set(both.map((m: { committee: string }) => m.committee))).toEqual(new Set(['Whole company', 'Hosur plant']));
    // Leave only the company committee for the tests after this one.
    for (const m of setup.members.filter((x: { team: string; locationId: string | null }) => x.team === 'ic' && x.locationId === loc)) await api('adminA', 'post', `/setup/members/${m.id}/remove`).expect(201);
  });

  it('answer 2597: a POSH complaint keeps on whose behalf, why late and conciliation in their own fields; other kinds refuse them', async () => {
    const posh = { kind: 'posh', summary: 'Unwelcome remarks at the team offsite dinner.', happenedOn: shift(-120) };
    await api('divya', 'post', '/reports').send({ ...REPORT, conciliation: true }).expect(400);
    await api('divya', 'post', '/reports').send({ ...REPORT, lateReason: 'Was away.' }).expect(400);
    await api('divya', 'post', '/reports').send({ ...posh, onBehalfName: 'Meena' }).expect(400);
    await api('divya', 'post', '/reports').send({ ...posh, onBehalfRelation: 'Sister' }).expect(400);
    await api('divya', 'post', '/reports').send({ ...posh, conciliation: 'yes' }).expect(400);
    await api('divya', 'post', '/reports').send({ ...posh, lateReason: 'x'.repeat(1001) }).expect(400);
    const r = (await api('divya', 'post', '/reports').send({ ...posh, onBehalfName: 'Meena', onBehalfRelation: 'Sister', lateReason: 'She was on medical leave for two months.', conciliation: true }).expect(201)).body;
    const detail = (await request(server()).get(`/api/v1/desk/cases/${r.id}`).set('Authorization', `Bearer ${token.ic1}`).expect(200)).body;
    expect(detail.report).toMatchObject({ summary: posh.summary, onBehalf: { name: 'Meena', relation: 'Sister' }, lateReason: 'She was on medical leave for two months.', conciliation: true, late: true });
    const plain = (await api('divya', 'post', '/reports').send(posh).expect(201)).body;
    expect((await request(server()).get(`/api/v1/desk/cases/${plain.id}`).set('Authorization', `Bearer ${token.ic1}`).expect(200)).body.report).toMatchObject({ onBehalf: null, lateReason: null, conciliation: false });
  });

  it('CMP-11 (batch F item 13): the Internal Committee console is for its members only; their POSH complaints carry the filing day; the menu count too', async () => {
    const ic = (await api('ic1', 'get', '/ic').expect(200)).body;
    expect(ic.company).toBe('HLP06 Org A');
    expect(ic.members).toEqual([expect.objectContaining({ role: 'presiding', name: `ic1 ${run}`, since: today, woman: true, termEndsOn: IC.termEndsOn })]);
    for (const who of ['divya', 'hr', 'adminA', 'ethics1', 'adminB'] as const) await api(who, 'get', '/ic').expect(404);
    const rows = (await request(server()).get('/api/v1/desk/cases').set('Authorization', `Bearer ${token.ic1}`).expect(200)).body as { kind: string; ref: string; filedOn: string }[];
    expect(rows.find((c) => c.ref === 'POSH-0001')).toMatchObject({ kind: 'posh', filedOn: today });
    const counts = (who: Who) => request(server()).get('/api/v1/workspace/counts').set('Authorization', `Bearer ${token[who]}`).expect(200).then((r) => r.body);
    expect((await counts('ic1')).icComplaints).toBe(5); // POSH-0001, two from the answer 2592 test, two from 2597
    expect((await counts('divya')).icComplaints).toBeUndefined();
    expect((await counts('ethics1')).icComplaints).toBeUndefined();
  });

  it('answer 2593: committee members log awareness sessions; the presiding officer moves the annual report on step by step; nobody else sees or changes either', async () => {
    const year = Number(today.slice(0, 4));
    const ic = (body: object, who: Who = 'ic1') => api(who, 'post', '/ic/awareness').send(body);
    // Outsiders: not found. Bad input: 400.
    for (const who of ['divya', 'hr', 'adminA', 'ethics1', 'adminB'] as const) await ic({ heldOn: today, title: 'Session', attended: 5 }, who).expect(404);
    await ic({ heldOn: shift(1), title: 'Future session', attended: 5 }).expect(400);
    await ic({ heldOn: today, title: 'ab', attended: 5 }).expect(400);
    await ic({ heldOn: today, title: 'Session', attended: -1 }).expect(400);
    await ic({ heldOn: today, title: 'Session', attended: 5, extra: 1 }).expect(400);
    await ic({ heldOn: today, title: 'POSH awareness for new joiners', audience: 'New joiners', attended: 34 }).expect(201);
    const view = (await api('ic1', 'get', '/ic').expect(200)).body;
    expect(view.awareness).toEqual([expect.objectContaining({ committeeId: null, heldOn: today, title: 'POSH awareness for new joiners', audience: 'New joiners', attended: 34 })]);
    expect(view.reports).toEqual([expect.objectContaining({ committeeId: null, committee: 'Whole company', year, dueOn: `${year + 1}-01-31`, sessions: 1, stage: 'draft', presiding: true, actionTaken: null })]);
    expect(view.reports[0].received).toBeGreaterThanOrEqual(1);
    // The database hides both tables from someone not on the committee, even inside the company.
    const asDivya = await tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false, userId: users.divya } as never, (tx) => tx.poshAwarenessSession.count());
    expect(asDivya).toBe(0);
    // The report: only the presiding officer, one step at a time, "reviewed" needs the action taken.
    const step = (body: object, who: Who = 'ic1') => api(who, 'post', '/ic/report').send({ year, ...body });
    await step({ step: 'reviewed', actionTaken: 'None' }, 'divya').expect(404);
    await step({ step: 'employer' }).expect(409);
    await step({ step: 'reviewed' }).expect(400);
    await step({ step: 'reviewed', actionTaken: 'None' }, 'ethics1').expect(404);
    await step({ step: 'reviewed', actionTaken: '1 transfer', year: year - 3 }).expect(400);
    await step({ step: 'signed' }).expect(400);
    // A member who does not preside: 403, and nothing changes.
    const m = (await api('adminA', 'post', '/setup/members').send({ team: 'ic', userId: users.chair, ...IC }).expect(201)).body;
    expect((await step({ step: 'reviewed', actionTaken: 'None' }, 'chair').expect(403)).body.code).toBe('POSH_NOT_PRESIDING');
    await api('adminA', 'post', `/setup/members/${m.id}/remove`).expect(201);
    await step({ step: 'reviewed', actionTaken: '1 transfer' }).expect(201);
    await step({ step: 'reviewed', actionTaken: '1 transfer' }).expect(409);
    await step({ step: 'employer' }).expect(201);
    await step({ step: 'district' }).expect(201);
    expect((await api('ic1', 'get', '/ic').expect(200)).body.reports[0]).toMatchObject({ stage: 'district', actionTaken: '1 transfer' });
    const logs = await inA((tx) => tx.auditLog.findMany({ where: { action: { in: ['posh.awareness_logged', 'posh.annual_report_step'] } }, select: { action: true } }));
    expect(logs.filter((l) => l.action === 'posh.annual_report_step')).toHaveLength(3);
  });

  it('check my report: wrong codes are counted; the right code shows the team reply; the reporter replies; files attach', async () => {
    await clearTries();
    const wrong = (await pub('/check').send({ org: org.A.slug, code: 'AAAA-BBBB-CCCC-DDDD' }).expect(404)).body;
    expect(wrong).toMatchObject({ code: 'SPEAKUP_WRONG_CODE', triesLeft: 4 });
    await api('chair', 'post', `/cases/${ids.anon}/messages`).send({ body: 'Thank you. Please share the GRN numbers.' }).expect(201);
    await api('ethics1', 'post', `/cases/${ids.anon}/messages`).send({ body: 'x' }).expect(404);
    const seen = (await pub('/check').send({ org: org.A.slug, code: ids.code.toLowerCase() }).expect(200)).body;
    expect(seen).toMatchObject({ number: 'WB-0001', messages: [{ from: 'team', text: 'Thank you. Please share the GRN numbers.' }] });
    expect(JSON.stringify(seen)).not.toContain(`chair ${run}`);
    await pub('/check/reply').send({ org: org.A.slug, code: ids.code, body: '' }).expect(400);
    const after = (await pub('/check/reply').send({ org: org.A.slug, code: ids.code, body: 'GRN 4471 and 4472.' }).expect(200)).body;
    expect(after.messages.map((m: { from: string }) => m.from)).toEqual(['team', 'reporter']);
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
    await pub('/check/files').field('org', org.A.slug).field('code', ids.code).attach('file', pdf, 'grn.pdf').expect(201);
    await pub('/check/files').field('org', org.A.slug).field('code', ids.code).attach('file', Buffer.from('MZ'), 'grn.pdf').expect(400);
    const m = await inA((tx) => tx.speakupMessage.findFirstOrThrow({ where: { caseId: ids.anon, sender: 'reporter' } }));
    expect(m.authorUserId).toBeNull();
    await expect(inA((tx) => tx.speakupMessage.update({ where: { id: m.id }, data: { body: 'changed' } }))).rejects.toThrow(/permission denied/);
    await expect(inA((tx) => tx.speakupCase.delete({ where: { id: ids.anon } }))).rejects.toThrow(/permission denied/);
  });

  it('five wrong codes lock the address for the hour, even for the right code', async () => {
    await clearTries();
    for (let i = 0; i < 5; i++) await pub('/check').send({ org: org.A.slug, code: 'AAAA-BBBB-CCCC-DDD' + 'EFGHJ'[i] }).expect(404);
    const locked = (await pub('/check').send({ org: org.A.slug, code: ids.code }).expect(429)).body;
    expect(locked).toMatchObject({ code: 'SPEAKUP_LOCKED' });
    expect(locked.retryAfterSeconds).toBeGreaterThan(0);
    await clearTries();
  });

  it('a named reporter adds a file to their own report; anyone else gets 404', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
    await api('manager', 'post', `/reports/${ids.named}/files`).attach('file', pdf, 'route.pdf').expect(404);
    await api('divya', 'post', `/reports/${ids.named}/files`).attach('file', pdf, 'route.pdf').expect(201);
    expect((await inA((tx) => tx.speakupCase.findFirstOrThrow({ where: { id: ids.named } }))).fileIds).toHaveLength(1);
  });
});
