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

// HIR-04 pipeline board, end to end against the real database (forced RLS, the app role). Positive and negative: a
// recruiter moves and rejects (reason required, audited, the candidate is not emailed unless the company setting
// hiring.reject.email_candidate is on); a repeat and an out-of-date card are refused (409); a hiring manager reads the
// board but cannot move (decision 11); an employee gets 403, another company 404; acting for someone else is refused;
// bad input 400.
describe('HIR-04 pipeline board', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const send = jest.fn(async () => ({ success: true }));
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'hr' | 'rec' | 'hm' | 'emp' | 'hrB' | 'acting';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const st: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const statusOf = async (entryId: string) => (await inA((tx) => tx.pipelineEntry.findUniqueOrThrow({ where: { id: entryId } }))).statusId as string;
  const add = async (name: string) => {
    await api('rec', 'post', `/jobs/${ids.job}/entries`).send({ newCandidate: { name, email: `${name.toLowerCase().replace(/\s/g, '.')}-${run}@x.test` } }).expect(201);
    const e = await inA((tx) => tx.pipelineEntry.findFirstOrThrow({ where: { jobId: ids.job, candidate: { name } } }));
    return e.id;
  };
  const candidateMails = () => (send.mock.calls as unknown as [{ to?: string }][]).filter(([m]) => String(m?.to ?? '').endsWith(`-${run}@x.test`));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send }).compile();
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

    planId = (await prisma.plan.create({ data: { name: `hir04-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HIR04 Org ${k}`, slug: `hir04-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['hr', 'A', 'org_admin', null],
      ['rec', 'A', 'recruiter', null],
      ['hm', 'A', 'panel', ['results:view']],
      ['emp', 'A', 'panel', []],
      ['hrB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hir04-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hir04-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    ids.job = (await api('rec', 'post', '/jobs').send({ title: `Plant Engineer ${run}` }).expect(201)).body.id;
    const board = (await api('rec', 'get', `/hiring/jobs/${ids.job}/board`).expect(200)).body as { pipeline: { stages: { name: string; category: string; statuses: { id: string }[] }[] } };
    const active = board.pipeline.stages.filter((s) => s.category === 'active');
    st.first = active[0].statuses[0].id;
    st.second = active[1].statuses[0].id;
    st.rejected = board.pipeline.stages.find((s) => s.category === 'rejected')!.statuses[0].id;
    ids.priya = await add('Priya Raman');
    ids.arun = await add('Arun Kumar');
    ids.meena = await add('Meena Iyer');
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('a recruiter moves a card with its status; the move is audited', async () => {
    expect(await statusOf(ids.priya)).toBe(st.first);
    await api('rec', 'post', `/hiring/entries/${ids.priya}/move`).send({ statusId: st.second, fromStatusId: st.first }).expect(200);
    expect(await statusOf(ids.priya)).toBe(st.second);
    const log = await inA((tx) => tx.auditLog.findFirst({ where: { action: 'entry.stage_changed', entityId: ids.priya } }));
    expect(log?.actorUserId).toBe(users.rec);
    const b = (await api('rec', 'get', `/hiring/jobs/${ids.job}/board`).expect(200)).body as { columns: Record<string, { entryId: string; statusId: string }[]> };
    expect(Object.values(b.columns).flat().find((r) => r.entryId === ids.priya)?.statusId).toBe(st.second);
  });

  it('the same move twice is refused (already moved); an out-of-date card is refused (someone moved first)', async () => {
    await api('rec', 'post', `/hiring/entries/${ids.priya}/move`).send({ statusId: st.second, fromStatusId: st.first }).expect(409).expect((r) => expect(r.body.message).toMatch(/Already moved/));
    // HR moves Arun first; the recruiter's card still shows the first stage.
    await api('hr', 'post', `/hiring/entries/${ids.arun}/move`).send({ statusId: st.second, fromStatusId: st.first }).expect(200);
    await api('rec', 'post', `/hiring/entries/${ids.arun}/move`).send({ statusId: st.first, fromStatusId: st.first }).expect(409).expect((r) => expect(r.body.message).toMatch(/out of date/));
    expect(await statusOf(ids.arun)).toBe(st.second);
    // Two people at once: exactly one move lands.
    const both = await Promise.all([st.first, st.first].map(() => api('rec', 'post', `/hiring/entries/${ids.arun}/move`).send({ statusId: st.first, fromStatusId: st.second })));
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('moving into Rejected must go through Reject (a reason); rejecting needs a reason', async () => {
    await api('rec', 'post', `/hiring/entries/${ids.meena}/move`).send({ statusId: st.rejected, fromStatusId: st.first }).expect(400).expect((r) => expect(r.body.message).toMatch(/Use Reject/));
    await api('rec', 'post', `/hiring/entries/${ids.meena}/reject`).send({ fromStatusId: st.first }).expect(400).expect((r) => expect(r.body.message).toMatch(/Enter a reason/));
    await api('rec', 'post', `/hiring/entries/${ids.meena}/reject`).send({ reason: '   ', fromStatusId: st.first }).expect(400);
    expect(await statusOf(ids.meena)).toBe(st.first);
  });

  it('reject with a reason: no candidate email by default; undo works; a repeat and a stale card are refused', async () => {
    send.mockClear();
    const r = (await api('rec', 'post', `/hiring/entries/${ids.meena}/reject`).send({ reason: 'Needs night-shift experience', fromStatusId: st.first }).expect(200)).body;
    expect(r).toMatchObject({ rejected: true, emailing: false });
    const e = await inA((tx) => tx.pipelineEntry.findUniqueOrThrow({ where: { id: ids.meena } }));
    expect(e).toMatchObject({ rejected: true, rejectedReason: 'Needs night-shift experience', statusId: st.rejected });
    const pending = await inA((tx) => tx.pendingRejection.findFirstOrThrow({ where: { entryId: ids.meena } }));
    expect(pending.body).toBeNull();
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'entry.rejected', entityId: ids.meena } }))).toBe(1);
    await api('rec', 'post', `/hiring/entries/${ids.meena}/reject`).send({ reason: 'again', fromStatusId: st.first }).expect(409);
    expect(candidateMails()).toEqual([]);
    await api('rec', 'post', `/hiring/entries/${ids.meena}/reject/undo`).expect(200);
    expect(await statusOf(ids.meena)).toBe(st.first);
    // Stale: the card still shows the second stage.
    await api('rec', 'post', `/hiring/entries/${ids.meena}/reject`).send({ reason: 'Not now', fromStatusId: st.second }).expect(409).expect((r2) => expect(r2.body.message).toMatch(/out of date/));
    expect((await inA((tx) => tx.pipelineEntry.findUniqueOrThrow({ where: { id: ids.meena } }))).rejected).toBe(false);
  });

  it('with the company setting on, the Rejected template waits 24 hours; moving them back cancels it', async () => {
    await inA((tx) => tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key: 'hiring.reject.email_candidate', value: 'on' } }));
    const r = (await api('rec', 'post', `/hiring/entries/${ids.meena}/reject`).send({ reason: 'Role filled', fromStatusId: st.first }).expect(200)).body;
    expect(r).toMatchObject({ rejected: true, emailing: true, messageSentAt: null });
    expect(Date.parse(r.undoUntil) - Date.now()).toBeGreaterThan(23 * 3_600_000);
    const pending = await inA((tx) => tx.pendingRejection.findFirstOrThrow({ where: { entryId: ids.meena, undoneAt: null } }));
    expect(pending.subject).toBeTruthy();
    expect(pending.body).toBeTruthy();
    await api('rec', 'post', `/hiring/entries/${ids.meena}/move`).send({ statusId: st.second, fromStatusId: st.rejected }).expect(200);
    expect((await inA((tx) => tx.pendingRejection.findUniqueOrThrow({ where: { id: pending.id } }))).undoneAt).not.toBeNull();
    expect((await inA((tx) => tx.pipelineEntry.findUniqueOrThrow({ where: { id: ids.meena } }))).rejected).toBe(false);
    await inA((tx) => tx.setting.deleteMany({ where: { organizationId: org.A.id, key: 'hiring.reject.email_candidate' } }));
  });

  it('a hiring manager reads the board but cannot move, reject or undo', async () => {
    await api('hm', 'get', `/hiring/jobs/${ids.job}/board`).expect(200);
    await api('hm', 'post', `/hiring/entries/${ids.priya}/move`).send({ statusId: st.first, fromStatusId: st.second }).expect(403);
    await api('hm', 'post', `/hiring/entries/${ids.priya}/reject`).send({ reason: 'x', fromStatusId: st.second }).expect(403);
    await api('hm', 'post', `/hiring/entries/${ids.priya}/reject/undo`).expect(403);
    await api('hm', 'post', '/hiring/entries/bulk').send({ entryIds: [ids.priya], action: 'move', statusId: st.first }).expect(403);
    expect(await statusOf(ids.priya)).toBe(st.second);
  });

  it('an employee gets 403; another company gets 404 and an empty view', async () => {
    await api('emp', 'get', `/hiring/jobs/${ids.job}/board`).expect(403);
    await api('emp', 'post', `/hiring/entries/${ids.priya}/move`).send({ statusId: st.first, fromStatusId: st.second }).expect(403);
    await api('hrB', 'get', `/hiring/jobs/${ids.job}/board`).expect(404);
    await api('hrB', 'post', `/hiring/entries/${ids.priya}/move`).send({ statusId: st.first, fromStatusId: st.second }).expect(404);
    await api('hrB', 'post', `/hiring/entries/${ids.priya}/reject`).send({ reason: 'x', fromStatusId: st.second }).expect(404);
    expect(await statusOf(ids.priya)).toBe(st.second);
  });

  it('acting for someone else: the board reads, every move and rejection is refused', async () => {
    token.acting = (await request(server()).post(`/api/v1/auth/impersonate/${users.rec}`).set('Authorization', `Bearer ${token.hr}`).expect(200)).body.accessToken;
    await api('acting', 'get', `/hiring/jobs/${ids.job}/board`).expect(200);
    await api('acting', 'post', `/hiring/entries/${ids.priya}/move`).send({ statusId: st.first, fromStatusId: st.second }).expect(403).expect((r) => expect(r.body.message).toMatch(/acting for someone else/));
    await api('acting', 'post', `/hiring/entries/${ids.priya}/reject`).send({ reason: 'x', fromStatusId: st.second }).expect(403);
    await api('acting', 'post', `/hiring/entries/${ids.priya}/reject/undo`).expect(403);
    await api('acting', 'post', '/hiring/entries/bulk').send({ entryIds: [ids.priya], action: 'move', statusId: st.first }).expect(403);
    expect(await statusOf(ids.priya)).toBe(st.second);
  });

  it('bad input: not an id, an unknown field, a too-long reason, a status of another pipeline', async () => {
    await api('rec', 'post', `/hiring/entries/${ids.priya}/move`).send({ statusId: 'nope' }).expect(400);
    await api('rec', 'post', `/hiring/entries/${ids.priya}/move`).send({ statusId: st.first, fromStatusId: 'nope' }).expect(400);
    await api('rec', 'post', `/hiring/entries/${ids.priya}/move`).send({ statusId: st.first, fromStatusId: st.second, force: true }).expect(400);
    await api('rec', 'post', `/hiring/entries/${ids.priya}/reject`).send({ reason: 'x'.repeat(501), fromStatusId: st.second }).expect(400);
    await api('rec', 'post', `/hiring/entries/not-an-id/move`).send({ statusId: st.first }).expect(400);
    const other = (await api('hrB', 'post', '/jobs').send({ title: `B ${run}` }).expect(201)).body.id;
    const bStages = (await api('hrB', 'get', `/hiring/jobs/${other}/board`).expect(200)).body.pipeline.stages as { statuses: { id: string }[] }[];
    await api('rec', 'post', `/hiring/entries/${ids.priya}/move`).send({ statusId: bStages[0].statuses[0].id, fromStatusId: st.second }).expect(400);
    expect(await statusOf(ids.priya)).toBe(st.second);
  });
});
