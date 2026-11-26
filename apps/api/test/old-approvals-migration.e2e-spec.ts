import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { OldApprovalsMigration } from '../src/hiring/old-approvals-migration';

// Retire /v2 (answers 2433, 2511): a requisition still waiting in the older approvals engine moves into P03 at the step
// it had reached; the older routes are gone; running the move again changes nothing; one company never touches another.
describe('Older approvals move into P03', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'rec' | 'first' | 'second' | 'other';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const at = <T>(k: 'A' | 'B', fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, fn);
  const migrate = () => app.get(OldApprovalsMigration).run();

  /** A job waiting in the older engine at `step` of a two-step chain (first, then second approver). */
  const oldWaiting = (k: 'A' | 'B', title: string, step: number, submitter: string, approvers: [string, string]) =>
    at(k, async (tx) => {
      const job = await tx.job.create({ data: { organizationId: org[k].id, title, status: 'pending_approval', createdById: submitter } });
      const req = await tx.approvalRequest.create({
        data: {
          organizationId: org[k].id, gate: 'requisition', subjectType: 'job', subjectId: job.id, status: 'pending_approval', currentStepPosition: step, submittedByUserId: submitter,
          chainSnapshotJson: JSON.stringify([{ position: 1, name: 'Department head', approverType: 'users', approverUserIds: [approvers[0]] }, { position: 2, name: 'HR head', approverType: 'users', approverUserIds: [approvers[1]] }]),
        },
      });
      if (step > 1) await tx.approvalDecision.create({ data: { requestId: req.id, stepPosition: 1, approverUserId: approvers[0], decision: 'approved' } });
      return { job: job.id, req: req.id };
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    planId = (await prisma.plan.create({ data: { name: `oldappr-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `OldAppr ${k}`, slug: `oldappr-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string][] = [['adminA', 'A', 'org_admin'], ['adminB', 'B', 'org_admin'], ['rec', 'A', 'panel'], ['first', 'A', 'panel'], ['second', 'A', 'panel'], ['other', 'B', 'panel']];
    for (const [who, k, role] of roster) {
      users[who] = (await at(k, (tx) => tx.user.create({ data: { organizationId: org[k].id, email: `${who}@oldappr-${run}.test`, name: `${who} ${run}`, passwordHash, role } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@oldappr-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    // Company A: one waiting at step 2 (step 1 already approved), one whose job was since closed. Company B: one at step 1.
    Object.assign(ids, Object.fromEntries(Object.entries(await oldWaiting('A', `Accountant ${run}`, 2, users.rec, [users.first, users.second])).map(([k, v]) => [`a_${k}`, v])));
    const gone = await oldWaiting('A', `Closed ${run}`, 1, users.rec, [users.first, users.second]);
    await at('A', (tx) => tx.job.update({ where: { id: gone.job }, data: { status: 'closed' } }));
    ids.gone_req = gone.req;
    Object.assign(ids, Object.fromEntries(Object.entries(await oldWaiting('B', `Driver ${run}`, 1, users.adminB, [users.other, users.other])).map(([k, v]) => [`b_${k}`, v])));
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('moves each waiting request to P03 at the step it reached; the older row is kept as history', async () => {
    await migrate();
    const job = await at('A', (tx) => tx.job.findFirstOrThrow({ where: { id: ids.a_job } }));
    expect(job.status).toBe('pending_approval');
    const wf = await at('A', (tx) => tx.wfRequest.findFirstOrThrow({ where: { id: job.wfRequestId! } }));
    expect(wf).toMatchObject({ requestType: 'ats.requisition', subjectId: ids.a_job, status: 'pending' });
    // Only the step not yet decided (HR head) is left, for the second approver; nothing for the first.
    expect((wf.steps as { name: string }[]).map((s) => s.name)).toEqual(['HR head']);
    expect(await at('A', (tx) => tx.wfTask.count({ where: { requestId: wf.id, assigneeUserId: users.first } }))).toBe(0);
    const old = await at('A', (tx) => tx.approvalRequest.findFirstOrThrow({ where: { id: ids.a_req }, include: { decisions: true } }));
    expect(old.status).toBe('migrated');
    expect(old.decisions).toHaveLength(1);
    // The job closed meanwhile: nothing to move, the row is closed off and audited.
    expect((await at('A', (tx) => tx.approvalRequest.findFirstOrThrow({ where: { id: ids.gone_req } }))).status).toBe('migrated');
    const trail = await at('A', (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'workflow.request.migrated' } }));
    expect(trail).toHaveLength(2);
  });

  it('the new approver decides it in P03 and the job opens; the person who did not hold the step cannot', async () => {
    const task = await at('A', (tx) => tx.wfTask.findFirstOrThrow({ where: { assigneeUserId: users.second, status: 'open' } }));
    await api('first', 'post', `/workflow/approvals/tasks/${task.id}/decide`).send({ decision: 'approve' }).expect((r) => expect([403, 404]).toContain(r.status));
    await api('second', 'post', `/workflow/approvals/tasks/${task.id}/decide`).send({ decision: 'approve' }).expect(200);
    expect((await at('A', (tx) => tx.job.findFirstOrThrow({ where: { id: ids.a_job } }))).status).toBe('open');
  });

  it('running it again moves nothing and makes no second request', async () => {
    const before = await tenantPrisma.forTenant(SUPER, (tx) => tx.wfRequest.count({ where: { subjectId: { in: [ids.a_job, ids.b_job] } } }));
    expect(await migrate()).toBe(0);
    expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.wfRequest.count({ where: { subjectId: { in: [ids.a_job, ids.b_job] } } }))).toBe(before);
  });

  it('each company sees only its own moved request', async () => {
    const bJob = await at('B', (tx) => tx.job.findFirstOrThrow({ where: { id: ids.b_job } }));
    expect(bJob.wfRequestId).toBeTruthy();
    expect(await at('A', (tx) => tx.wfRequest.count({ where: { id: bJob.wfRequestId! } }))).toBe(0);
    expect(await at('B', (tx) => tx.wfRequest.count({ where: { subjectId: ids.a_job } }))).toBe(0);
    expect(await at('B', (tx) => tx.wfTask.count({ where: { assigneeUserId: users.other, status: 'open' } }))).toBe(1);
  });

  it('the older approval routes are gone; the chain settings stay', async () => {
    await api('adminA', 'get', '/approvals/requests').expect(404);
    await api('adminA', 'post', `/approvals/requests/${ids.a_req}/decide`).send({ decision: 'approved' }).expect(404);
    await api('adminA', 'get', '/approvals/gate-status').expect(200);
    // Withdrawing a requisition that is not waiting is refused (no fallback to the older engine).
    await api('rec', 'post', `/jobs/${ids.a_job}/approval/cancel`).expect((r) => expect([403, 409]).toContain(r.status));
  });
});
