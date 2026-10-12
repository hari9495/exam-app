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
import { settlementOf } from '../src/lifecycle/settlement';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Expenses batch E4 end to end against the real database (forced RLS, the app role): a trip request routed to the
// manager and the travel desk, its approval creating the advance (YX-EXP-08), bookings by upload and through the
// partner seam (company-paid ones count against the budget, never reimbursed), finance paying the advance, a claim on
// the trip settling it (₹10,000 advance, ₹7,000 claimed → ₹3,000 to return), a bank return, a standing imprest with
// approve-with-changes on the amount, reminders and overdue, the open balance in the F&F hand-off, who sees what, and
// two companies apart.
process.env.EXPENSE_OCR_ADAPTER = 'dev-fake';
process.env.SD_SCANNER = 'dev-fake';
process.env.TRAVEL_BOOKING_ADAPTER = 'dev-fake';

describe('Expenses batch E4', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'head' | 'mgr' | 'ravi' | 'sita' | 'desk' | 'fin';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const emp = {} as Record<string, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => request(server())[method](`/api/v1/expenses${path}`).set('Authorization', `Bearer ${token[who]}`);
  const decide = (who: Who, taskId: string, decision: 'approve' | 'reject') => request(server()).post(`/api/v1/workflow/approvals/tasks/${taskId}/decide`).set('Authorization', `Bearer ${token[who]}`).send({ decision });
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const shift = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const dmy = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const png = () => Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'), Buffer.from(randomUUID())]);
  type Advance = { id: string; status: string; amount: string | null; requested: string; changeReason: string | null; balance: string; settleBy: string | null; overdue: boolean; version: number; ledger?: { kind: string; amount: string }[]; can?: Record<string, unknown> };
  type Trip = { id: string; status: string; version: number; route: { steps: { name: string; state: string }[] } | null; bookings: { kind: string; amount: string; paidBy: string; provider: string | null }[]; budget: { companyPaid: string; claimed: string; used: string; left: string } | null; advance: Advance | null; claims: { id: string; advanceAdjusted: string }[]; can: { decide: string | null; book: boolean; cancel: boolean; partner: boolean } };
  const trip = async (who: Who, id: string) => (await api(who, 'get', `/trips/${id}`).expect(200)).body as Trip;
  const advance = async (who: Who, id: string) => (await api(who, 'get', `/advances/${id}`).expect(200)).body as Advance;

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
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `exp4-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Exp4 Org ${k}`, slug: `exp4-${k.toLowerCase()}-${run}`, planId } });
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
      ['desk', 'A', 'panel', ['travel.booking.manage']],
      ['fin', 'A', 'panel', ['expense.payout.manage']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@exp4-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@exp4-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
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
      (await request(server()).post('/api/v1/people/employees').set('Authorization', `Bearer ${token.adminA}`).send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: given, familyName: run, employeeCode: code, joinedOn: '2026-04-06', userId: users[who], workEmail: `${who}@exp4-${run}.test`, assignment: { locationId: ids.mum, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } }).expect(201)).body.id as string;
    emp.head = await hire('head', 'Arun', 'SF-001', null);
    emp.mgr = await hire('mgr', 'Divya', 'SF-002', emp.head);
    emp.ravi = await hire('ravi', 'Ravi', 'SF-003', emp.mgr);
    emp.sita = await hire('sita', 'Sita', 'SF-004', emp.mgr);
    emp.desk = await hire('desk', 'Tara', 'SF-005', emp.head);
    emp.fin = await hire('fin', 'Meena', 'SF-006', emp.head);
    await api('adminA', 'post', '/setup/from-starter').expect(201);
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('a trip goes to the manager, then the travel desk; approval creates its advance (XP-4.01, YX-EXP-08)', async () => {
    const from = shift(today, -6);
    const to = shift(today, -2);
    const body = { purpose: 'Mumbai distributor meetings', fromOn: from, toOn: to, estimate: '20000', advanceRequested: '10000', bookingNeeded: true, legs: [{ fromCity: 'Mumbai', toCity: 'Pune', departOn: from, mode: 'road', stayNights: 2 }, { fromCity: 'Pune', toCity: 'Mumbai', departOn: to, mode: 'rail' }] };
    expect((await api('ravi', 'post', '/trips').send({ ...body, advanceRequested: '30000' }).expect(400)).body.message).toBe('The advance cannot be more than the estimate.');
    expect((await api('ravi', 'post', '/trips').send({ ...body, legs: [{ ...body.legs[0], departOn: shift(from, -1) }] }).expect(400)).body.message).toMatch(/outside the trip dates/);
    let t = (await api('ravi', 'post', '/trips').send(body).expect(201)).body as Trip;
    ids.trip = t.id;
    t = (await api('ravi', 'post', `/trips/${t.id}/submit`).send({ version: t.version }).expect(200)).body;
    expect(t.status).toBe('submitted');
    expect(t.route!.steps.map((s) => s.name)).toEqual(['Manager', 'Travel desk']);
    expect(t.advance).toBeNull();
    // Sita has no reason to see it; the travel desk sees the trip, not the money.
    await api('sita', 'get', `/trips/${t.id}`).expect(404);
    expect((await api('desk', 'get', '/trips?view=desk').expect(200)).body.trips.map((x: { id: string }) => x.id)).toContain(t.id);
    const m = await trip('mgr', t.id);
    expect(m.can.decide).toBeTruthy();
    await decide('mgr', m.can.decide!, 'approve').expect(200);
    const d = await trip('desk', t.id);
    expect(d.budget).toBeNull();
    await decide('desk', d.can.decide!, 'approve').expect(200);
    t = await trip('ravi', t.id);
    expect(t.status).toBe('approved');
    expect(t.advance).toMatchObject({ status: 'approved', amount: '10000.00', balance: '0.00' });
    ids.tripAdvance = t.advance!.id;
  });

  it('bookings: company-paid ones count against the budget and are never reimbursed (XP-4.02, 4.03)', async () => {
    await api('desk', 'post', `/trips/${ids.trip}/bookings`).field('kind', 'hotel').field('title', 'Pune hotel, 2 nights').field('amount', '3000').field('paidBy', 'company').attach('file', png(), { filename: 'hotel.png', contentType: 'image/png' }).expect(201);
    await api('ravi', 'post', `/trips/${ids.trip}/bookings`).field('kind', 'ticket').field('title', 'Rail back').field('amount', '1200').field('paidBy', 'employee').expect(201);
    const t = (await api('desk', 'post', `/trips/${ids.trip}/bookings/partner`).send({ legSeq: 2 }).expect(200)).body as Trip;
    expect(t.bookings.find((b) => b.provider === 'dev-fake')).toMatchObject({ kind: 'ticket', amount: '1200.00', paidBy: 'company' });
    await api('sita', 'post', `/trips/${ids.trip}/bookings/partner`).send({ legSeq: 1 }).expect(404);
    expect((await trip('ravi', ids.trip)).budget).toMatchObject({ companyPaid: '4200.00', claimed: '0.00', used: '4200.00', left: '15800.00' });
  });

  it('finance pays the advance; a claim on the trip settles it: ₹10,000 advance, ₹7,000 claimed → ₹3,000 to return (XP-4.04)', async () => {
    let a = await advance('fin', ids.tripAdvance);
    expect(a.can).toMatchObject({ pay: true });
    await api('ravi', 'post', `/advances/${a.id}/pay`).send({ paidOn: shift(today, -7), ref: 'NEFT-1', version: a.version }).expect(403);
    a = (await api('fin', 'post', `/advances/${a.id}/pay`).send({ paidOn: shift(today, -7), ref: 'NEFT-1', version: a.version }).expect(200)).body;
    expect(a).toMatchObject({ status: 'paid', balance: '10000.00', settleBy: shift(shift(today, -2), 15) });
    // The trip cannot be cancelled once its advance is paid.
    await api('ravi', 'post', `/trips/${ids.trip}/cancel`).expect(409);

    let c = (await api('ravi', 'post', '/claims').send({ title: 'Mumbai trip', tripId: ids.trip }).expect(201)).body;
    c = (await api('ravi', 'post', `/claims/${c.id}/receipts`).attach('file', png(), { filename: `receipt__Air India__Date ${dmy(shift(today, -6))}__Grand Total 7,000.00@0.9.png`, contentType: 'image/png' }).expect(201)).body;
    const l = c.lines[0];
    c = (await api('ravi', 'put', `/claims/${c.id}/lines/${l.id}`).send({ categoryCode: 'air', payMode: 'personal', spentOn: shift(today, -6), merchant: 'Air India', amount: '7000.00', version: l.version }).expect(200)).body;
    for (let i = 0; i < 40 && (await inA((tx) => tx.file.count({ where: { organizationId: org.A.id, scanStatus: 'pending' } }))); i++) await new Promise((r) => setTimeout(r, 150));
    c = (await api('ravi', 'post', `/claims/${c.id}/submit`).send({ version: c.version }).expect(200)).body;
    await api('mgr', 'post', `/claims/${c.id}/decide`).send({ decision: 'approve' }).expect(200);
    c = (await api('ravi', 'get', `/claims/${c.id}`).expect(200)).body;
    expect(c).toMatchObject({ status: 'approved', approvedTotal: '7000.00', advanceAdjusted: '7000.00', netPayable: '0.00', paymentStatus: 'not_due' });
    const t = await trip('ravi', ids.trip);
    expect(t.advance).toMatchObject({ status: 'paid', balance: '3000.00' });
    expect(t.budget).toMatchObject({ claimed: '7000.00', used: '11200.00' });

    // Ravi returns the ₹3,000 by bank; finance records it and the advance is settled.
    await api('fin', 'post', `/advances/${a.id}/return`).send({ amount: '3500', on: today, ref: 'UTR-9' }).expect(400);
    a = (await api('fin', 'post', `/advances/${a.id}/return`).send({ amount: '3000', on: today, ref: 'UTR-9' }).expect(200)).body;
    expect(a).toMatchObject({ status: 'settled', balance: '0.00' });
    expect(a.ledger!.map((x) => [x.kind, x.amount])).toEqual([['paid', '10000.00'], ['claim', '-7000.00'], ['return', '-3000.00']]);
  });

  it('a standing imprest: manager lowers the amount with a reason, finance approves and pays (§9.4)', async () => {
    let a = (await api('ravi', 'post', '/advances').send({ purpose: 'Site petty cash, Pune depot', amount: '5000' }).expect(201)).body as Advance;
    ids.imprest = a.id;
    expect(a.status).toBe('requested');
    const m = await advance('mgr', a.id);
    expect(m.can).toMatchObject({ changeAmount: true });
    expect((await api('mgr', 'patch', `/advances/${a.id}/amount`).send({ amount: '4000' }).expect(400)).body.message).toBe('Say why you are approving less; the employee sees it.');
    await api('mgr', 'patch', `/advances/${a.id}/amount`).send({ amount: '6000', reason: 'more' }).expect(400);
    await api('mgr', 'patch', `/advances/${a.id}/amount`).send({ amount: '4000', reason: 'Two weeks is enough' }).expect(200);
    await decide('mgr', m.can!.decide as string, 'approve').expect(200);
    const f = await advance('fin', a.id);
    await decide('fin', f.can!.decide as string, 'approve').expect(200);
    a = await advance('ravi', a.id);
    expect(a).toMatchObject({ status: 'approved', amount: '4000.00', changeReason: 'Two weeks is enough' });
    a = (await api('fin', 'post', `/advances/${a.id}/pay`).send({ paidOn: today, ref: 'NEFT-2', version: a.version }).expect(200)).body;
    expect(a).toMatchObject({ status: 'paid', settleBy: null, balance: '4000.00' });
  });

  it('reminders, then overdue; finance is told and the balance is recovered from salary as an expense loan (XP-4.05, §11.3)', async () => {
    const svc = app.get(ExpenseTripsService);
    await inA((tx) => tx.expenseAdvance.update({ where: { id: ids.imprest }, data: { settleBy: new Date(`${shift(today, 2)}T00:00:00Z`) } }));
    expect(await svc.sweepOrg(org.A.id, today)).toBe(1);
    expect(await svc.sweepOrg(org.A.id, today)).toBe(0);
    await inA((tx) => tx.expenseAdvance.update({ where: { id: ids.imprest }, data: { settleBy: new Date(`${shift(today, -1)}T00:00:00Z`) } }));
    expect(await svc.sweepOrg(org.A.id, today)).toBe(1);
    expect(await advance('ravi', ids.imprest)).toMatchObject({ overdue: true, balance: '4000.00' });
    expect(await inA((tx) => tx.eventOutbox.count({ where: { organizationId: org.A.id, eventType: 'advance.overdue' } }))).toBe(1);
    const loans = await inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return tx.loan.findMany({ where: { sourceRef: ids.imprest } });
    });
    expect(loans.map((l) => [l.loanType, l.status, l.outstanding.toFixed(2), l.interestRate.toFixed(2), l.perquisite])).toEqual([['expense', 'active', '4000.00', '0.00', false]]);
  });

  it('at exit the open balance is in the F&F hand-off (XP-4.06)', async () => {
    const e = await inA((tx) => tx.employment.findFirstOrThrow({ where: { organizationId: org.A.id, employeeId: emp.ravi } }));
    const p = await inA((tx) => tx.employee.findFirstOrThrow({ where: { id: emp.ravi }, select: { personId: true } }));
    const lwd = new Date(`${shift(today, 30)}T00:00:00Z`);
    const k = await inA((tx) => tx.exitCase.create({ data: { organizationId: org.A.id, employmentId: e.id, employeeId: emp.ravi, personId: p.personId, exitType: 'resignation', initiatedBy: 'employee', submittedOn: new Date(`${today}T00:00:00Z`), noticePeriod: '30d', standardLwd: lwd, approvedLwd: lwd, status: 'accepted' } }));
    // Any change to an advance during the exit makes a new revision for payroll.
    await api('fin', 'post', `/advances/${ids.imprest}/return`).send({ amount: '1000', on: today, ref: 'UTR-10' }).expect(200);
    const rows = await inA((tx) => settlementOf(tx, org.A.id, k.id, ids.entity));
    expect((rows[0].recoveries as { source: string; amount: string }[]).filter((r) => r.source === 'expense_advance')).toEqual([expect.objectContaining({ amount: '3000.00', status: 'recorded' })]);
  });

  it('two companies stay apart', async () => {
    await api('adminB', 'get', `/trips/${ids.trip}`).expect(404);
    await api('adminB', 'get', `/advances/${ids.imprest}`).expect(404);
    expect((await api('adminB', 'get', '/advances?view=payout').expect(200)).body.advances).toEqual([]);
  });
});
