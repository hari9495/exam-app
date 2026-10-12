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
import { ExpenseClaimsService } from '../src/expenses/claims.service';
import { ExpenseTripsService } from '../src/expenses/trips.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Expenses batch E5 end to end against the real database (forced RLS, the app role): the company rate table (loading it
// twice changes nothing), a bill in another currency at the company rate (the last one before a holiday) and at a card
// rate 4 % higher (flagged, proof needed), a USD forex advance settled by USD bills at its own rate with the unspent
// dollars returned at the day's rate and a separate exchange-difference line, the trip then closing by itself, the
// travel desk closing another trip by hand, a field day's distance as a draft mileage line paid only once confirmed,
// a re-photographed receipt flagged, and finance's reports (totals equal the claims; the GST input CSV).
process.env.EXPENSE_OCR_ADAPTER = 'dev-fake';
process.env.SD_SCANNER = 'dev-fake';

describe('Expenses batch E5', () => {
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
  const decide = (who: Who, taskId: string) => request(server()).post(`/api/v1/workflow/approvals/tasks/${taskId}/decide`).set('Authorization', `Bearer ${token[who]}`).send({ decision: 'approve' });
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const d = (n: number) => new Date(new Date(`${today}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const png = () => Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'), Buffer.from(randomUUID())]);
  type Line = { id: string; version: number; claimed: string; confirmed: boolean; origin: string; fx: { currency: string; amount: string; rate: string; source: string; rateDate: string; variancePct: string | null; hasProof: boolean } | null };
  type Claim = { id: string; version: number; status: string; claimedTotal: string; approvedTotal: string | null; advanceAdjusted: string; netPayable: string; paymentStatus: string; lines: Line[]; flags: { kind: string }[] };
  const claim = async (who: Who, id: string) => (await api(who, 'get', `/claims/${id}`).expect(200)).body as Claim;
  const clean = async () => {
    for (let i = 0; i < 60 && (await inA((tx) => tx.file.count({ where: { organizationId: org.A.id, scanStatus: 'pending' } }))); i++) await new Promise((r) => setTimeout(r, 150));
  };
  /** A receipt read by the dev-fake reader into a new line, then saved as `body` (the employee confirming it). */
  const bill = async (claimId: string, name: string, body: Record<string, unknown>) => {
    const c = (await api('ravi', 'post', `/claims/${claimId}/receipts`).attach('file', png(), { filename: name, contentType: 'image/png' }).expect(201)).body as Claim;
    const l = c.lines[c.lines.length - 1];
    return (await api('ravi', 'put', `/claims/${claimId}/lines/${l.id}`).send({ payMode: 'personal', ...body, version: l.version }).expect(200)).body as Claim;
  };

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

    planId = (await prisma.plan.create({ data: { name: `exp5-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Exp5 Org ${k}`, slug: `exp5-${k.toLowerCase()}-${run}`, planId } });
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
      ['fin', 'A', 'panel', ['expense.payout.manage', 'expense.report.view']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@exp5-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@exp5-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
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
      (await request(server()).post('/api/v1/people/employees').set('Authorization', `Bearer ${token.adminA}`).send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: given, familyName: run, employeeCode: code, joinedOn: '2026-04-06', userId: users[who], workEmail: `${who}@exp5-${run}.test`, assignment: { locationId: ids.mum, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } }).expect(201)).body.id as string;
    emp.head = await hire('head', 'Arun', 'SF-001', null);
    emp.mgr = await hire('mgr', 'Divya', 'SF-002', emp.head);
    emp.ravi = await hire('ravi', 'Neha', 'SF-003', emp.mgr);
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

  it('the company rate table loads once; loading it again changes nothing (XP-5.01)', async () => {
    const rows = [
      { base: 'AED', quote: 'INR', rateDate: d(-9), rate: '22.10' },
      { base: 'AED', quote: 'INR', rateDate: d(-6), rate: '22.75' },
      { base: 'USD', quote: 'INR', rateDate: d(-12), rate: '83.00' },
      { base: 'USD', quote: 'INR', rateDate: d(-1), rate: '84.50' },
    ];
    expect((await api('adminA', 'post', '/fx-rates').send({ rows }).expect(201)).body).toEqual({ added: 4, changed: 0, unchanged: 0 });
    expect((await api('adminA', 'post', '/fx-rates').send({ rows }).expect(201)).body).toEqual({ added: 0, changed: 0, unchanged: 4 });
    expect((await api('adminA', 'get', '/fx-rates').expect(200)).body).toHaveLength(4);
    await api('ravi', 'post', '/fx-rates').send({ rows }).expect(403);
  });

  it('a bill in another currency converts at the company rate; a card rate 4 % higher needs proof and is flagged (XP-5.02, YX-EXP-14)', async () => {
    const c = (await api('ravi', 'post', '/claims').send({ title: 'Dubai client visit' }).expect(201)).body as Claim;
    ids.fxClaim = c.id;
    // Spent on a day without a published rate: the last rate before it is used.
    let got = await bill(c.id, 'receipt__Emirates__Grand Total 1,200.00.png', { categoryCode: 'air', spentOn: d(-5), merchant: 'Emirates', fx: { currency: 'AED', amount: '1200.00' } });
    expect(got.lines[0]).toMatchObject({ claimed: '27300.00', fx: { currency: 'AED', amount: '1200.00', source: 'company_table', rateDate: d(-6) } });
    // A typed pay-currency amount on a foreign bill is refused.
    await api('ravi', 'put', `/claims/${c.id}/lines/${got.lines[0].id}`).send({ payMode: 'personal', categoryCode: 'air', spentOn: d(-5), amount: '27300.00', fx: { currency: 'AED', amount: '1200.00' }, version: got.lines[0].version }).expect(400);
    got = await bill(c.id, 'receipt__Dubai Taxi__Grand Total 300.00.png', { categoryCode: 'air', spentOn: d(-5), merchant: 'Dubai Taxi', fx: { currency: 'AED', amount: '300.00', rate: '23.66' } });
    const card = got.lines[1];
    expect(card).toMatchObject({ claimed: '7098.00', fx: { source: 'manual', variancePct: '4.00', hasProof: false } });
    await clean();
    expect((await api('ravi', 'post', `/claims/${c.id}/submit`).send({ version: got.version }).expect(400)).body.message).toBe('Line 2: upload the statement that shows your rate.');
    got = (await api('ravi', 'post', `/claims/${c.id}/lines/${card.id}/fx-proof`).attach('file', png(), { filename: 'card-statement.png', contentType: 'image/png' }).expect(201)).body;
    await clean();
    got = (await api('ravi', 'post', `/claims/${c.id}/submit`).send({ version: got.version }).expect(200)).body;
    expect(got.flags.map((f) => f.kind)).toContain('fx_rate');
  });

  it('a USD advance is settled by USD bills at its own rate; the rest comes back at the day’s rate with a separate difference line, and the trip closes (XP-5.03, YX-EXP-15)', async () => {
    let t = (await api('ravi', 'post', '/trips').send({ purpose: 'Singapore trade fair', fromOn: d(-11), toOn: d(-3), estimate: '120000', advanceRequested: '500', advanceCurrency: 'USD', legs: [{ fromCity: 'Mumbai', toCity: 'Singapore', country: 'SG', departOn: d(-11), mode: 'air', stayNights: 7 }] }).expect(201)).body;
    t = (await api('ravi', 'post', `/trips/${t.id}/submit`).send({ version: t.version }).expect(200)).body;
    await decide('mgr', (await api('mgr', 'get', `/trips/${t.id}`).expect(200)).body.can.decide).expect(200);
    t = (await api('ravi', 'get', `/trips/${t.id}`).expect(200)).body;
    ids.fxTrip = t.id;
    expect(t.advance).toMatchObject({ currency: 'USD', amount: '500.00', status: 'approved' });
    let a = (await api('fin', 'post', `/advances/${t.advance.id}/pay`).send({ paidOn: d(-12), ref: 'FX-1', version: t.advance.version }).expect(200)).body;
    expect(a).toMatchObject({ status: 'paid', fxRate: '83.00000000', balance: '500.00' });

    const c = (await api('ravi', 'post', '/claims').send({ title: 'Singapore spend', tripId: t.id }).expect(201)).body as Claim;
    const got = await bill(c.id, 'receipt__Marina Hotel__Grand Total 420.00.png', { categoryCode: 'air', spentOn: d(-8), merchant: 'Marina Hotel', fx: { currency: 'USD', amount: '420.00' } });
    expect(got.lines[0]).toMatchObject({ claimed: '34860.00', fx: { source: 'advance', rate: '83.00000000' } });
    await clean();
    await api('ravi', 'post', `/claims/${c.id}/submit`).send({ version: got.version }).expect(200);
    await api('mgr', 'post', `/claims/${c.id}/decide`).send({ decision: 'approve' }).expect(200);
    expect(await claim('ravi', c.id)).toMatchObject({ status: 'approved', approvedTotal: '34860.00', advanceAdjusted: '34860.00', netPayable: '0.00' });
    a = (await api('ravi', 'get', `/advances/${t.advance.id}`).expect(200)).body;
    expect(a.balance).toBe('80.00');

    a = (await api('fin', 'post', `/advances/${t.advance.id}/return`).send({ amount: '80', on: d(-1), ref: 'UTR-USD' }).expect(200)).body;
    expect(a.status).toBe('settled');
    expect((a.ledger as { kind: string; amount: string; amountPay: string }[]).map((x) => [x.kind, x.amount, x.amountPay])).toEqual([
      ['paid', '500.00', '41500.00'],
      ['claim', '-420.00', '-34860.00'],
      ['return', '-80.00', '-6760.00'],
      ['exchange_difference', '0.00', '120.00'],
    ]);
    expect((await api('ravi', 'get', `/trips/${t.id}`).expect(200)).body).toMatchObject({ status: 'closed', closeReason: 'The trip ended, its advance is settled and its claims are decided' });
  });

  it('the travel desk closes a trip by hand, with a reason', async () => {
    let t = (await api('ravi', 'post', '/trips').send({ purpose: 'Pune visit', fromOn: d(-4), toOn: d(-2), estimate: '5000', legs: [{ fromCity: 'Mumbai', toCity: 'Pune', departOn: d(-4), mode: 'road' }] }).expect(201)).body;
    t = (await api('ravi', 'post', `/trips/${t.id}/submit`).send({ version: t.version }).expect(200)).body;
    await decide('mgr', (await api('mgr', 'get', `/trips/${t.id}`).expect(200)).body.can.decide).expect(200);
    await api('ravi', 'post', `/trips/${t.id}/close`).send({ reason: 'Done' }).expect(403);
    // Not asked to book: the desk still sees trips of people in scope.
    expect((await api('desk', 'get', `/trips/${t.id}`).expect(200)).body.can.close).toBe(true);
    await api('desk', 'post', `/trips/${t.id}/close`).send({ reason: 'x' }).expect(400);
    t = (await api('desk', 'post', `/trips/${t.id}/close`).send({ reason: 'Trip done; no claims expected' }).expect(200)).body;
    expect(t).toMatchObject({ status: 'closed', closeReason: 'Trip done; no claims expected' });
  });

  it('a field day’s distance is a draft mileage line, paid only once the employee confirms it (XP-5.04, YX-EXP-16)', async () => {
    const svc = app.get(ExpenseClaimsService);
    const first = await svc.fieldDayDraft(org.A.id, { employeeId: emp.ravi, workOn: d(-1), km: 42, vehicle: 'car', visits: ['Client A', 'Client B'] });
    expect(first).toBeTruthy();
    expect(await svc.fieldDayDraft(org.A.id, { employeeId: emp.ravi, workOn: d(-1), km: 42, vehicle: 'car', visits: [] })).toEqual(first);
    let c = await claim('ravi', first!.claimId);
    expect(c.status).toBe('draft');
    expect(c.lines[0]).toMatchObject({ claimed: '714.00', origin: 'field_day', confirmed: false });
    expect((await api('ravi', 'post', `/claims/${c.id}/submit`).send({ version: c.version }).expect(400)).body.message).toBe('Line 1: check the distance from your field day and save the line.');
    c = (await api('ravi', 'put', `/claims/${c.id}/lines/${c.lines[0].id}`).send({ categoryCode: 'mileage', payMode: 'personal', spentOn: d(-1), mileage: { vehicle: 'car', km: 42 }, version: c.lines[0].version }).expect(200)).body;
    expect(c.lines[0].confirmed).toBe(true);
    c = (await api('ravi', 'post', `/claims/${c.id}/submit`).send({ version: c.version }).expect(200)).body;
    expect(c.status).toBe('submitted');
    await api('mgr', 'post', `/claims/${c.id}/decide`).send({ decision: 'approve' }).expect(200);
  });

  it('a re-photographed receipt is flagged; a different receipt is not (XP-5.05, F4)', async () => {
    const one = (await api('ravi', 'post', '/claims').send({ title: 'Lunch one' }).expect(201)).body as Claim;
    await bill(one.id, 'receipt__Cafe One__Grand Total 450.00__phash=f0e1d2c3b4a59687.png', { categoryCode: 'meals', spentOn: d(-2), city: 'Mumbai', amount: '450.00' });
    const two = (await api('ravi', 'post', '/claims').send({ title: 'Lunch two' }).expect(201)).body as Claim;
    await bill(two.id, 'receipt__Cafe One__Grand Total 450.00__phash=f0e1d2c3b4a596f8.png', { categoryCode: 'meals', spentOn: d(-3), city: 'Mumbai', amount: '450.00' });
    const three = (await api('ravi', 'post', '/claims').send({ title: 'Lunch three' }).expect(201)).body as Claim;
    await bill(three.id, 'receipt__Cafe Two__Grand Total 310.00__phash=0f1e2d3c4b5a6978.png', { categoryCode: 'meals', spentOn: d(-4), city: 'Mumbai', amount: '310.00' });
    const kinds = async (id: string) => ((await api('ravi', 'post', `/claims/${id}/check`).expect(200)).body.flags as { kind: string }[]).map((f) => f.kind);
    expect(await kinds(two.id)).toContain('look_alike_image');
    expect(await kinds(three.id)).not.toContain('look_alike_image');
  });

  it('reports: totals equal the claims; the GST input CSV is in the GSTR-2B column order; others cannot read them (XP-5.06)', async () => {
    const from = d(-30);
    const sum = (await api('fin', 'get', `/reports/summary?from=${from}&to=${today}`).expect(200)).body as { rows: { approved: string }[] };
    const approved = await inA((tx) => tx.$queryRaw<{ s: string }[]>`
      SELECT COALESCE(sum(COALESCE(l.approved, l.claimed)), 0)::text AS s FROM expense_lines l JOIN expense_claims c ON c.organization_id = l.organization_id AND c.id = l.claim_id
      WHERE c.organization_id = ${org.A.id}::uuid AND l.removed_at IS NULL AND l.pay_mode <> 'company_paid' AND c.status IN ('approved', 'partly_approved')`);
    expect(sum.rows.reduce((t, r) => t + Number(r.approved), 0).toFixed(2)).toBe(Number(approved[0].s).toFixed(2));
    const ageing = (await api('fin', 'get', '/reports/advance-ageing').expect(200)).body;
    expect(ageing.rows).toEqual([]);
    const csv = await api('fin', 'get', `/reports/gst-input?from=${from}&to=${today}&format=csv`).expect(200);
    expect(csv.headers['content-type']).toMatch(/^text\/csv/);
    expect(csv.text.split('\r\n')[0]).toBe('GSTIN of supplier,Trade/Legal name,Invoice number,Invoice type,Invoice Date,Invoice Value,Place of supply,Supply Attract Reverse Charge,Rate (%),Taxable Value,Integrated Tax,Central Tax,State/UT Tax,Cess,IRN,ITC status,Billed to GSTIN,Legal entity,Claim');
    await api('fin', 'get', '/reports/approver-patterns').expect(200);
    await api('fin', 'get', '/reports/nonsense').expect(400);
    await api('ravi', 'get', '/reports/summary').expect(403);
    expect((await api('adminB', 'get', '/reports/unpaid').expect(200)).body.rows).toEqual([]);
  });

  it('two companies stay apart', async () => {
    await api('adminB', 'get', `/trips/${ids.fxTrip}`).expect(404);
    expect((await api('adminB', 'get', '/fx-rates').expect(200)).body).toEqual([]);
    expect(app.get(ExpenseTripsService)).toBeTruthy();
  });
});
