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
import { WhatsappService } from '../src/whatsapp/whatsapp.service';
import { InterviewDaysService } from '../src/interviewing/interview-days.service';

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
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
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
  type Day = { id: string; status: string; slotMinutes: number; panels: { id: string; name: string; room: string; members: string }[]; rows: { id: string; entryId: string; candidate: string; panelId: string | null; start: number | null; status: string; error: string | null; interviewId: string | null }[] };
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
  // Answer 421: WhatsApp as the company would have it (not connected until a provider is set).
  const waState = { on: false, sent: [] as { to: string; body: string }[] };
  const wa = { set isOn(v: boolean) { waState.on = v; }, sent: waState.sent, connected: jest.fn(async (): Promise<boolean> => waState.on), send: jest.fn(async (m: { to: string; body: string }): Promise<{ success: boolean }> => (waState.sent.push(m), { success: true })) };
  let days: InterviewDaysService;

  beforeAll(async () => {
    const email = { send: jest.fn(async (m: { to: string }) => (sent.push(m.to), { success: !m.to.includes('bounce') })) };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue(email).overrideProvider(WhatsappService).useValue(wa).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    days = moduleRef.get(InterviewDaysService);
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

  it('answer 423: the planner removes single slots (a lunch break); Auto-assign skips them; a sent slot, the last slot and other companies are refused', async () => {
    // A day planned with a gap (no 11:15 slot) is accepted.
    const id = (await api('recruiter', 'post', '/hiring/interview-days').send(body({ name: 'Lunch day', slots: [600, 645, 780], panels: [{ name: 'Panel D', room: 'Room 4', memberUserIds: [users.int3] }] })).expect(want(201))).body.id as string;
    let d = (await api('recruiter', 'post', `/hiring/interview-days/${id}/assign`).expect(want(200))).body as Day & { slots: number[] };
    expect(d.rows.some((r) => r.start === 645)).toBe(true);
    await api('acting', 'delete', `/hiring/interview-days/${id}/slots/645`).expect(403);
    await api('adminB', 'delete', `/hiring/interview-days/${id}/slots/645`).expect(404);
    await api('recruiter', 'delete', `/hiring/interview-days/${id}/slots/700`).expect(404);
    await api('recruiter', 'delete', `/hiring/interview-days/${id}/slots/noon`).expect(400);
    d = (await api('recruiter', 'delete', `/hiring/interview-days/${id}/slots/645`).expect(want(200))).body;
    expect(d.slots).toEqual([600, 780]);
    expect(d.rows.some((r) => r.start === 645)).toBe(false);
    expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'ats.interview_day.slot_removed', entityId: id } }))).toBe(1);
    d = (await api('recruiter', 'post', `/hiring/interview-days/${id}/assign`).expect(want(200))).body;
    expect(d.rows.filter((r) => r.start != null).map((r) => r.start).sort()).toEqual([600, 780]);
    await api('recruiter', 'delete', `/hiring/interview-days/${id}/slots/780`).expect(200);
    expect((await api('recruiter', 'delete', `/hiring/interview-days/${id}/slots/600`).expect(400)).body.message).toMatch(/at least one slot/);
    // The first day's 10:00 interviews were sent: that slot stays.
    expect((await api('recruiter', 'delete', `/hiring/interview-days/${ids.day}/slots/600`).expect(409)).body.message).toMatch(/already sent/);
  });

  it('answer 422: two unsent candidates swap places, audited; a sent one, an unplaced one, another day or company are refused', async () => {
    const id = (await api('recruiter', 'post', '/hiring/interview-days').send(body({ name: 'Swap day', slots: [600, 645], panels: [{ name: 'Panel F', room: 'Room 6', memberUserIds: [users.int1] }, { name: 'Panel G', room: 'Room 7', memberUserIds: [users.int2] }] })).expect(want(201))).body.id as string;
    const d = (await api('recruiter', 'post', `/hiring/interview-days/${id}/assign`).expect(want(200))).body as Day & { rows: { id: string }[] };
    const placed = d.rows.filter((r) => r.panelId && r.start != null);
    const [x, y] = [placed[0]!, placed[placed.length - 1]!];
    await api('acting', 'post', `/hiring/interview-days/${id}/swap`).send({ a: x.id, b: y.id }).expect(403);
    await api('adminB', 'post', `/hiring/interview-days/${id}/swap`).send({ a: x.id, b: y.id }).expect(404);
    await api('recruiter', 'post', `/hiring/interview-days/${id}/swap`).send({ a: x.id, b: x.id }).expect(400);
    await api('recruiter', 'post', `/hiring/interview-days/${id}/swap`).send({ a: x.id, b: 'nope' }).expect(400);
    const after = (await api('recruiter', 'post', `/hiring/interview-days/${id}/swap`).send({ a: x.id, b: y.id }).expect(want(200))).body as Day & { rows: { id: string }[] };
    expect(after.rows.find((r) => r.id === x.id)).toMatchObject({ panelId: y.panelId, start: y.start });
    expect(after.rows.find((r) => r.id === y.id)).toMatchObject({ panelId: x.panelId, start: x.start });
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'ats.interview_day.swapped', entityId: id } }))).toBe(1);
    // The first day: Asha's invite was sent (refused, 409); Dev and someone of another day are not on this day (404).
    const first = (await api('recruiter', 'get', `/hiring/interview-days/${ids.day}`).expect(200)).body as Day & { rows: { id: string }[] };
    const asha = first.rows.find((r) => r.entryId === entries.asha)!;
    const bala = first.rows.find((r) => r.entryId === entries.bala)!;
    expect((await api('recruiter', 'post', `/hiring/interview-days/${ids.day}/swap`).send({ a: asha.id, b: bala.id }).expect(409)).body.message).toMatch(/already sent/);
    await api('recruiter', 'post', `/hiring/interview-days/${id}/swap`).send({ a: x.id, b: asha.id }).expect(404);
    // Someone without a place cannot swap.
    const waiting = after.rows.find((r) => r.panelId == null);
    if (waiting) await api('recruiter', 'post', `/hiring/interview-days/${id}/swap`).send({ a: x.id, b: waiting.id }).expect(400);
  });

  it('answer 421: WhatsApp reminders 2 hours before each slot: on by the company default; not connected is recorded, never silent; only to those who opted in; once', async () => {
    const d = (await api('recruiter', 'get', `/hiring/interview-days/${ids.day}`).expect(200)).body;
    expect(d.reminders).toEqual({ on: true, connected: false });
    // 08:30 in India on the day: the 10:00 slot is due (Asha and Bala were sent invites there).
    const at0830 = new Date(`${tomorrow}T03:00:00Z`);
    expect(await days.remindersDue(at0830)).toBe(0);
    let rows = await inA((tx) => tx.interviewDayRow.findMany({ where: { dayId: ids.day, pipelineEntryId: { in: [entries.asha, entries.bala] } } }));
    expect(rows.map((r) => r.reminderStatus)).toEqual(['not_connected', 'not_connected']);
    expect(wa.send).not.toHaveBeenCalled();
    // Connected: only Asha opted in (with a mobile number); Bala did not.
    wa.isOn = true;
    await inA(async (tx) => {
      await tx.interviewDayRow.updateMany({ where: { dayId: ids.day }, data: { reminderStatus: null, reminderAt: null } });
      const e = await tx.pipelineEntry.findUniqueOrThrow({ where: { id: entries.asha } });
      await tx.candidate.update({ where: { id: e.candidateId }, data: { phone: '+919811044319', whatsappOptedInAt: new Date() } });
      const f = await tx.pipelineEntry.findUniqueOrThrow({ where: { id: entries.bala } });
      await tx.candidate.update({ where: { id: f.candidateId }, data: { phone: '+919811044320' } });
    });
    expect((await api('recruiter', 'get', `/hiring/interview-days/${ids.day}`).expect(200)).body.reminders.connected).toBe(true);
    expect(await days.remindersDue(at0830)).toBe(1);
    expect(wa.sent).toEqual([{ to: '+919811044319', body: expect.stringMatching(/^Reminder: your interview for .* is today at 10:00, Training room 1\./), organizationId: org.A.id }]);
    rows = await inA((tx) => tx.interviewDayRow.findMany({ where: { dayId: ids.day, pipelineEntryId: { in: [entries.asha, entries.bala] } }, orderBy: { slotStart: 'asc' } }));
    expect(Object.fromEntries(rows.map((r) => [r.pipelineEntryId === entries.asha ? 'asha' : 'bala', r.reminderStatus]))).toEqual({ asha: 'sent', bala: 'not_opted_in' });
    // Once: a second run sends nothing; too early (07:00) nothing is due.
    expect(await days.remindersDue(at0830)).toBe(0);
    expect(wa.send).toHaveBeenCalledTimes(1);
    expect((await api('recruiter', 'get', `/hiring/interview-days/${ids.day}`).expect(200)).body.rows.find((r: { entryId: string }) => r.entryId === entries.asha).reminder).toBe('sent');
    // The switch: off by the planner; acting 403, another company 404, bad input 400; a day with it off sends nothing.
    await api('acting', 'post', `/hiring/interview-days/${ids.day}/reminders`).send({ on: false }).expect(403);
    await api('adminB', 'post', `/hiring/interview-days/${ids.day}/reminders`).send({ on: false }).expect(404);
    await api('recruiter', 'post', `/hiring/interview-days/${ids.day}/reminders`).send({ on: 'no' }).expect(400);
    expect((await api('recruiter', 'post', `/hiring/interview-days/${ids.day}/reminders`).send({ on: false }).expect(want(200))).body.reminders.on).toBe(false);
    await inA((tx) => tx.interviewDayRow.updateMany({ where: { dayId: ids.day }, data: { reminderStatus: null, reminderAt: null } }));
    expect(await days.remindersDue(at0830)).toBe(0);
    expect(wa.send).toHaveBeenCalledTimes(1);
    // The company default off: a new day starts with reminders off.
    await setting('hiring.interview_day.whatsapp_reminders', 'off');
    const quiet = (await api('recruiter', 'post', '/hiring/interview-days').send(body({ name: 'Quiet day', panels: [{ name: 'Panel H', room: 'Room 8', memberUserIds: [users.int3] }] })).expect(want(201))).body.id;
    expect((await api('recruiter', 'get', `/hiring/interview-days/${quiet}`).expect(200)).body.reminders.on).toBe(false);
  });
});
