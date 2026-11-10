import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { createHash, randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';

// Contract labour CL-4 (answers 626, 634, 685): the contractor's monthly proofs on the portal, the compliance owner's
// verification, the wage check against the minimum wage (IN.MW, verify), liability alerts, the hold on the contractor's
// PAY 8 bills and its release with a reason, and wages the company paid itself recovered from the next approved bill.
// Another company 404, acting for someone 403, finance (no contract labour key) 403 on the release.

jest.setTimeout(300_000);

describe('Contract labour CL-4: vendor compliance', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let redis: Redis;
  const send = jest.fn(async (_m: { to: string; subject: string; html: string }) => ({ success: true }));
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'owner' | 'reader' | 'hr' | 'pay' | 'approver' | 'adminB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const portal = (method: 'get' | 'post', path: string) => request(server())[method](`/api/v1/public/contractor-portal/${org.A.slug}${path}`).set('X-Contractor-Portal', ids.token ?? '');
  type Tx = Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0];
  const inA = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const lastMonth = (() => {
    const [y, m] = today.split('-').map(Number) as [number, number];
    return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  })();
  const pdf = (tag: string) => Buffer.from(`%PDF-1.7\n${run} ${tag}\n%%EOF`);
  const upload = (f: Record<string, string>, file: Buffer | null = pdf(f.kind ?? 'x')) => {
    const r = portal('post', '/pack/items');
    for (const [k, v] of Object.entries(f)) r.field(k, v);
    return file ? r.attach('file', file, { filename: `${f.kind}.pdf`, contentType: 'application/pdf' }) : r;
  };
  const clean = (itemId: string) => inA(async (tx) => tx.file.updateMany({ where: { id: (await tx.contractorPackItem.findFirstOrThrow({ where: { id: itemId } })).fileId, scanStatus: 'pending' }, data: { scanStatus: 'clean', scannedAt: new Date() } }));
  const tracker = async (who: Who = 'owner') => (await api(who, 'get', `/contract-labour/compliance?month=${lastMonth}`).expect(want(200))).body;
  const template = (key: string) => ROLE_TEMPLATES.find((t) => t.key === key)!.permissions;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const keys = await redis.keys('auth:otp:ip:*');
    if (keys.length) await redis.del(...keys);
    planId = (await prisma.plan.create({ data: { name: `clra4-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `CLRA4 Org ${k}`, slug: `clra4-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, readonly string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['owner', 'A', 'panel', ['clra.contractor.manage', 'clra.contractor.view']],
      ['reader', 'A', 'panel', ['clra.contractor.view']],
      ['hr', 'A', 'panel', ['clra.settings.manage']],
      ['pay', 'A', 'panel', template('payroll_admin')],
      ['approver', 'A', 'panel', template('payroll_approver')],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, ks] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = ks ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(ks) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@clra4-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@clra4-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.owner}`).expect(200)).body.accessToken;
    await inA(async (tx) => {
      ids.entity = (await tx.legalEntity.create({ data: { organizationId: org.A.id, name: 'Kaveri Foods Pvt Ltd', shortName: `KF4-${run}`, isDefault: true, tan: 'CHEK12345E', pan: 'AAACK1234F', registeredAddress: { lines: ['1 Mount Road'], city: 'Chennai', state: 'IN-TN', postalCode: '600002', country: 'IN' } } })).id;
      await tx.statutoryRegistration.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity, statute: 'IN.TDS', registrationNo: 'CHEK12345E', responsiblePerson: 'Divya R', responsibleDesignation: 'Director', status: 'on' } });
      const loc = (name: string, code: string) => tx.location.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity!, name, code, address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata', minWageZone: 'A' } });
      ids.hosur = (await loc('Hosur plant', `HSR${run}`)).id;
      ids.chennai = (await loc('Chennai office', `CHN${run}`)).id;
    });
    ids.vetri = (await api('owner', 'post', '/contract-labour/contractors').send({ name: `Vetri Security ${run}`, work: 'Security' }).expect(want(201))).body.id;
    // The contractor's bills are PAY 8 invoices of its consultant record (answer 496).
    ids.k = (await api('pay', 'post', '/payroll/consultants').send({ legalEntityId: ids.entity, name: `Vetri Security ${run}`, kind: 'firm', email: `bills-${run}@vetri.test`, pan: 'AAHFV2210K', defaultSection: '194C' }).expect(want(201))).body.id;
    // A worker deployed at Hosur last month (set up directly: CL-2's checks are tested in contract-labour-2).
    await inA(async (tx) => {
      await tx.agency.update({ where: { id: ids.vetri }, data: { consultantId: ids.k } });
      const p = await tx.person.create({ data: { organizationId: org.A.id, givenName: 'Kannan', familyName: 'S' } });
      ids.dep = (await tx.contractDeployment.create({ data: { organizationId: org.A.id, personId: p.id, agencyId: ids.vetri!, locationId: ids.hosur!, skill: 'unskilled', dob: new Date('1990-01-01T00:00:00Z'), idLast4: '1234', idHash: createHash('sha256').update(run).digest('hex'), fromOn: new Date(`${lastMonth}-01T00:00:00Z`), status: 'deployed', gatePassNo: `GP-${run}`, gateValidTo: new Date(`${addDays(today, 100)}T00:00:00Z`) } })).id;
    });
    ids.contact = (await api('owner', 'post', `/contract-labour/contractors/${ids.vetri}/contacts`).send({ name: 'Meera', email: `meera-${run}@vetri.test` }).expect(want(201))).body.id;
    send.mockClear();
    await request(server()).post(`/api/v1/public/contractor-portal/${org.A.slug}/code`).send({ email: `meera-${run}@vetri.test` }).expect(200);
    let code = '';
    for (let i = 0; i < 50 && !code; i++) {
      const m = send.mock.calls.find(([x]) => x.to === `meera-${run}@vetri.test`);
      if (m) code = m[0].subject.slice(0, 6);
      else await new Promise((r) => setTimeout(r, 100));
    }
    ids.token = (await request(server()).post(`/api/v1/public/contractor-portal/${org.A.slug}/verify`).send({ email: `meera-${run}@vetri.test`, code }).expect(200)).body.token;
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users) as string[];
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        for (const o of [org.A.id, org.B.id]) {
          for (const t of ['contractor_pack_items', 'contractor_wage_lines', 'contractor_packs', 'contractor_direct_payments', 'contract_deployments']) await tx.$executeRawUnsafe(`DELETE FROM "${t}" WHERE organization_id = $1::uuid`, o);
        }
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('the minimum-wage hint (685): from the IN.MW rule sets, marked verify; others refused', async () => {
    const h = (await api('reader', 'get', `/contract-labour/min-wage?locationId=${ids.hosur}&skill=unskilled`).expect(want(200))).body;
    expect(Number(h.monthly)).toBeGreaterThan(0);
    expect(Number(h.daily)).toBeGreaterThan(0);
    expect(typeof h.verify).toBe('boolean');
    ids.minMonthly = h.monthly;
    ids.minDaily = h.daily;
    await api('hr', 'get', `/contract-labour/min-wage?locationId=${ids.hosur}&skill=unskilled`).expect(403);
    await api('adminB', 'get', `/contract-labour/min-wage?locationId=${ids.hosur}&skill=unskilled`).expect(404);
    expect((await portal('get', `/min-wage?locationId=${ids.chennai}&skill=unskilled`)).status).toBe(404);
  });

  it('the portal: the packs owed, uploads with their checks; wrong month, site, numbers or lines refused', async () => {
    const packs = (await portal('get', '/packs').expect(want(200))).body;
    expect(packs).toEqual([expect.objectContaining({ month: lastMonth, site: { id: ids.hosur, name: 'Hosur plant' } })]);
    await portal('get', `/pack?locationId=${ids.chennai}&month=${lastMonth}`).expect(404);
    const base = { locationId: ids.hosur!, month: lastMonth };
    await upload({ ...base, kind: 'pf_challan' }).expect(400);
    await upload({ ...base, kind: 'pf_challan', workersCovered: '0', amount: '100' }, null).expect(400);
    await upload({ ...base, kind: 'bank_proof', workersCovered: '1', amount: '100' }).expect(400);
    await upload({ ...base, month: today.slice(0, 7), kind: 'bank_proof' }).expect(400);
    await upload({ ...base, locationId: ids.chennai!, kind: 'bank_proof' }).expect(404);
    ids.pf = (await upload({ ...base, kind: 'pf_challan', workersCovered: '0', amount: '1800' }).expect(want(201))).body.id;
    ids.esi = (await upload({ ...base, kind: 'esi_challan', workersCovered: '1', amount: '600' }).expect(want(201))).body.id;
    await upload({ ...base, kind: 'wage_register', lines: '[]' }).expect(400);
    await upload({ ...base, kind: 'wage_register', lines: JSON.stringify([{ deploymentId: randomUUID(), days: 26, gross: '100', paidOn: today }]) }).expect(404);
    // Paid for 26 days, ₹920 less than the minimum for those days.
    const due = Math.min(Number(ids.minMonthly), Number(ids.minDaily) * 26);
    ids.short = '920.00';
    ids.wage = (await upload({ ...base, kind: 'wage_register', lines: JSON.stringify([{ deploymentId: ids.dep, days: 26, gross: (due - 920).toFixed(2), paidOn: today }]) }).expect(want(201))).body.id;
    ids.bank = (await upload({ ...base, kind: 'bank_proof' }).expect(want(201))).body.id;
    const p = (await portal('get', `/pack?locationId=${ids.hosur}&month=${lastMonth}`).expect(want(200))).body;
    // Submitted, or overdue once past the 15th (nothing is verified yet).
    expect(['submitted', 'overdue']).toContain(p.status);
    expect(p.checks.find((c: { id: string }) => c.id === 'pf_challan')).toMatchObject({ status: 'fail' });
    expect(p.checks.find((c: { id: string }) => c.id === 'esi_challan')).toMatchObject({ status: 'pass' });
    expect(p.checks.find((c: { id: string }) => c.id === 'min_wage')).toMatchObject({ status: 'fail' });
    expect(p.workers[0]).toMatchObject({ name: 'Kannan S', short: '920.00' });
    expect(p.workers[0].paidByUs).toBeUndefined();
    await request(server()).get(`/api/v1/public/contractor-portal/${org.A.slug}/packs`).set('X-Contractor-Portal', 'nope').expect(401);
  });

  it('the tracker (CLB-03): proofs per contractor and site, liability alerts; readers see, others refused', async () => {
    const t = await tracker('reader');
    expect(t.canManage).toBe(false);
    expect(t.rows).toEqual([expect.objectContaining({ contractor: `Vetri Security ${run}`, deployed: 1 })]);
    expect(['submitted', 'overdue']).toContain(t.rows[0].status);
    const types = t.alerts.map((a: { type: string }) => a.type);
    expect(types).toEqual(expect.arrayContaining(['Short PF challan', 'Wage below minimum']));
    expect(t.alerts.find((a: { type: string }) => a.type === 'Wage below minimum')).toMatchObject({ liability: '920.00', deploymentId: ids.dep });
    await api('hr', 'get', '/contract-labour/compliance').expect(403);
    expect((await api('adminB', 'get', '/contract-labour/compliance').expect(200)).body.rows).toEqual([]);
  });

  it('verification: a short challan cannot be verified; a discrepancy needs a note; the compliance owner only', async () => {
    const v = async (id: string) => (await inA((tx) => tx.contractorPackItem.findFirstOrThrow({ where: { id } }))).version;
    for (const id of [ids.pf, ids.esi, ids.wage, ids.bank]) await clean(id!);
    await api('owner', 'post', `/contract-labour/compliance/proofs/${ids.pf}/verify`).send({ version: await v(ids.pf!) }).expect(409);
    await api('reader', 'post', `/contract-labour/compliance/proofs/${ids.esi}/verify`).send({ version: 1 }).expect(403);
    await api('acting', 'post', `/contract-labour/compliance/proofs/${ids.esi}/verify`).send({ version: 1 }).expect(403);
    await api('adminB', 'post', `/contract-labour/compliance/proofs/${ids.esi}/verify`).send({ version: 1 }).expect(404);
    await api('owner', 'post', `/contract-labour/compliance/proofs/${ids.esi}/verify`).send({ version: 99 }).expect(409);
    await api('owner', 'post', `/contract-labour/compliance/proofs/${ids.esi}/verify`).send({ version: await v(ids.esi!) }).expect(want(201));
    await api('owner', 'post', `/contract-labour/compliance/proofs/${ids.pf}/discrepancy`).send({ version: await v(ids.pf!), note: 'x' }).expect(400);
    await api('owner', 'post', `/contract-labour/compliance/proofs/${ids.pf}/discrepancy`).send({ version: await v(ids.pf!), note: 'Covers 0 of 1 worker.' }).expect(want(201));
    const file = await api('reader', 'get', `/contract-labour/compliance/proofs/${ids.esi}/file`).expect(200);
    expect(file.headers['content-disposition']).toContain('esi_challan.pdf');
    // The contractor replaces the disputed proof; a verified one is final.
    await upload({ locationId: ids.hosur!, month: lastMonth, kind: 'esi_challan', workersCovered: '1', amount: '600' }).expect(409);
  });

  it('the hold (634): a disputed month holds the PAY 8 bill; only the compliance owner releases, with a reason', async () => {
    const t = await tracker();
    expect(t.rows[0]).toMatchObject({ status: 'discrepancy', held: true, heldMonths: [lastMonth] });
    expect((await portal('get', '/bills').expect(200)).body.held).toEqual([lastMonth]);
    // An approved bill of the contractor's consultant record.
    ids.inv = await inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return (await tx.consultantInvoice.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity!, consultantId: ids.k!, invoiceNo: `VS-${run}`, invoiceDate: new Date(`${today}T00:00:00Z`), taxYear: '2026-27', period: new Date(`${lastMonth}-01T00:00:00Z`), taxableValue: '50000', section: '194C', uploadedVia: 'staff', status: 'approved', netPayable: '49500' } })).id;
    });
    const held = await api('pay', 'post', '/payroll/consultant-payouts').send({ invoiceIds: [ids.inv], debitAccount: '123456789012' }).expect(409);
    expect(held.body).toMatchObject({ message: 'Some bills are on hold.' });
    expect(held.body.problems[0]).toContain(lastMonth);
    const r = { contractorId: ids.vetri, month: lastMonth, reason: 'Contractor paid PF late; challan seen on site.' };
    await api('pay', 'post', '/contract-labour/compliance/holds/release').send(r).expect(403);
    await api('reader', 'post', '/contract-labour/compliance/holds/release').send(r).expect(403);
    await api('acting', 'post', '/contract-labour/compliance/holds/release').send(r).expect(403);
    await api('adminB', 'post', '/contract-labour/compliance/holds/release').send(r).expect(404);
    await api('owner', 'post', '/contract-labour/compliance/holds/release').send({ ...r, reason: '' }).expect(400);
    await api('owner', 'post', '/contract-labour/compliance/holds/release').send(r).expect(want(201));
    await api('owner', 'post', '/contract-labour/compliance/holds/release').send(r).expect(409);
    const after = await api('pay', 'post', '/payroll/consultant-payouts').send({ invoiceIds: [ids.inv], debitAccount: '123456789012' });
    expect(after.body.message).not.toBe('Some bills are on hold.');
    expect((await tracker()).rows[0]).toMatchObject({ held: false, released: expect.objectContaining({ reason: r.reason }) });
  });

  it('paid by us (626): recorded and taken off the next approved bill through PAY 8', async () => {
    const d = { deploymentId: ids.dep, month: lastMonth, amount: '920', paidOn: today, reference: 'NEFT-778', reason: 'Wage shortfall paid to the worker.' };
    await api('reader', 'post', '/contract-labour/compliance/direct-payments').send(d).expect(403);
    await api('owner', 'post', '/contract-labour/compliance/direct-payments').send({ ...d, paidOn: addDays(today, 1) }).expect(400);
    await api('owner', 'post', '/contract-labour/compliance/direct-payments').send({ ...d, month: '2000-01' }).expect(400);
    await api('adminB', 'post', '/contract-labour/compliance/direct-payments').send(d).expect(404);
    await api('owner', 'post', '/contract-labour/compliance/direct-payments').send(d).expect(want(201));
    expect((await tracker()).alerts.filter((a: { type: string }) => a.type === 'Wage below minimum')).toEqual([]);
    // The contractor's next bill, submitted and approved through PAY 8: the ₹920 comes off the net.
    const res = await api('pay', 'post', '/payroll/consultant-invoices').send({ consultantId: ids.k, invoiceNo: `VS2-${run}`, invoiceDate: today, period: today.slice(0, 7), taxableValue: '10000' }).expect(want(201));
    const task = ((await api('approver', 'get', '/workflow/approvals/inbox').expect(200)).body as { taskId: string; title: string }[]).find((x) => x.title.endsWith(`invoice VS2-${run}`))!;
    await api('approver', 'post', `/workflow/approvals/tasks/${task.taskId}/decide`).send({ decision: 'approve' }).expect(200);
    const inv = await inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return tx.consultantInvoice.findFirstOrThrow({ where: { id: res.body.id } });
    });
    expect(inv.status).toBe('approved');
    expect(inv.clraRecovery.toFixed(2)).toBe('920.00');
    expect(inv.netPayable!.toFixed(2)).toBe(inv.taxableValue.sub(inv.tdsAmount!).sub(920).toFixed(2));
    const pay = await inA((tx) => tx.contractorDirectPayment.findFirstOrThrow({ where: { deploymentId: ids.dep } }));
    expect(pay).toMatchObject({ recoveredPaise: 92000n, recoveredInvoiceId: res.body.id });
    const bills = (await portal('get', '/bills').expect(200)).body.bills;
    expect(bills.find((b: { no: string }) => b.no === `VS2-${run}`)).toMatchObject({ recovery: '920.00' });
  });

  it('settings: proofs due day and "alert only" turn the hold off; finance cannot change them', async () => {
    await api('pay', 'put', '/contract-labour/settings').send({ changes: [{ key: 'clra.payment_hold', value: 'alert' }] }).expect(403);
    await api('hr', 'put', '/contract-labour/settings').send({ changes: [{ key: 'clra.doc_cutoff', value: '30' }] }).expect(400);
    await api('hr', 'put', '/contract-labour/settings').send({ changes: [{ key: 'clra.payment_hold', value: 'never' }] }).expect(400);
    const s = (await api('hr', 'put', '/contract-labour/settings').send({ changes: [{ key: 'clra.payment_hold', value: 'alert' }, { key: 'clra.doc_cutoff', value: '10' }] }).expect(want(200))).body;
    expect(s.values).toMatchObject({ 'clra.payment_hold': 'alert', 'clra.doc_cutoff': '10' });
    expect((await tracker()).holdMode).toBe('alert');
  });
});
