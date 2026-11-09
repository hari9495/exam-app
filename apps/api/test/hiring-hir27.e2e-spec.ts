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

// HIR-27 bulk interview day end to end (docs/yukthix/hiring-design-map.md): recruiting plans a day (panels, rooms,
// slots), Auto-assign places the job's candidates of one stage by the company setting, and Send makes each candidate an
// ordinary HIR-06 interview (panel, scorecard, invite emails) on its own: a bad row is recorded and never blocks the
// others, a sent row is never sent twice, a retry reuses the interview already made. Another company gets 404, an
// employee 403, acting for someone else 403, bad input 400.

jest.setTimeout(240_000);

describe('Hiring HIR-27 bulk interview day', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'admin2' | 'recruiter' | 'int1' | 'int2' | 'int3' | 'emp' | 'adminB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const entries: Record<string, string> = {};
  const sent: string[] = [];
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const setting = (key: string, value: string) =>
    inA(async (tx) => {
      const where = { organizationId: org.A.id, key, scopeType: 'tenant', scopeId: org.A.id };
      const found = await tx.setting.findFirst({ where });
      return found ? tx.setting.update({ where: { id: found.id }, data: { value } }) : tx.setting.create({ data: { ...where, value } });
    });
  // Tomorrow in India; slots at 10:00 and 10:45.
  const tomorrow = new Date(Date.now() + 330 * 60_000 + 86_400_000).toISOString().slice(0, 10);
  type Day = { id: string; status: string; slotMinutes: number; panels: { id: string; name: string; room: string; members: string }[]; rows: { entryId: string; candidate: string; panelId: string | null; start: number | null; status: string; error: string | null; interviewId: string | null }[] };
  const body = (over: Record<string, unknown> = {}) => ({
    name: 'GET 2027 · Hosur campus',
    jobId: ids.job,
    stageId: ids.stage,
    day: tomorrow,
    slots: [600, 645],
    panels: [
      { name: 'Panel A', room: 'Training room 1', memberUserIds: [users.int1, users.int2] },
      { name: 'Panel B', room: 'Board room', memberUserIds: [users.int3] },
    ],
    ...over,
  });
  const rowOf = (d: Day, who: string) => d.rows.find((r) => r.entryId === entries[who])!;

  beforeAll(async () => {
    const email = { send: jest.fn(async (m: { to: string }) => (sent.push(m.to), { success: !m.to.includes('bounce') })) };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue(email).compile();
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

    planId = (await prisma.plan.create({ data: { name: `hir27-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HIR27 Org ${k}`, slug: `hir27-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['admin2', 'A', 'recruiter', null],
      ['recruiter', 'A', 'panel', ['ats.job.manage', 'ats.candidate.manage']],
      ['int1', 'A', 'panel', ['ats.interview.schedule']],
      ['int2', 'A', 'panel', ['ats.interview.schedule']],
      ['int3', 'A', 'panel', ['ats.interview.schedule']],
      ['emp', 'A', 'panel', []],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hir27-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hir27-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    // Acting for a recruiter whose role holds every key used here, so only the acting rule can refuse.
    await inA((tx) => tx.orgRolePermission.create({ data: { organizationId: org.A.id, role: 'recruiter', permissionsJson: JSON.stringify(['pipeline:manage', 'interview:view_assigned', 'results:view', 'candidate:manage', 'candidate:view']) } }));
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.admin2}`).expect(200)).body.accessToken;

    ids.job = (await api('admin', 'post', '/jobs').send({ title: 'Graduate Engineer Trainee' }).expect(201)).body.id;
    ids.jobB = (await api('adminB', 'post', '/jobs').send({ title: 'Other company job' }).expect(201)).body.id;
    const t = (await api('admin', 'post', '/hiring/scorecard-templates').send({ name: 'GET panel', scaleMax: 4, passBar: 2.5, items: [{ label: 'Aptitude', weight: 60 }, { label: 'Communication', weight: 40 }] }).expect(want(201))).body;
    ids.template = t.id;
    await api('recruiter', 'put', `/hiring/jobs/${ids.job}/scorecard`).send({ templateId: ids.template }).expect(want(200));
    for (const who of ['asha', 'bala', 'chitra', 'bounce', 'dev', 'erased'])
      entries[who] = (await api('admin', 'post', `/jobs/${ids.job}/entries`).send({ newCandidate: { name: `${who[0]!.toUpperCase()}${who.slice(1)} ${run}`, email: `${who}-${run}@x.test` } }).expect(201)).body.id;
    // Oldest in the stage first: asha, bala, chitra, bounce, dev.
    await inA(async (tx) => {
      const base = Date.now() - 10 * 86_400_000;
      for (const [i, who] of ['asha', 'bala', 'chitra', 'bounce', 'dev', 'erased'].entries()) await tx.pipelineEntry.update({ where: { id: entries[who] }, data: { stageEnteredAt: new Date(base + i * 60_000) } });
      const e = await tx.pipelineEntry.findUniqueOrThrow({ where: { id: entries.erased }, include: { status: true } });
      await tx.candidate.update({ where: { id: e.candidateId }, data: { erasedAt: new Date() } });
      ids.stage = e.status!.stageId;
    });
  });

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users) as string[];
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('plans a day: options, then panels, rooms and slots with the company slot length; bad input 400; acting, employee 403; other company 404', async () => {
    const opts = (await api('recruiter', 'get', '/hiring/interview-days/options').expect(want(200))).body as { jobs: { value: string; stages: { value: string }[] }[]; people: { value: string }[]; slotMinutes: number };
    expect(opts.slotMinutes).toBe(45);
    expect(opts.jobs.find((j) => j.value === ids.job)!.stages.map((s) => s.value)).toContain(ids.stage);
    expect(opts.jobs.map((j) => j.value)).not.toContain(ids.jobB);
    await api('emp', 'get', '/hiring/interview-days/options').expect(403);
    await api('acting', 'post', '/hiring/interview-days').send(body()).expect(403);
    await api('emp', 'post', '/hiring/interview-days').send(body()).expect(403);
    // Bad input: nothing is made.
    const bad: Record<string, unknown>[] = [
      { panels: [] },
      { slots: [] },
      { slots: [600, 630] }, // overlap at 45 minutes
      { slots: [1430] }, // past midnight
      { day: '2020-01-01' },
      { day: '14-11-2026' },
      { stageId: randomUUID() },
      { panels: [{ name: 'Panel A', room: 'Room 1', memberUserIds: [users.int1] }, { name: 'Panel B', room: 'Room 2', memberUserIds: [users.int1] }] },
      { panels: [{ name: 'Panel A', room: 'Room 1', memberUserIds: [users.adminB] }] },
      { panels: [{ name: ' ', room: 'Room 1', memberUserIds: [users.int1] }] },
      { timeZone: 'Mars/Base' },
      { extra: 1 },
    ];
    for (const b of bad) await api('recruiter', 'post', '/hiring/interview-days').send(body(b)).expect(400);
    await api('recruiter', 'post', '/hiring/interview-days').send(body({ jobId: ids.jobB })).expect(404);
    await api('adminB', 'post', '/hiring/interview-days').send(body()).expect(404);
    expect(await inA((tx) => tx.interviewDay.count({ where: { organizationId: org.A.id } }))).toBe(0);
    ids.day = (await api('recruiter', 'post', '/hiring/interview-days').send(body()).expect(want(201))).body.id;
    const d = (await api('recruiter', 'get', `/hiring/interview-days/${ids.day}`).expect(want(200))).body as Day;
    expect(d).toMatchObject({ status: 'draft', slotMinutes: 45, rows: [], panels: [{ name: 'Panel A', room: 'Training room 1', members: `int1 ${run}, int2 ${run}` }, { name: 'Panel B', room: 'Board room' }] });
    expect((await api('recruiter', 'get', '/hiring/interview-days').expect(200)).body).toEqual([expect.objectContaining({ id: ids.day, jobTitle: 'Graduate Engineer Trainee', status: 'draft' })]);
    await api('adminB', 'get', `/hiring/interview-days/${ids.day}`).expect(404);
    expect((await api('adminB', 'get', '/hiring/interview-days').expect(200)).body).toEqual([]);
    await api('emp', 'get', `/hiring/interview-days/${ids.day}`).expect(403);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'ats.interview_day.created', entityId: ids.day } }))).toBe(1);
  });

  it('Auto-assign: the stage’s candidates, oldest first, earliest slots across panels; over capacity waits; erased never; by panel follows the setting', async () => {
    await api('acting', 'post', `/hiring/interview-days/${ids.day}/assign`).expect(403);
    await api('adminB', 'post', `/hiring/interview-days/${ids.day}/assign`).expect(404);
    let d = (await api('recruiter', 'post', `/hiring/interview-days/${ids.day}/assign`).expect(want(200))).body as Day;
    const [pa, pb] = d.panels.map((p) => p.id);
    expect(d.rows.map((r) => [r.candidate.split(' ')[0], r.panelId, r.start, r.status])).toEqual([
      ['Asha', pa, 600, 'assigned'],
      ['Bala', pb, 600, 'assigned'],
      ['Bounce', pb, 645, 'assigned'],
      ['Chitra', pa, 645, 'assigned'],
      ['Dev', null, null, 'unassigned'],
    ]);
    expect(d.rows.map((r) => r.entryId)).not.toContain(entries.erased);
    // The company's other choice: one panel at a time. Re-assigning places everyone again.
    await setting('hiring.interview_day.assign', 'by_panel');
    d = (await api('recruiter', 'post', `/hiring/interview-days/${ids.day}/assign`).expect(want(200))).body as Day;
    expect([rowOf(d, 'asha'), rowOf(d, 'bala'), rowOf(d, 'chitra'), rowOf(d, 'bounce')].map((r) => [r.panelId, r.start])).toEqual([[pa, 600], [pa, 645], [pb, 600], [pb, 645]]);
    await setting('hiring.interview_day.assign', 'by_slot');
    d = (await api('recruiter', 'post', `/hiring/interview-days/${ids.day}/assign`).expect(want(200))).body as Day;
    expect(rowOf(d, 'bala')).toMatchObject({ panelId: pb, start: 600 });
  });

  it('Send: each row is its own HIR-06 interview; a bounced email and a rejected candidate fail alone; nothing is sent twice; a retry reuses the interview', async () => {
    // Chitra is rejected after being placed: her row fails, the others still go.
    await inA((tx) => tx.pipelineEntry.update({ where: { id: entries.chitra }, data: { rejected: true } }));
    await api('acting', 'post', `/hiring/interview-days/${ids.day}/send`).expect(403);
    await api('adminB', 'post', `/hiring/interview-days/${ids.day}/send`).expect(404);
    await api('emp', 'post', `/hiring/interview-days/${ids.day}/send`).expect(403);
    const first = (await api('recruiter', 'post', `/hiring/interview-days/${ids.day}/send`).expect(want(200))).body as { sent: number; failed: number; day: Day };
    expect(first).toMatchObject({ sent: 2, failed: 2 });
    const d = first.day;
    expect(d.status).toBe('sent');
    expect(rowOf(d, 'asha')).toMatchObject({ status: 'sent', error: null, interviewId: expect.any(String) });
    expect(rowOf(d, 'bala')).toMatchObject({ status: 'sent' });
    expect(rowOf(d, 'bounce')).toMatchObject({ status: 'failed', error: 'The invite email did not go. Send again.', interviewId: expect.any(String) });
    expect(rowOf(d, 'chitra')).toMatchObject({ status: 'failed', error: expect.stringMatching(/No longer in the hiring process/), interviewId: null });
    expect(rowOf(d, 'dev')).toMatchObject({ status: 'unassigned', interviewId: null });
    // The same rules as a single interview: the panel as panellists, the room, the job's scorecard, India time, the invite.
    const iv = await inA((tx) => tx.interview.findUniqueOrThrow({ where: { id: rowOf(d, 'asha').interviewId! }, include: { panelists: true, slots: true } }));
    expect(iv).toMatchObject({ pipelineEntryId: entries.asha, location: 'Training room 1', timeZone: 'Asia/Kolkata', scorecardTemplateId: ids.template, status: 'proposed', sentAt: expect.any(Date) });
    expect(iv.panelists.map((p) => p.userId).sort()).toEqual([users.int1, users.int2].sort());
    expect(iv.slots.map((s) => [s.startsAt.toISOString(), s.endsAt.toISOString()])).toEqual([[`${tomorrow}T04:30:00.000Z`, `${tomorrow}T05:15:00.000Z`]]);
    expect(sent).toEqual(expect.arrayContaining([`asha-${run}@x.test`, `int1@hir27-${run}.test`, `int2@hir27-${run}.test`, `bala-${run}@x.test`, `int3@hir27-${run}.test`]));
    expect(sent).not.toContain(`chitra-${run}@x.test`);
    expect(sent).not.toContain(`dev-${run}@x.test`);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'interview.invited' } }))).toBe(2);
    // Send again: only the failed rows are tried; sent rows never go twice; the bounced row keeps its one interview.
    sent.length = 0;
    const again = (await api('recruiter', 'post', `/hiring/interview-days/${ids.day}/send`).expect(want(200))).body as { sent: number; failed: number; day: Day };
    expect(again).toMatchObject({ sent: 0, failed: 2 });
    // As a single resend (HIR-06): the candidate again, and the panel is reminded.
    expect(sent).toEqual([`bounce-${run}@x.test`, `int3@hir27-${run}.test`]);
    for (const who of ['asha', 'bala', 'bounce']) expect(await inA((tx) => tx.interview.count({ where: { pipelineEntryId: entries[who] } }))).toBe(1);
    expect(await inA((tx) => tx.interview.count({ where: { pipelineEntryId: entries.chitra } }))).toBe(0);
    // Re-assigning keeps every row that became an interview in its place.
    const re = (await api('recruiter', 'post', `/hiring/interview-days/${ids.day}/assign`).expect(want(200))).body as Day;
    for (const who of ['asha', 'bala', 'bounce']) expect(rowOf(re, who)).toMatchObject({ panelId: rowOf(d, who).panelId, start: rowOf(d, who).start });
    // Chitra left the stage (rejected): dropped; Dev now gets her free cell.
    expect(re.rows.map((r) => r.entryId)).not.toContain(entries.chitra);
    expect(rowOf(re, 'dev')).toMatchObject({ status: 'assigned', panelId: rowOf(d, 'chitra').panelId, start: rowOf(d, 'chitra').start });
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'ats.interview_day.sent', entityId: ids.day } }))).toBe(2);
  });

  it('a send already running is refused (409), never doubled; an old claim is taken over', async () => {
    await inA((tx) => tx.interviewDay.update({ where: { id: ids.day }, data: { sendingAt: new Date() } }));
    expect((await api('recruiter', 'post', `/hiring/interview-days/${ids.day}/send`).expect(409)).body.message).toMatch(/already being sent/);
    await api('recruiter', 'post', `/hiring/interview-days/${ids.day}/assign`).expect(409);
    expect((await api('recruiter', 'get', `/hiring/interview-days/${ids.day}`).expect(200)).body.sending).toBe(true);
    await inA((tx) => tx.interviewDay.update({ where: { id: ids.day }, data: { sendingAt: new Date(Date.now() - 11 * 60_000) } }));
    const r = (await api('recruiter', 'post', `/hiring/interview-days/${ids.day}/send`).expect(want(200))).body as { sent: number; failed: number };
    expect(r.sent).toBe(1); // Dev
    expect((await api('recruiter', 'get', `/hiring/interview-days/${ids.day}`).expect(200)).body.sending).toBe(false);
  });

  it('nobody to send is 400; the slot length setting shapes new days (60 minutes)', async () => {
    await setting('hiring.interview_day.slot_minutes', '60');
    const other = (await api('recruiter', 'post', '/hiring/interview-days').send(body({ name: 'Second day', slots: [600, 660], panels: [{ name: 'Panel C', room: 'Room 3', memberUserIds: [users.int3] }] })).expect(want(201))).body.id;
    expect((await api('recruiter', 'get', `/hiring/interview-days/${other}`).expect(200)).body.slotMinutes).toBe(60);
    await api('recruiter', 'post', '/hiring/interview-days').send(body({ slots: [600, 645] })).expect(400); // 60-minute slots overlap
    expect((await api('recruiter', 'post', `/hiring/interview-days/${other}/send`).expect(400)).body.message).toMatch(/Nobody is waiting/);
    await api('recruiter', 'post', `/hiring/interview-days/${randomUUID()}/send`).expect(404);
    await api('recruiter', 'get', '/hiring/interview-days/not-a-uuid').expect(400);
    await setting('hiring.interview_day.slot_minutes', '45');
  });
});
