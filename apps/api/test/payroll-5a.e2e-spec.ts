import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { ExchangeFilesService } from '../src/payroll/exchange-files.service';
import { PayAuditService } from '../src/payroll/audit.service';
import { addDays } from '../src/time/time-maths';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// Payroll batch 5a end to end against the real database (forced RLS, the app role) and Redis: pay periods and the
// two-approval reopen (maker ≠ checker, step-up, typed confirmation, refused once a bank file is released), the lock
// guard on attendance and leave, late corrections and device backfills paid in the next payroll, the pay guard (HR
// without pay rights, a support session and platform staff read nothing, the employee reads their own), pay documents
// (mandatory fields, gap-free numbers, verify page, supersede, immutability, sensitive-view de-duplication), exchange
// files (single-use links, release by a second person), the audit log (masking, timeline, audited export, the hash
// chain and tamper detection), the alumni portal; two companies kept apart.
describe('Payroll batch 5a', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'payAdmin' | 'payApprover' | 'finance' | 'hrAdmin' | 'auditor' | 'emp' | 'leaver' | 'payAdminB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>, extra: Partial<TenantContext> = {}) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false, ...extra }, fn);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const lockMonth = (today.slice(8) >= '02' ? addDays(`${today.slice(0, 7)}-01`, -1) : addDays(addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7) + '-01', -1)).slice(0, 7);
  const inLocked = `${lockMonth}-15`;
  const phrase = () => `REOPEN ${`P5A-${run}`.toUpperCase()} ${lockMonth}`;
  const impact = [{ label: 'Month', value: lockMonth }];
  const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = [];
    const stream = res as unknown as NodeJS.ReadableStream;
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => cb(null, Buffer.concat(chunks)));
  };
  const email = { send: jest.fn(async (_m: { to: string; subject: string }) => ({ success: true })) };
  const stepUp = (who: Who) => markSteppedUp(tenantPrisma, token[who]);
  const lock = async () => {
    await stepUp('hrAdmin');
    await api('hrAdmin', 'post', '/time/periods/lock').send({ legalEntityId: ids.entityA, month: lockMonth }).expect(200);
  };
  const reopenFor = async () => (await api('payAdmin', 'get', '/payroll/reopen-requests').expect(200)).body as { id: string; status: string; month: string; steps: { state: string }[] }[];
  const payslip = (overrides: Record<string, unknown> = {}) => ({
    employeeId: ids.empEmp,
    kind: 'payslip',
    month: addDays(`${lockMonth}-01`, -1).slice(0, 7),
    fields: { employerName: 'Pay5A Foods', employeeName: 'Emp One', employeeCode: 'P5-001', designation: 'Operator', period: 'Last month', paidDays: '30', payDate: today, grossPay: '30000.00', netPay: '27500.00', earnings: [{ label: 'Basic', amount: '30000.00' }], deductions: [{ label: 'Provident fund', amount: '2500.00' }], ...overrides },
    confirmation: { phrase: 'ISSUE PS', impact: [{ label: 'Person', value: 'Emp One' }] },
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue(email).overrideProvider(BlobStorageService).useValue(createFakeBlobStorage()).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    (globalThis as { exchange?: ExchangeFilesService }).exchange = moduleRef.get(ExchangeFilesService);
    (globalThis as { payAudit?: PayAuditService }).payAudit = moduleRef.get(PayAuditService);

    planId = (await prisma.plan.create({ data: { name: `pay5a-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Pay5A Org ${k}`, slug: `pay5a-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const template = (key: string) => ROLE_TEMPLATES.find((t) => t.key === key)!.permissions;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['payAdmin', 'A', 'panel', template('payroll_admin')],
      ['payApprover', 'A', 'panel', template('payroll_approver')],
      ['finance', 'A', 'panel', template('finance_approver')],
      ['hrAdmin', 'A', 'panel', template('hr_admin')],
      ['auditor', 'A', 'panel', template('payroll_auditor')],
      ['emp', 'A', 'panel', null],
      ['leaver', 'A', 'panel', null],
      ['payAdminB', 'B', 'panel', template('payroll_admin')],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@pay5a-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@pay5a-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const) {
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `Pay5A Foods ${k}`, shortName: `P5${k === 'A' ? 'A' : 'B'}-${run}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Hosur', code: 'HSR', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
        const deptId = randomUUID();
        ids[`dept${k}`] = (await tx.department.create({ data: { ...o, id: deptId, name: 'Production', code: 'PROD', path: `/${deptId}/` } })).id;
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Operator', code: 'OP' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
        await tx.locationAttendanceRule.create({ data: { ...o, locationId: ids[`loc${k}`], validFrom: new Date('2025-01-01T00:00:00Z'), shiftStart: 570, shiftEnd: 1110, weeklyOffs: [] } });
      });
    }
    const hire = async (who: Who, code: string, k: 'A' | 'B' = 'A') =>
      (
        await api(k === 'A' ? 'adminA' : 'adminB', 'post', '/people/employees')
          .send({ legalEntityId: ids[`entity${k}`], status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, employeeCode: code, joinedOn: `${addDays(`${lockMonth}-01`, -40).slice(0, 7)}-01`, userId: users[who], workEmail: `${who}@pay5a-${run}.test`, assignment: { locationId: ids[`loc${k}`], departmentId: ids[`dept${k}`], designationId: ids[`desig${k}`], employmentTypeId: ids[`perm${k}`], managerEmployeeId: null } })
          .expect(201)
      ).body.id as string;
    ids.empEmp = await hire('emp', 'P5-001');
    ids.leaverEmp = await hire('leaver', 'P5-002');
    ids.hrEmp = await hire('hrAdmin', 'P5-003');
  }, 240_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.payPeriod.updateMany({ where: { organizationId: { in: [org.A.id, org.B.id] } }, data: { stage: 'open' } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  // ------------------------------------------------------------------------------------------ the database (PAY-1.01)

  it('every payroll table has forced RLS, tenant isolation and the support-session exclusion; pay tables carry the pay guard (from the catalogue)', async () => {
    const rows = await prisma.$queryRaw<{ t: string; forced: boolean; tenant: boolean; support: boolean; guard: boolean }[]>`
      SELECT c.relname AS t, (c.relrowsecurity AND c.relforcerowsecurity) AS forced,
        EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation') AS tenant,
        EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'support_session_excluded' AND NOT p.polpermissive) AS support,
        EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'pay_guard' AND NOT p.polpermissive) AS guard
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relkind = 'r' AND (c.relname LIKE 'pay\\_%' OR c.relname LIKE 'payroll\\_%' OR c.relname LIKE 'period\\_%' OR c.relname LIKE 'exchange\\_%' OR c.relname IN ('held_punches', 'device_backfills'))
      ORDER BY 1`;
    expect(rows.length).toBeGreaterThanOrEqual(13);
    for (const r of rows) expect(r).toMatchObject({ t: r.t, forced: true, tenant: true, support: true });
    // One person's pay, or entity pay files: the second guard, with no super-admin escape in it.
    const guarded = ['exchange_file_links', 'exchange_files', 'pay_document_counters', 'pay_document_nominees', 'pay_documents'];
    expect(rows.filter((r) => r.guard).map((r) => r.t)).toEqual(guarded);
    const quals = await prisma.$queryRaw<{ q: string }[]>`SELECT pg_get_expr(p.polqual, p.polrelid) AS q FROM pg_policy p WHERE p.polname = 'pay_guard'`;
    for (const q of quals) expect(q.q).not.toMatch(/super_admin/);
    // Append-only and immutable: the app role cannot delete them.
    const del = await prisma.$queryRaw<{ t: string }[]>`SELECT c.relname AS t FROM pg_class c WHERE c.relname = ANY(${['pay_documents', 'exchange_files', 'period_lock_events', 'audit_logs', 'audit_anchors']}::text[]) AND has_table_privilege('app_runtime', c.oid, 'DELETE')`;
    expect(del).toEqual([]);
  });

  // ------------------------------------------------------------------------------------------ locks and reopen (PAY-1.02)

  describe('pay periods, locks and the two-approval reopen', () => {
    it('the lock refuses attendance and leave changes in the database (lock triggers through pay_period_stage)', async () => {
      await lock();
      await expect(inA((tx) => tx.punch.create({ data: { organizationId: org.A.id, employeeId: ids.empEmp, punchedAt: new Date(`${inLocked}T05:00:00Z`), workOn: new Date(`${inLocked}T00:00:00Z`), kind: 'in', accepted: true, verdict: 'no_fence' } }))).rejects.toThrow(/YX_PERIOD_LOCKED/);
      const [{ stage }] = await inA((tx) => tx.$queryRaw<{ stage: string }[]>`SELECT pay_period_stage(${org.A.id}::uuid, ${ids.entityA}::uuid, ${inLocked}::date) AS stage`);
      expect(stage).toBe('locked');
      const lt = await inA((tx) => tx.leaveType.create({ data: { organizationId: org.A.id, name: 'Casual', code: `CL${run.slice(0, 3)}`, kind: 'casual' } }));
      const lr = await inA((tx) => tx.leaveRequest.create({ data: { organizationId: org.A.id, employeeId: ids.empEmp, leaveTypeId: lt.id, fromOn: new Date(`${inLocked}T00:00:00Z`), toOn: new Date(`${inLocked}T00:00:00Z`), days: 1, status: 'approved' } }));
      await expect(inA((tx) => tx.leaveRequestDay.create({ data: { organizationId: org.A.id, requestId: lr.id, employeeId: ids.empEmp, leaveOn: new Date(`${inLocked}T00:00:00Z`), part: 'full', portion: 1, countedAs: 'leave' } }))).rejects.toThrow(/YX_PERIOD_LOCKED/);
      const periods = (await api('payAdmin', 'get', `/payroll/periods?year=${lockMonth.slice(0, 4)}`).expect(200)).body;
      expect(periods.entities.map((e: { id: string }) => e.id)).toEqual([ids.entityA]);
      expect(periods.entities[0].months.find((m: { month: string }) => m.month === lockMonth)).toMatchObject({ stage: 'locked' });
      await api('hrAdmin', 'get', `/payroll/periods?year=${lockMonth.slice(0, 4)}`).expect(403);
      await api('payAdminB', 'get', `/payroll/periods/${periods.entities[0].months.find((m: { month: string }) => m.month === lockMonth).periodId}`).expect(404);
    });

    it('asking needs the key and a fresh step-up; one waiting request per month; the maker never decides it', async () => {
      await api('emp', 'post', '/payroll/reopen-requests').send({ legalEntityId: ids.entityA, month: lockMonth, reason: 'Overtime approved after the lock' }).expect(403);
      await api('payAdmin', 'post', '/payroll/reopen-requests').send({ legalEntityId: ids.entityA, month: lockMonth, reason: 'Overtime approved after the lock' }).expect(403);
      await stepUp('payAdmin');
      await api('payAdminB', 'post', '/payroll/reopen-requests').send({ legalEntityId: ids.entityA, month: lockMonth, reason: 'Overtime approved after the lock' }).expect(403);
      await api('payAdmin', 'post', '/payroll/reopen-requests').send({ legalEntityId: ids.entityA, month: lockMonth, reason: 'short' }).expect(400);
      const asked = (await api('payAdmin', 'post', '/payroll/reopen-requests').send({ legalEntityId: ids.entityA, month: lockMonth, reason: 'Overtime approved after the lock' }).expect(201)).body;
      ids.reopen = asked.id;
      await api('payAdmin', 'post', '/payroll/reopen-requests').send({ legalEntityId: ids.entityA, month: lockMonth, reason: 'Overtime approved after the lock' }).expect(409);
      await api('payAdmin', 'post', `/payroll/reopen-requests/${asked.id}/decide`).send({ decision: 'approve', confirmation: { phrase: phrase(), impact } }).expect(404);
    });

    it('the first check: only on its page (not the shared inbox), with step-up and the typed phrase; the month stays locked', async () => {
      const inbox = (await api('payApprover', 'get', '/workflow/approvals/inbox').expect(200)).body as { taskId: string; decideAt: string | null }[];
      expect(inbox[0].decideAt).toBe('/yx/payroll/reopen-requests');
      const generic = (await api('payApprover', 'post', `/workflow/approvals/tasks/${inbox[0].taskId}/decide`).send({ decision: 'approve' }).expect(409)).body;
      expect(generic.code).toBe('DECIDE_ON_ITS_PAGE');
      await api('payApprover', 'post', `/payroll/reopen-requests/${ids.reopen}/decide`).send({ decision: 'approve', confirmation: { phrase: phrase(), impact } }).expect(403);
      await stepUp('payApprover');
      await api('payApprover', 'post', `/payroll/reopen-requests/${ids.reopen}/decide`).send({ decision: 'approve', confirmation: { phrase: 'REOPEN', impact } }).expect(400);
      await api('payApprover', 'post', `/payroll/reopen-requests/${ids.reopen}/decide`).send({ decision: 'approve', confirmation: { phrase: phrase(), impact } }).expect(200);
      const r = (await reopenFor()).find((x) => x.id === ids.reopen)!;
      expect(r.status).toBe('pending');
      expect(r.steps.map((s) => s.state)).toEqual(['approved', 'open']);
      // The checker is not offered the final step.
      await api('payApprover', 'post', `/payroll/reopen-requests/${ids.reopen}/decide`).send({ decision: 'approve', confirmation: { phrase: phrase(), impact } }).expect(404);
      const audit = await inA((tx) => tx.auditLog.findFirst({ where: { organizationId: org.A.id, action: 'workflow.request.approved', actorUserId: users.payApprover }, orderBy: { chainSeq: 'desc' } }));
      expect(JSON.parse(audit!.metadataJson!).confirmed.phrase).toBe(phrase());
    });

    it('the final approval by Finance reopens the month, sets the frozen feed aside and keeps the history', async () => {
      await stepUp('finance');
      await api('finance', 'post', `/payroll/reopen-requests/${ids.reopen}/decide`).send({ decision: 'approve', confirmation: { phrase: phrase(), impact } }).expect(200);
      const [{ stage }] = await inA((tx) => tx.$queryRaw<{ stage: string }[]>`SELECT pay_period_stage(${org.A.id}::uuid, ${ids.entityA}::uuid, ${inLocked}::date) AS stage`);
      expect(stage).toBe('open');
      expect(await inA((tx) => tx.payrollFeedRow.count({ where: { organizationId: org.A.id, supersededAt: null } }))).toBe(0);
      const p = await inA((tx) => tx.payPeriod.findFirstOrThrow({ where: { organizationId: org.A.id, legalEntityId: ids.entityA, periodStart: new Date(`${lockMonth}-01T00:00:00Z`) } }));
      const history = (await api('payAdmin', 'get', `/payroll/periods/${p.id}`).expect(200)).body;
      expect(history.events.map((e: { to: string }) => e.to)).toEqual(['open', 'locked']);
      expect(history.reopenRequests[0].status).toBe('approved');
    });

    it('is refused once the bank file for the month is released (YX-LOCK-05); the maker never releases their own file', async () => {
      await lock();
      const exchange = (globalThis as { exchange?: ExchangeFilesService }).exchange!;
      const f = await inA(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entityA}}`}, true)`;
        return exchange.generateIn(tx, { organizationId: org.A.id, isSuperAdmin: false, userId: users.payAdmin }, { legalEntityId: ids.entityA, kind: 'bank', ownerType: 'test', ownerId: null, periodStart: `${lockMonth}-01`, fileName: 'salary.csv', contentType: 'text/csv', data: Buffer.from('code,amount\nP5-001,27500.00\n'), rows: 1, totals: { amount: '27500.00' }, by: users.payAdmin });
      }, { userId: users.payAdmin });
      ids.bankFile = f.id;
      await stepUp('payAdmin');
      expect((await api('payAdmin', 'get', '/payroll/files').expect(200)).body.files[0]).toMatchObject({ id: f.id, canRelease: false, madeByMe: true });
      await api('payAdmin', 'post', `/payroll/files/${f.id}/release`).send({ confirmation: { phrase: 'RELEASE 1', impact } }).expect(403);
      await api('hrAdmin', 'get', '/payroll/files').expect(403);
      await api('payAdminB', 'get', '/payroll/files').expect(200).then((r) => expect(r.body.files).toEqual([]));
      await stepUp('payApprover');
      await api('payApprover', 'post', `/payroll/files/${f.id}/release`).send({ confirmation: { phrase: 'RELEASE 2', impact } }).expect(400);
      await api('payApprover', 'post', `/payroll/files/${f.id}/release`).send({ confirmation: { phrase: 'RELEASE 1', impact } }).expect(200);
      await api('payApprover', 'post', `/payroll/files/${f.id}/release`).send({ confirmation: { phrase: 'RELEASE 1', impact } }).expect(409);
      // The database stops a maker releasing their own file even if code forgot.
      await expect(inA(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entityA}}`}, true)`;
        await tx.exchangeFile.update({ where: { id: f.id }, data: { sha256: 'f'.repeat(64) } });
      })).rejects.toThrow(/never changes/);
      const refused = (await api('payAdmin', 'post', '/payroll/reopen-requests').send({ legalEntityId: ids.entityA, month: lockMonth, reason: 'Another late overtime claim' }).expect(409)).body;
      expect(refused.code).toBe('BANK_FILE_RELEASED');
    });

    it('a single-use download link: works once, for its own person, and the download is audited with the hash', async () => {
      const link = (await api('payApprover', 'post', `/payroll/files/${ids.bankFile}/link`).expect(200)).body;
      await api('payAdmin', 'get', link.path).expect(404);
      const got = await api('payApprover', 'get', link.path).buffer(true).parse(binary).expect(200);
      expect((got.body as Buffer).toString()).toContain('P5-001');
      await api('payApprover', 'get', link.path).expect(404);
      expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'payroll.file.downloaded', entityId: ids.bankFile } }))).toBe(1);
    });
  });

  // ------------------------------------------------------------------------------------------ corrections (PAY-1.03 / 1.04)

  describe('corrections into the next payroll', () => {
    it('a late request on a locked day goes to manager, HR and payroll; approved, it is paid next month and the locked day never changes', async () => {
      const r = (await api('emp', 'post', '/payroll/me/late-corrections').send({ on: inLocked, kind: 'attendance', shouldBe: 'present', reason: 'The gate reader missed me' }).expect(201)).body;
      expect(r).toMatchObject({ status: 'pending', stage: 'locked' });
      await api('emp', 'post', '/payroll/me/late-corrections').send({ on: today, kind: 'attendance', shouldBe: 'present', reason: 'Today is still open' }).expect(400);
      const wf = await inA((tx) => tx.payCorrection.findFirstOrThrow({ where: { id: r.id } }));
      const steps = (await inA((tx) => tx.wfRequest.findFirstOrThrow({ where: { id: wf.wfRequestId! } }))).steps as { name: string }[];
      expect(steps.map((s) => s.name)).toEqual(['Manager', 'HR', 'Payroll']);
    });

    it('HR records a correction (payroll approves); a late device batch is held and applied by one audited backfill', async () => {
      await api('payAdmin', 'post', '/payroll/corrections').send({ employeeId: ids.empEmp, on: `${lockMonth}-10`, kind: 'attendance', shouldBe: 'present', reason: 'Was on site at the supplier' }).expect(403);
      const hr = (await api('hrAdmin', 'post', '/payroll/corrections').send({ employeeId: ids.empEmp, on: `${lockMonth}-10`, kind: 'attendance', shouldBe: 'present', reason: 'Was on site at the supplier' }).expect(201)).body;
      const task = await inA((tx) => tx.wfTask.findFirstOrThrow({ where: { organizationId: org.A.id, assigneeUserId: users.payAdmin, status: 'open' }, orderBy: { createdAt: 'desc' } }));
      await api('payAdmin', 'post', `/workflow/approvals/tasks/${task.id}/decide`).send({ decision: 'approve' }).expect(200);
      const done = await inA((tx) => tx.payCorrection.findFirstOrThrow({ where: { id: hr.id } }));
      expect(done.status).toBe('approved');
      expect(done.targetPeriod!.toISOString().slice(0, 7)).toBe(addDays(`${lockMonth}-28`, 10).slice(0, 7));
      const batch = (await api('hrAdmin', 'post', '/payroll/device-batches').send({ legalEntityId: ids.entityA, deviceRef: 'GATE-2', punches: [{ employeeCode: 'P5-001', at: `${lockMonth}-12T03:30:00Z`, kind: 'in' }, { employeeCode: 'P5-001', at: `${lockMonth}-12T12:30:00Z`, kind: 'out' }, { employeeCode: 'NOPE', at: `${lockMonth}-12T03:30:00Z`, kind: 'in' }] }).expect(201)).body;
      expect(batch.held).toBe(2);
      expect(batch.notHeld).toHaveLength(1);
      await stepUp('hrAdmin');
      await api('hrAdmin', 'post', '/payroll/device-backfills').send({ legalEntityId: ids.entityA, deviceRef: 'GATE-2', reason: 'The gate device was offline for a week', confirmation: { phrase: 'BACKFILL 9', impact } }).expect(400);
      const b = (await api('hrAdmin', 'post', '/payroll/device-backfills').send({ legalEntityId: ids.entityA, deviceRef: 'GATE-2', reason: 'The gate device was offline for a week', confirmation: { phrase: 'BACKFILL 2', impact } }).expect(201)).body;
      expect(b).toMatchObject({ punches: 2, personDays: 1 });
      expect(await inA((tx) => tx.punch.count({ where: { organizationId: org.A.id, employeeId: ids.empEmp, workOn: new Date(`${lockMonth}-12T00:00:00Z`) } }))).toBe(0);
      expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'payroll.device_backfill.applied' } }))).toBe(1);
    });
  });

  // ------------------------------------------------------------------------------------------ documents (PAY-1.09 / 1.10)

  describe('pay documents and the pay guard', () => {
    it('issuing needs every mandatory field (P07 wage-slip particulars), step-up, and someone other than the person', async () => {
      await stepUp('payAdmin');
      const missing = (await api('payAdmin', 'post', '/payroll/documents').send(payslip({ netPay: '' })).expect(400)).body;
      expect(missing).toMatchObject({ code: 'DOC_FIELDS_MISSING', missing: ['netPay'] });
      await api('payAdmin', 'post', '/payroll/documents').send(payslip({ salary: '1' })).expect(400);
      await api('payAdmin', 'post', '/payroll/documents').send({ ...payslip(), confirmation: { phrase: 'ISSUE', impact } }).expect(400);
      const one = (await api('payAdmin', 'post', '/payroll/documents').send(payslip()).expect(201)).body;
      const two = (await api('payAdmin', 'post', '/payroll/documents').send({ ...payslip(), employeeId: ids.leaverEmp }).expect(201)).body;
      expect(one.referenceNo).toMatch(/\/PS\/\d{4}\/000001$/);
      expect(two.referenceNo).toMatch(/\/PS\/\d{4}\/000002$/);
      ids.doc = one.id;
      ids.code = one.verifyCode;
      await api('payAdminB', 'post', '/payroll/documents').send(payslip()).expect(403); // step-up first
      await stepUp('payAdminB');
      await api('payAdminB', 'post', '/payroll/documents').send(payslip()).expect(404);
      await api('hrAdmin', 'post', '/payroll/documents').send(payslip()).expect(403);
    });

    it('the pay guard: the employee reads their own; HR without pay rights, a support session and platform staff read nothing, even in SQL', async () => {
      const count = (extra: Partial<TenantContext>, entities?: string) =>
        tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false, ...extra }, async (tx) => {
          if (entities) await tx.$executeRaw`SELECT set_config('app.pay_entities', ${entities}, true)`;
          return tx.payDocument.count();
        });
      expect(await count({ userId: users.hrAdmin })).toBe(0);
      expect(await count({ userId: users.emp })).toBe(1);
      expect(await count({ userId: users.payAdmin }, `{${ids.entityA}}`)).toBe(2);
      expect(await count({ userId: users.payAdmin, supportSessionId: randomUUID() }, `{${ids.entityA}}`)).toBe(0);
      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.payDocument.count({ where: { organizationId: org.A.id } }))).toBe(0);
      expect(await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false, userId: users.payAdminB }, async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entityA}}`}, true)`;
        return tx.payDocument.count();
      })).toBe(0);
      await api('hrAdmin', 'get', '/payroll/documents').expect(403);
      await api('adminA', 'get', '/payroll/documents').expect(403);
      await api('hrAdmin', 'get', `/payroll/documents/${ids.doc}/file`).expect(404);
      expect((await api('emp', 'get', '/payroll/me/documents').expect(200)).body).toHaveLength(1);
      expect((await api('leaver', 'get', '/payroll/me/documents').expect(200)).body).toHaveLength(1);
      const own = await api('emp', 'get', `/payroll/documents/${ids.doc}/file`).buffer(true).parse(binary).expect(200);
      expect((own.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    });

    it("someone else's payslip opened twice in 30 minutes is one recorded view (YX-AUD-04)", async () => {
      await api('payAdmin', 'get', `/payroll/documents/${ids.doc}/file`).expect(200);
      await api('payAdmin', 'get', `/payroll/documents/${ids.doc}/file`).expect(200);
      expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'pay.viewed', entityId: ids.doc } }))).toBe(1);
    });

    it('an issued document never changes; a correction supersedes it and the verify page says so', async () => {
      expect((await request(server()).get(`/api/v1/public/pay/verify/${ids.code}`).expect(200)).body).toEqual({ company: `Pay5A Org A`, kind: 'Payslip', name: `emp ${run}`, issuedOn: today, status: 'current' });
      await request(server()).get('/api/v1/public/pay/verify/ABCDEFGHJK').expect(404);
      await expect(inA(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entityA}}`}, true)`;
        await tx.payDocument.update({ where: { id: ids.doc }, data: { title: 'Changed' } });
      })).rejects.toThrow(/YX_DOC_IMMUTABLE/);
      const doc = (await api('payAdmin', 'get', '/payroll/documents').expect(200)).body.documents.find((d: { id: string }) => d.id === ids.doc);
      await stepUp('payAdmin');
      const fixed = (await api('payAdmin', 'post', `/payroll/documents/${ids.doc}/supersede`).send({ fields: payslip({ netPay: '27600.00' }).fields, reason: 'Professional tax was taken twice', confirmation: { phrase: `CORRECT ${doc.referenceNo}`, impact } }).expect(201)).body;
      expect(fixed.supersedesId).toBe(ids.doc);
      expect((await request(server()).get(`/api/v1/public/pay/verify/${ids.code}`).expect(200)).body.status).toBe('superseded');
      await api('payAdmin', 'post', `/payroll/documents/${ids.doc}/supersede`).send({ fields: payslip().fields, reason: 'Professional tax was taken twice', confirmation: { phrase: `CORRECT ${doc.referenceNo}`, impact } }).expect(409);
    });

    it('a former employee signs in with a one-time code and sees only their own documents (YX-DOC-16)', async () => {
      await inA((tx) => tx.employment.updateMany({ where: { organizationId: org.A.id, employeeId: ids.leaverEmp }, data: { exitedOn: new Date(`${addDays(today, -3)}T00:00:00Z`) } }));
      email.send.mockClear();
      const leaverMail = `leaver@pay5a-${run}.test`;
      await request(server()).post(`/api/v1/public/pay/${org.A.slug}/portal/code`).send({ email: leaverMail }).expect(200);
      await request(server()).post(`/api/v1/public/pay/${org.A.slug}/portal/code`).send({ email: `emp@pay5a-${run}.test` }).expect(200);
      let code = '';
      for (let i = 0; i < 50 && !code; i++) {
        const m = email.send.mock.calls.find(([x]) => x.to === leaverMail);
        if (m) code = m[0].subject.slice(0, 6);
        else await new Promise((r) => setTimeout(r, 100));
      }
      // Someone still employed gets no code.
      expect(email.send.mock.calls.some(([x]) => x.to === `emp@pay5a-${run}.test`)).toBe(false);
      await request(server()).post(`/api/v1/public/pay/${org.A.slug}/portal/verify`).send({ email: leaverMail, code: code === '000000' ? '111111' : '000000' }).expect(401);
      const s = (await request(server()).post(`/api/v1/public/pay/${org.A.slug}/portal/verify`).send({ email: leaverMail, code }).expect(200)).body;
      const docs = (await request(server()).get(`/api/v1/public/pay/${org.A.slug}/portal/documents`).set('X-Pay-Portal', s.token).expect(200)).body;
      expect(docs).toHaveLength(1);
      await request(server()).get(`/api/v1/public/pay/${org.A.slug}/portal/documents/${ids.doc}/file`).set('X-Pay-Portal', s.token).expect(404);
      await request(server()).get(`/api/v1/public/pay/${org.B.slug}/portal/documents`).set('X-Pay-Portal', s.token).expect(401);
      await request(server()).post(`/api/v1/public/pay/${org.A.slug}/portal/sign-out`).set('X-Pay-Portal', s.token).expect(200);
      await request(server()).get(`/api/v1/public/pay/${org.A.slug}/portal/documents`).set('X-Pay-Portal', s.token).expect(401);
    });
  });

  // ------------------------------------------------------------------------------------------ audit (PAY-1.05 … 1.08)

  describe('the audit log', () => {
    it('search in scope with masked pay values, a business-only timeline and an audited export', async () => {
      await inA((tx) => tx.auditLog.create({ data: { organizationId: org.A.id, actorUserId: users.payAdmin, action: 'employee.salary.changed', entityType: 'employee', entityId: ids.empEmp, metadataJson: JSON.stringify({ legalEntityId: ids.entityA, annualCtc: '780000', bank: { accountNumber: '123456789012' } }) } }));
      await api('emp', 'get', '/payroll/audit').expect(403);
      const seen = (await api('adminA', 'get', `/payroll/audit?entityType=employee&entityId=${ids.empEmp}`).expect(200)).body.entries;
      const salary = seen.find((e: { action: string }) => e.action === 'employee.salary.changed');
      expect(salary.details.annualCtc).toMatch(/hidden/);
      expect(salary.details.bank).toMatch(/hidden/);
      expect((await api('adminB', 'get', `/payroll/audit?entityType=employee&entityId=${ids.empEmp}`).expect(200)).body.entries).toEqual([]);
      const p = await inA((tx) => tx.payPeriod.findFirstOrThrow({ where: { organizationId: org.A.id, legalEntityId: ids.entityA, periodStart: new Date(`${lockMonth}-01T00:00:00Z`) } }));
      const timeline = (await api('payAdmin', 'get', `/payroll/audit/timeline?entityType=pay_period&entityId=${p.id}`).expect(200)).body;
      expect(timeline.length).toBeGreaterThan(0);
      expect(timeline.every((e: { action: string }) => !/\.viewed$|^step_up/.test(e.action))).toBe(true);
      await api('payAdmin', 'get', '/payroll/audit/export').expect(403);
      const csv = await api('auditor', 'get', `/payroll/audit/export?entityType=employee&entityId=${ids.empEmp}`).expect(200);
      expect(csv.text).toContain('employee.salary.changed');
      expect(csv.text).not.toContain('780000');
      expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'audit.exported' } }))).toBe(1);
    });

    it('the app role can neither change nor delete an audit row; the chain verifies; a tampered row is found and alerts', async () => {
      await expect(inA((tx) => tx.$executeRaw`UPDATE audit_logs SET action = 'x' WHERE organization_id = ${org.A.id}::uuid`)).rejects.toThrow();
      await expect(inA((tx) => tx.$executeRaw`DELETE FROM audit_logs WHERE organization_id = ${org.A.id}::uuid`)).rejects.toThrow();
      await api('payApprover', 'post', '/payroll/audit/chain/verify').expect(403);
      const ok = (await api('adminA', 'post', '/payroll/audit/chain/verify').expect(200)).body;
      expect(ok.result).toBe('ok');
      // A database owner edits a row behind the app's back (the trigger switched off): the next check finds it.
      const owner = new PrismaClient({ datasources: { db: { url: process.env.MIGRATION_DATABASE_URL } } });
      try {
        await owner.$transaction([
          owner.$executeRawUnsafe(`SELECT set_config('app.is_super_admin', 'on', true)`),
          owner.$executeRawUnsafe('ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_append_only'),
          owner.$executeRawUnsafe(`UPDATE audit_logs SET metadata_json = '{"annualCtc":"1"}' WHERE organization_id = '${org.A.id}' AND action = 'employee.salary.changed'`),
          owner.$executeRawUnsafe('ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_append_only'),
        ]);
      } finally {
        await owner.$disconnect();
      }
      const broken = (await api('adminA', 'post', '/payroll/audit/chain/verify').expect(200)).body;
      expect(broken.result).toBe('broken');
      expect(broken.problem).toMatch(/changed after it was written/);
      const status = (await api('adminA', 'get', '/payroll/audit/chain').expect(200)).body;
      expect(status.checks[0]).toMatchObject({ result: 'broken' });
      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.count({ where: { action: 'audit.chain.broken', entityId: org.A.id } }))).toBeGreaterThan(0);
    });
  });
});
