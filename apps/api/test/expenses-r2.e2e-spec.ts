import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { ExpenseTripsService } from '../src/expenses/trips.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Expenses round 2 end to end against the real database (forced RLS, the app role):
//   team claims    a manager's read-only list of their direct reports' sent claims (founder answer 1); refused (403) to
//                  an employee, finance, another company's admin and a manager's manager for indirect reports
//   receipt        a line says what its receipt is (photo or PDF); the file streams to people who may see the claim only
//   recovery       an overdue advance shows the salary instalments (preview, then the loan engine's schedule)
//   fx tolerance   the company setting expense.fx_tolerance_pct (default 3) decides when a typed rate is flagged
process.env.EXPENSE_OCR_ADAPTER = 'dev-fake';
process.env.SD_SCANNER = 'dev-fake';

describe('Expenses round 2', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let svc: ExpenseTripsService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'head' | 'mgr' | 'ravi' | 'sita' | 'fin';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const emp = {} as Record<string, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => request(server())[method](`/api/v1/expenses${path}`).set('Authorization', `Bearer ${token[who]}`);
  const decide = (who: Who, taskId: string) => request(server()).post(`/api/v1/workflow/approvals/tasks/${taskId}/decide`).set('Authorization', `Bearer ${token[who]}`).send({ decision: 'approve' });
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const d = (n: number) => new Date(new Date(`${today}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const lastMonth = (() => {
    const [y, m] = today.slice(0, 7).split('-').map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  })();
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const png = () => Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'), Buffer.from(randomUUID())]);
  type Line = { id: string; version: number; hasReceipt: boolean; receiptType: 'image' | 'pdf' | null };
  type Claim = { id: string; version: number; status: string; lines: Line[]; flags: { kind: string }[] };
  type TeamRow = { id: string; person: string; status: string; overLimit: number; canOpen: boolean; claimedTotal: string };
  const clean = async () => {
    for (let i = 0; i < 60 && (await inA((tx) => tx.file.count({ where: { organizationId: org.A.id, scanStatus: 'pending' } }))); i++) await new Promise((r) => setTimeout(r, 150));
  };
  const bill = async (who: Who, claimId: string, name: string, body: Record<string, unknown>) => {
    const c = (await api(who, 'post', `/claims/${claimId}/receipts`).attach('file', png(), { filename: name, contentType: 'image/png' }).expect(201)).body as Claim;
    const l = c.lines[c.lines.length - 1];
    return (await api(who, 'put', `/claims/${claimId}/lines/${l.id}`).send({ payMode: 'personal', ...body, version: l.version }).expect(200)).body as Claim;
  };
  const setting = (key: string, value: string) => request(server()).put('/api/v1/org/settings').set('Authorization', `Bearer ${token.adminA}`).send({ key, scopeType: 'tenant', value });

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
    svc = moduleRef.get(ExpenseTripsService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `expr2-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `ExpR2 Org ${k}`, slug: `expr2-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['head', 'A', 'panel', []],
      ['mgr', 'A', 'panel', []],
      ['ravi', 'A', 'panel', []],
      ['sita', 'A', 'panel', []],
      ['fin', 'A', 'panel', ['expense.payout.manage']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@expr2-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@expr2-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Sea Foods Pvt Ltd', shortName: `SF${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.mum = (await tx.location.create({ data: { ...x, legalEntityId: ids.entity, name: 'Mumbai', code: 'MUM', address: {}, country: 'IN', state: 'IN-MH', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...x, id: deptId, name: 'Sales', code: 'SAL', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...x, name: 'Executive', code: 'EX' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...x, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (who: Who, given: string, code: string, manager: string | null) =>
      (await request(server()).post('/api/v1/people/employees').set('Authorization', `Bearer ${token.adminA}`).send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: given, familyName: run, employeeCode: code, joinedOn: '2026-04-06', userId: users[who], workEmail: `${who}@expr2-${run}.test`, assignment: { locationId: ids.mum, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } }).expect(201)).body.id as string;
    emp.head = await hire('head', 'Arun', 'SF-001', null);
    emp.mgr = await hire('mgr', 'Divya', 'SF-002', emp.head);
    emp.ravi = await hire('ravi', 'Neha', 'SF-003', emp.mgr);
    emp.sita = await hire('sita', 'Sita', 'SF-004', emp.mgr);
    emp.fin = await hire('fin', 'Meena', 'SF-006', emp.head);
    await api('adminA', 'post', '/setup/from-starter').expect(201);
    await api('adminA', 'post', '/fx-rates').send({ rows: [{ base: 'AED', quote: 'INR', rateDate: d(-6), rate: '22.75' }] }).expect(201);
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('a line says its receipt is a photo; the receipt streams to the claimant and the approver, never to a peer or another company', async () => {
    const c = (await api('ravi', 'post', '/claims').send({ title: 'Client lunch' }).expect(201)).body as Claim;
    ids.claim = c.id;
    const got = await bill('ravi', c.id, 'receipt__Taj Cafe__Grand Total 1,200.00.png', { categoryCode: 'other', spentOn: d(-2), merchant: 'Taj Cafe', amount: '1200.00' });
    ids.line = got.lines[0].id;
    expect(got.lines[0]).toMatchObject({ hasReceipt: true, receiptType: 'image' });
    await clean();
    const sent = (await api('ravi', 'post', `/claims/${c.id}/submit`).send({ version: got.version }).expect(200)).body as Claim;
    expect(sent.status).toBe('submitted');
    const file = await api('mgr', 'get', `/claims/${c.id}/lines/${ids.line}/receipt`).expect(200);
    expect(file.headers['content-type']).toMatch(/^image\/png/);
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    await api('ravi', 'get', `/claims/${c.id}/lines/${ids.line}/receipt`).expect(200);
    // A peer with no reason to see it, and another company's admin: told it does not exist.
    await api('sita', 'get', `/claims/${c.id}/lines/${ids.line}/receipt`).expect(404);
    await api('adminB', 'get', `/claims/${c.id}/lines/${ids.line}/receipt`).expect(404);
    // Bad input: not an id.
    await api('mgr', 'get', `/claims/${c.id}/lines/not-a-line/receipt`).expect(400);
  });

  it('team claims: the manager sees direct reports’ sent claims this month, read only; drafts stay private (founder answer 1)', async () => {
    // Sita's draft is never on the list.
    await api('sita', 'post', '/claims').send({ title: 'Draft only' }).expect(201);
    const t = (await api('mgr', 'get', '/claims?view=team').expect(200)).body as { month: string; people: number; claims: TeamRow[] };
    expect(t).toMatchObject({ month: today.slice(0, 7), people: 2 });
    expect(t.claims.map((x) => [x.id, x.status, x.claimedTotal, x.canOpen])).toEqual([[ids.claim, 'submitted', '1200.00', true]]);
    expect(t.claims[0].person).toContain('Neha');
    expect(t.claims[0].overLimit).toBe(0);
    // Last month: nothing sent then.
    expect((await api('mgr', 'get', `/claims?view=team&month=${lastMonth}`).expect(200)).body.claims).toEqual([]);
    // The manager can open the claim (an approver on it) but the list grants nothing new: no approve from the list route.
    await api('mgr', 'get', `/claims/${ids.claim}`).expect(200);
  });

  it('team claims are refused to an employee, finance, another company and bad input; a manager’s manager sees only direct reports', async () => {
    expect((await api('ravi', 'get', '/claims?view=team').expect(403)).body.message).toBe('Team claims are for managers. No one reports to you today.');
    await api('fin', 'get', '/claims?view=team').expect(403);
    await api('adminB', 'get', '/claims?view=team').expect(403);
    await api('mgr', 'get', '/claims?view=team&month=2026-13').expect(400);
    await api('mgr', 'get', '/claims?view=team&month=nov').expect(400);
    await api('mgr', 'get', '/claims?view=everyone').expect(400);
    // Arun manages Divya and Meena, not Neha: Neha's claim is not on his list.
    const h = (await api('head', 'get', '/claims?view=team').expect(200)).body as { people: number; claims: TeamRow[] };
    expect(h.people).toBe(2);
    expect(h.claims.map((x) => x.id)).not.toContain(ids.claim);
  });

  it('the foreign-rate tolerance is a company setting: 3 % by default, so a rate 4 % off is flagged; at 5 % it is not', async () => {
    const flagged = async () => {
      const c = (await api('ravi', 'post', '/claims').send({ title: `Dubai ${randomUUID().slice(0, 4)}` }).expect(201)).body as Claim;
      let got = await bill('ravi', c.id, `receipt__Dubai Taxi ${randomUUID().slice(0, 4)}__Grand Total 300.00.png`, { categoryCode: 'air', spentOn: d(-5), merchant: 'Dubai Taxi', fx: { currency: 'AED', amount: '300.00', rate: '23.66' } });
      got = (await api('ravi', 'post', `/claims/${c.id}/lines/${got.lines[0].id}/fx-proof`).attach('file', png(), { filename: 'card.png', contentType: 'image/png' }).expect(201)).body;
      await clean();
      const res = await api('ravi', 'post', `/claims/${c.id}/submit`).send({ version: got.version });
      expect([res.status, res.body.message]).toEqual([200, undefined]);
      got = res.body;
      return got.flags.map((f) => f.kind).includes('fx_rate');
    };
    expect(await flagged()).toBe(true);
    // A value outside the list is refused; only someone who manages settings may change it.
    await setting('expense.fx_tolerance_pct', '4').expect(400);
    await request(server()).put('/api/v1/org/settings').set('Authorization', `Bearer ${token.ravi}`).send({ key: 'expense.fx_tolerance_pct', scopeType: 'tenant', value: '5' }).expect(403);
    await setting('expense.fx_tolerance_pct', '5').expect(200);
    expect(await flagged()).toBe(false);
    // Another company keeps the default: its own setting is untouched.
    expect((await request(server()).get('/api/v1/org/settings/resolve?key=expense.fx_tolerance_pct').set('Authorization', `Bearer ${token.adminB}`).expect(200)).body).toMatchObject({ value: '3' });
  });

  it('an overdue advance shows the salary instalments: a preview, then the loan engine’s schedule; never to the approver alone', async () => {
    let a = (await api('ravi', 'post', '/advances').send({ purpose: 'Site petty cash', amount: '1000' }).expect(201)).body;
    const m = (await api('mgr', 'get', `/advances/${a.id}`).expect(200)).body;
    await decide('mgr', m.can.decide).expect(200);
    const f = (await api('fin', 'get', `/advances/${a.id}`).expect(200)).body;
    await decide('fin', f.can.decide).expect(200);
    a = (await api('ravi', 'get', `/advances/${a.id}`).expect(200)).body;
    a = (await api('fin', 'post', `/advances/${a.id}/pay`).send({ paidOn: d(-20), ref: 'NEFT-R2', version: a.version }).expect(200)).body;
    expect(a.recovery).toBeNull();
    await inA((tx) => tx.expenseAdvance.update({ where: { id: a.id }, data: { settleBy: new Date(`${d(-1)}T00:00:00Z`) } }));
    // Before the daily job: what it will recover, ₹1,000 in 3 (₹334, ₹334, ₹332), from next month.
    const before = (await api('fin', 'get', `/advances/${a.id}`).expect(200)).body;
    expect(before.overdue).toBe(true);
    expect(before.recovery).toMatchObject({ scheduled: false, total: '1000.00' });
    expect(before.recovery.instalments.map((i: { amount: string }) => i.amount)).toEqual(['334.00', '334.00', '332.00']);
    expect(before.recovery.instalments[0].month > today.slice(0, 7)).toBe(true);
    expect((await api('ravi', 'get', `/advances/${a.id}`).expect(200)).body.recovery.total).toBe('1000.00');
    // The approver who is neither the employee nor finance sees no recovery figures.
    expect((await api('mgr', 'get', `/advances/${a.id}`).expect(200)).body.recovery).toBeNull();
    await api('adminB', 'get', `/advances/${a.id}`).expect(404);
    // After the daily job: the loan engine's own schedule, the same amounts.
    await svc.sweepOrg(org.A.id, today);
    const after = (await api('fin', 'get', `/advances/${a.id}`).expect(200)).body;
    expect(after.recovery).toMatchObject({ scheduled: true, total: '1000.00' });
    expect(after.recovery.instalments.map((i: { amount: string; status: string }) => [i.amount, i.status])).toEqual([['334.00', 'scheduled'], ['334.00', 'scheduled'], ['332.00', 'scheduled']]);
  });

  // Batch E A4 / A7 (answers 2551 to 2553, 2556): who a claim waits on, and the past-claim filters.
  it('batch E: a claim says who it waits on (claimant and manager lists); my claims filter by status, dates and title, 25 a page', async () => {
    type Row = { id: string; status: string; waitingOn: string | null };
    const mine = (await api('ravi', 'get', '/claims?view=mine').expect(200)).body.claims as Row[];
    expect(mine.find((x) => x.id === ids.claim)).toMatchObject({ status: 'submitted', waitingOn: `mgr ${run}` });
    const team = (await api('mgr', 'get', '/claims?view=team').expect(200)).body.claims as Row[];
    expect(team.find((x) => x.id === ids.claim)!.waitingOn).toBe(`mgr ${run}`);
    // A draft waits on no one.
    const draft = (await api('sita', 'get', '/claims?view=mine').expect(200)).body.claims as Row[];
    expect(draft.every((x) => x.waitingOn === null)).toBe(true);

    const q = (who: Who, query: string) => api(who, 'get', `/me/claims${query}`);
    const all = (await q('ravi', '').expect(200)).body as { claims: Row[]; total: number; page: number; pageSize: number };
    expect(all).toMatchObject({ page: 1, pageSize: 25 });
    expect(all.total).toBeGreaterThanOrEqual(1);
    expect(all.claims.find((x) => x.id === ids.claim)!.waitingOn).toBe(`mgr ${run}`);
    expect((await q('ravi', '?status=submitted&q=LUNCH').expect(200)).body.claims.map((x: Row) => x.id)).toContain(ids.claim);
    expect((await q('ravi', '?status=draft,rejected').expect(200)).body.claims.map((x: Row) => x.id)).not.toContain(ids.claim);
    expect((await q('ravi', `?sentFrom=${today}&sentTo=${today}`).expect(200)).body.claims.map((x: Row) => x.id)).toContain(ids.claim);
    expect((await q('ravi', `?sentFrom=${d(1)}`).expect(200)).body.total).toBe(0);
    expect((await q('ravi', `?paidFrom=${d(-30)}`).expect(200)).body.claims.map((x: Row) => x.id)).not.toContain(ids.claim);
    expect((await q('ravi', '?q=no-such-claim').expect(200)).body.total).toBe(0);
    expect((await q('ravi', '?page=2').expect(200)).body.claims).toEqual([]);
    // Only my own: a peer, the manager and another company never see Neha's claim here.
    for (const who of ['sita', 'mgr', 'adminB'] as const) expect((await q(who, '').expect(200)).body.claims.map((x: Row) => x.id)).not.toContain(ids.claim);
    // Bad input.
    for (const bad of ['?status=paid', '?sentFrom=1-1-2026', `?sentFrom=${today}&sentTo=${d(-1)}`, '?page=0', '?page=x', `?q=${'x'.repeat(101)}`, '?other=1']) await q('ravi', bad).expect(400);
  });
});

