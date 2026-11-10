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
import { gstinCheckChar } from '../src/expenses/checks';
import { financialYear } from '../src/staffing/staffing-rules';
import { StaffingJobsService } from '../src/staffing/staffing-jobs.service';
import { payScope } from '../src/payroll/pay-access';

// Staffing desk slice 3 end to end (HIR-18 invoices and vendor invoices, HIR-19 receivables, HIR-30 fees, HIR-31 the
// e-invoice window, the client portal per contact): approved hours become invoices numbered from the series (only up),
// an issued invoice is corrected only by a credit note, receipts with TDS settle invoices exactly, recruiters and
// account managers see only what is theirs, another company gets 404, acting for someone 403.

jest.setTimeout(300_000);

describe('Staffing desk slice 3', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jobs: StaffingJobsService;
  let tenantPrisma: TenantPrismaService;
  const send = jest.fn(async (_m: { to: string; subject: string; html: string }) => ({ success: true }));
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'am' | 'fin' | 'rec' | 'emp' | 'adminB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const portal = (method: 'get' | 'post', path: string, t?: string) => {
    const r = request(server())[method](`/api/v1/public/client-portal/${org.A.slug}${path}`);
    return t ? r.set('X-Client-Portal', t) : r;
  };
  type Tx = Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0];
  const inA = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const inB = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const day = (s: string) => new Date(`${s}T00:00:00Z`);
  const monday = (iso: string) => addDays(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));
  const gstin = (first14: string) => first14 + gstinCheckChar(first14);
  const OURS = gstin('29AABCK1234F1Z');
  // Two weeks in the previous month (days 8–21), so both count in one month.
  const prevFirst = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10);
  const w1 = monday(addDays(prevFirst, 13));
  const w2 = addDays(w1, 7);
  const month = w1.slice(0, 7);
  const settings = (who: Who, changes: { key: string; value: string }[]) => api(who, 'put', '/staffing/settings').send({ changes });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    jobs = moduleRef.get(StaffingJobsService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `staff3-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `STAFF3 Org ${k}`, slug: `staff3-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['am', 'A', 'panel', ['ats.staffing.manage', 'ats.staffing.view']],
      ['fin', 'A', 'panel', ['ats.staffing.billing', 'ats.staffing.view']],
      ['rec', 'A', 'panel', ['ats.staffing.view']],
      ['emp', 'A', 'panel', []],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@staff3-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@staff3-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.fin}`).expect(200)).body.accessToken;
    await settings('am', [{ key: 'staffing.desk.enabled', value: 'on' }, { key: 'staffing.rate_change.backdate_days', value: '90' }]).expect(want(200));
    await settings('adminB', [{ key: 'staffing.desk.enabled', value: 'on' }]).expect(want(200));
    await inA(async (tx) => {
      ids.entity = (await tx.legalEntity.create({ data: { organizationId: org.A.id, name: 'Kaveri Staffing Pvt Ltd', shortName: `KS3-${run}`, isDefault: true, gstin: OURS } })).id;
      const person = await tx.person.create({ data: { organizationId: org.A.id, givenName: 'Arun', familyName: 'Kumar' } });
      ids.arun = (await tx.employee.create({ data: { organizationId: org.A.id, personId: person.id, givenName: 'Arun', familyName: 'Kumar' } })).id;
      ids.agency = (await tx.agency.create({ data: { organizationId: org.A.id, name: `Velocity ${run}`, portalToken: randomUUID(), pan: 'ABCDE1234F', tdsSection: '194C', gstin: gstin('29ABCDE1234F1Z') } })).id;
    });
    ids.series = (await api('am', 'post', '/staffing/invoice-series').send({ legalEntityId: ids.entity, gstin: OURS, financialYear: financialYear(w1), prefix: 'KS/', nextNumber: 41 }).expect(want(201))).body.id;
    const client = (name: string, state: string, extra: Record<string, unknown> = {}) => ({ name: `${name} ${run}`, legalName: name, state, billingAddress: 'Somewhere', status: 'active', contractStart: '2026-04-01', contractEnd: '2027-03-31', ...extra });
    ids.tn = (await api('am', 'post', '/staffing/clients').send(client('Nilgiri Retail', 'IN-TN', { tdsSection: '194C', invoiceGrouping: 'month', paymentTermsDays: 30 })).expect(want(201))).body.id;
    ids.ka = (await api('am', 'post', '/staffing/clients').send(client('Coromandel', 'IN-KA', { invoiceGrouping: 'placement' })).expect(want(201))).body.id;
    ids.contact = (await api('am', 'post', `/staffing/clients/${ids.tn}/contacts`).send({ name: 'Meera Pillai', role: 'HR head', email: `meera-${run}@nilgiri.test`, billing: true }).expect(want(201))).body.id;
    ids.contactKa = (await api('am', 'post', `/staffing/clients/${ids.ka}/contacts`).send({ name: 'Ravi', role: 'TA', email: `ravi-${run}@coromandel.test` }).expect(want(201))).body.id;
    for (const [k, cl] of [['tnLine', 'tn'], ['kaLine', 'ka']] as const) {
      await api('am', 'post', `/staffing/clients/${ids[cl]}/rates`).send({ role: 'Java Developer', skill: 'Java', location: 'Chennai', unit: 'hour', billRate: '1200', payRate: '800', validFrom: addDays(today, -85) }).expect(want(201));
      ids[k] = (await inA((tx) => tx.staffingRate.findFirstOrThrow({ where: { clientId: ids[cl] } }))).lineId;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id, startOn: day(addDays(today, -80)), endOn: day(addDays(today, 200)) };
      ids.pOwn = (await tx.staffingPlacement.create({ data: { ...x, clientId: ids.tn!, lineId: ids.tnLine!, supply: 'own', employeeId: ids.arun!, workerName: 'Arun Kumar' } })).id;
      ids.pVendor = (await tx.staffingPlacement.create({ data: { ...x, clientId: ids.tn!, lineId: ids.tnLine!, supply: 'vendor', agencyId: ids.agency!, workerName: 'Priya Nair', vendorRatePaise: 90000n } })).id;
      ids.pKa = (await tx.staffingPlacement.create({ data: { ...x, clientId: ids.ka!, lineId: ids.kaLine!, supply: 'vendor', agencyId: ids.agency!, workerName: 'Kiran Joshi', vendorRatePaise: 95000n } })).id;
    });
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users) as string[];
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        for (const o of [org.A.id, org.B.id]) {
          for (const t of ['staffing_receipt_allocations', 'staffing_receipts', 'staffing_vendor_bills', 'staffing_hours', 'staffing_invoice_lines', 'staffing_bench_pay'] as const) await tx.$executeRawUnsafe(`DELETE FROM "${t}" WHERE organization_id = $1::uuid`, o);
          await tx.$executeRawUnsafe(`DELETE FROM "staffing_invoices" WHERE organization_id = $1::uuid AND credit_of IS NOT NULL`, o);
          await tx.$executeRawUnsafe(`DELETE FROM "staffing_invoices" WHERE organization_id = $1::uuid`, o);
        }
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('6.2: collections and e-invoicing have defaults; the client keeps its TDS section and grouping', async () => {
    const s = (await api('am', 'get', '/staffing/settings').expect(200)).body;
    expect(s.values).toMatchObject({ 'staffing.dunning.schedule': 'standard', 'staffing.einvoice.applies': 'off' });
    await settings('am', [{ key: 'staffing.dunning.schedule', value: 'often' }]).expect(400);
    await settings('rec', [{ key: 'staffing.einvoice.applies', value: 'on' }]).expect(403);
    expect((await api('rec', 'get', `/staffing/clients/${ids.tn}`).expect(200)).body.client).toMatchObject({ tdsSection: '194C', invoiceGrouping: 'month' });
    await api('am', 'post', '/staffing/clients').send({ name: 'Bad', state: 'IN-TN', billingAddress: 'x', tdsSection: '194Z' }).expect(400);
  });

  it('hours: account managers enter weeks; Monday only, inside the placement; others refused', async () => {
    const h = (who: Who, pid: string, b: Record<string, unknown>) => api(who, 'post', `/staffing/placements/${pid}/hours`).send(b);
    await h('rec', ids.pOwn!, { weekStart: w1, hours: '40' }).expect(403);
    await h('fin', ids.pOwn!, { weekStart: w1, hours: '40' }).expect(403);
    await h('adminB', ids.pOwn!, { weekStart: w1, hours: '40' }).expect(404);
    for (const b of [{ weekStart: addDays(w1, 1), hours: '40' }, { weekStart: w1, hours: '40.555' }, { weekStart: w1, hours: '0' }, { weekStart: addDays(today, 14 - ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7)), hours: '8' }, { weekStart: monday(addDays(today, -200)), hours: '8' }])
      await h('am', ids.pOwn!, b).expect(400);
    await h('am', ids.pOwn!, { weekStart: w1, hours: '40', overtime: '2.5' }).expect(want(201));
    await h('am', ids.pOwn!, { weekStart: w2, hours: '38' }).expect(want(201));
    await h('am', ids.pVendor!, { weekStart: w1, hours: '40' }).expect(want(201));
    await h('am', ids.pKa!, { weekStart: w1, hours: '20' }).expect(want(201));
    const list = (await api('fin', 'get', `/staffing/placements/${ids.pOwn}/hours`).expect(200)).body;
    expect(list.canEnter).toBe(false);
    expect(list.rows.map((r: { weekStart: string; hours: string; overtime: string; status: string }) => [r.weekStart, r.hours, r.overtime, r.status])).toEqual([[w2, '38', '0', 'waiting'], [w1, '40', '2.5', 'waiting']]);
    await api('rec', 'get', `/staffing/placements/${ids.pOwn}/hours`).expect(403);
  });

  it('client portal: access per contact, email code, own client only; approve, send back; shortlist and reject', async () => {
    await api('rec', 'post', `/staffing/clients/${ids.tn}/contacts/${ids.contact}/portal`).send({ access: true }).expect(403);
    await api('adminB', 'post', `/staffing/clients/${ids.tn}/contacts/${ids.contact}/portal`).send({ access: true }).expect(404);
    send.mockClear();
    await api('am', 'post', `/staffing/clients/${ids.tn}/contacts/${ids.contact}/portal`).send({ access: true }).expect(want(201));
    await api('am', 'post', `/staffing/clients/${ids.tn}/contacts/${ids.contact}/portal`).send({ access: true }).expect(409);
    expect(send.mock.calls.some(([m]) => m.to === `meera-${run}@nilgiri.test` && m.html.includes(`/yx/client/${org.A.slug}`))).toBe(true);
    const signIn = async (email: string) => {
      send.mockClear();
      await portal('post', '/code').send({ email }).expect(200);
      let code = '';
      for (let i = 0; i < 50 && !code; i++) {
        const m = send.mock.calls.find(([x]) => x.to === email);
        if (m) code = m[0].subject.slice(0, 6);
        else await new Promise((r) => setTimeout(r, 100));
      }
      return code;
    };
    // A contact without access gets the same answer and no code.
    expect(await Promise.race([signIn(`ravi-${run}@coromandel.test`), new Promise<string>((r) => setTimeout(() => r(''), 2500))])).toBe('');
    const code = await signIn(`meera-${run}@nilgiri.test`);
    await portal('post', '/verify').send({ email: `meera-${run}@nilgiri.test`, code: code === '000000' ? '111111' : '000000' }).expect(401);
    const t = (await portal('post', '/verify').send({ email: `meera-${run}@nilgiri.test`, code }).expect(200)).body.token as string;
    ids.portalToken = t;
    await portal('get', '/me').expect(401);
    await portal('get', '/me', 'not-a-token').expect(401);
    const me = (await portal('get', '/me', t).expect(200)).body;
    expect(me.client).toMatchObject({ name: `Nilgiri Retail ${run}`, contact: 'Meera Pillai' });
    expect(me.timesheets.map((x: { worker: string; status: string }) => [x.worker, x.status]).sort()).toEqual([['Arun Kumar', 'Waiting for you'], ['Arun Kumar', 'Waiting for you'], ['Priya Nair', 'Waiting for you']]);
    expect(me.timesheets.find((x: { worker: string }) => x.worker === 'Priya Nair').vendor).toBe(`Velocity ${run}`);
    expect(JSON.stringify(me)).not.toMatch(/Kiran Joshi|Coromandel|800\.00|900\.00/); // never another client, pay or vendor rates
    expect((await inA((tx) => tx.staffingClientContact.findUniqueOrThrow({ where: { id: ids.contact } }))).portal).toBe('active');
    // Another client's timesheet: 403.
    const kaHours = (await inA((tx) => tx.staffingHours.findFirstOrThrow({ where: { placementId: ids.pKa } }))).id;
    await portal('post', `/timesheets/${kaHours}/approve`, t).expect(403);
    const own = me.timesheets.filter((x: { worker: string }) => x.worker === 'Arun Kumar');
    const w1Own = own.find((x: { weekStart: string }) => x.weekStart === w1);
    const w2Own = own.find((x: { weekStart: string }) => x.weekStart === w2);
    await portal('post', `/timesheets/${w2Own.id}/send-back`, t).send({ note: 'x'.repeat(501) }).expect(400);
    await portal('post', `/timesheets/${w2Own.id}/send-back`, t).send({ note: 'Thursday was a holiday' }).expect(200);
    await portal('post', `/timesheets/${w1Own.id}/approve`, t).expect(200);
    await portal('post', `/timesheets/${w1Own.id}/approve`, t).expect(409);
    // Resent after the correction; approved again.
    await api('am', 'post', `/staffing/placements/${ids.pOwn}/hours`).send({ weekStart: w2, hours: '30' }).expect(want(201));
    await portal('post', `/timesheets/${w2Own.id}/approve`, t).expect(200);
    await api('am', 'post', `/staffing/placements/${ids.pOwn}/hours`).send({ weekStart: w2, hours: '31' }).expect(409); // approved
    // The account manager records an approval for the vendor worker and the other client (no portal).
    const vendorHours = (await inA((tx) => tx.staffingHours.findFirstOrThrow({ where: { placementId: ids.pVendor } })));
    await api('am', 'post', `/staffing/hours/${vendorHours.id}/approve`).send({ contactId: ids.contactKa, version: vendorHours.version }).expect(400); // not this client's contact
    await api('am', 'post', `/staffing/hours/${vendorHours.id}/approve`).send({ contactId: ids.contact, version: vendorHours.version }).expect(want(201));
    const ka = await inA((tx) => tx.staffingHours.findFirstOrThrow({ where: { placementId: ids.pKa } }));
    await api('am', 'post', `/staffing/hours/${ka.id}/approve`).send({ contactId: ids.contactKa, version: ka.version }).expect(want(201));
    // Submissions: shortlist, reject with feedback; another client's is refused.
    await inA(async (tx) => {
      const job = await tx.job.create({ data: { organizationId: org.A.id, title: 'Java Developer', status: 'open', staffingClientId: ids.tn, staffingLineId: ids.tnLine, createdById: users.am! } });
      const base = { organizationId: org.A.id, clientId: ids.tn!, jobId: job.id, lineId: ids.tnLine!, contactId: ids.contact!, billRatePaise: 120000n };
      ids.s1 = (await tx.staffingSubmission.create({ data: { ...base, employeeId: ids.arun } })).id;
      const c2 = await tx.candidate.create({ data: { organizationId: org.A.id, email: `deepa-${run}@mail.test`, name: 'Deepa Nair' } });
      ids.s2 = (await tx.staffingSubmission.create({ data: { ...base, candidateId: c2.id } })).id;
      const jobKa = await tx.job.create({ data: { organizationId: org.A.id, title: 'Java Developer', status: 'open', staffingClientId: ids.ka, staffingLineId: ids.kaLine, createdById: users.am! } });
      ids.sKa = (await tx.staffingSubmission.create({ data: { ...base, jobId: jobKa.id, clientId: ids.ka!, contactId: ids.contactKa!, lineId: ids.kaLine!, candidateId: c2.id } })).id;
    });
    await portal('post', `/submissions/${ids.sKa}/decision`, t).send({ decision: 'shortlist' }).expect(403);
    await portal('post', `/submissions/${ids.s2}/decision`, t).send({ decision: 'reject' }).expect(400);
    await portal('post', `/submissions/${ids.s1}/decision`, t).send({ decision: 'shortlist' }).expect(200);
    await portal('post', `/submissions/${ids.s2}/decision`, t).send({ decision: 'reject', feedback: 'Needs Spring Boot' }).expect(200);
    const board = (await api('am', 'get', '/staffing/submissions').expect(200)).body;
    expect(board.find((x: { id: string }) => x.id === ids.s2)).toMatchObject({ stage: 'rejected', rejectedReason: 'Needs Spring Boot' });
    expect(board.find((x: { id: string }) => x.id === ids.s1).stage).toBe('client_review');
    // Removing access ends the session.
    await api('am', 'post', `/staffing/clients/${ids.tn}/contacts/${ids.contact}/portal`).send({ access: false }).expect(want(201));
    await portal('get', '/me', t).expect(401);
  });

  it('invoices: drafts from approved hours (grouping per client), numbered on issue, never edited; IGST vs CGST + SGST', async () => {
    const opts = (await api('fin', 'get', '/staffing/invoices/options').expect(200)).body;
    expect(opts.clients.map((c: { name: string; months: string[] }) => [c.name, c.months]).sort()).toEqual([[`Coromandel ${run}`, [month]], [`Nilgiri Retail ${run}`, [month]]]);
    await api('am', 'get', '/staffing/invoices/options').expect(403);
    const d = (who: Who, b: Record<string, unknown>) => api(who, 'post', '/staffing/invoices/draft').send({ clientId: ids.tn, month, seriesId: ids.series, ...b });
    await d('am', {}).expect(403);
    await d('rec', {}).expect(403);
    await d('acting', {}).expect(403);
    await d('adminB', {}).expect(404);
    await d('fin', { month: '2020-01' }).expect(400);
    await d('fin', { month: '2026-13' }).expect(400);
    const [tnDraft] = (await d('fin', { po: 'PO-7781' }).expect(want(201))).body.ids;
    await d('fin', {}).expect(400); // nothing left
    const ka = (await d('fin', { clientId: ids.ka }).expect(want(201))).body.ids;
    expect(ka).toHaveLength(1); // per placement: one placement
    const v = (await api('fin', 'get', `/staffing/invoices/${tnDraft}`).expect(200)).body;
    // TN client billed from a Karnataka GSTIN: IGST. 40 h + 2.5 OT at 1.5× + 30 h for Arun; 40 h for Priya.
    expect(v.lines.map((l: { description: string; qty: string; rate: string; amount: string }) => [l.description, l.qty, l.rate, l.amount]).sort()).toEqual([
      ['Arun Kumar · Java Developer · 70 h', '70', '1200.00', '84000.00'],
      ['Arun Kumar · Java Developer · overtime · 2.5 h', '2.5', '1800.00', '4500.00'],
      ['Priya Nair · Java Developer · 40 h', '40', '1200.00', '48000.00'],
    ]);
    expect(v.invoice).toMatchObject({ number: null, status: 'draft', interState: true, taxable: '136500.00', igst: '24570.00', cgst: '0.00', total: '161070.00', po: 'PO-7781' });
    const kv = (await api('fin', 'get', `/staffing/invoices/${ka[0]}`).expect(200)).body.invoice;
    expect(kv).toMatchObject({ interState: false, taxable: '24000.00', cgst: '2160.00', sgst: '2160.00', igst: '0.00', total: '28320.00' });
    // AM reads; recruiter and employee see no invoices; another company 404.
    expect((await api('am', 'get', '/staffing/invoices').expect(200)).body.canCreate).toBe(false);
    await api('rec', 'get', '/staffing/invoices').expect(403);
    await api('emp', 'get', '/staffing/invoices').expect(403);
    await api('adminB', 'get', `/staffing/invoices/${tnDraft}`).expect(404);
    // A draft can go; its hours are free again; then it is drafted again.
    await api('fin', 'delete', `/staffing/invoices/${ka[0]}`).expect(want(200));
    ids.kaDraft = (await d('fin', { clientId: ids.ka }).expect(want(201))).body.ids[0];
    // Issue: next number, today; then never deleted or reissued as a draft.
    await api('fin', 'post', `/staffing/invoices/${tnDraft}/issue`).send({ version: 9 }).expect(409);
    await api('acting', 'post', `/staffing/invoices/${tnDraft}/issue`).send({ version: 1 }).expect(403);
    expect((await api('fin', 'post', `/staffing/invoices/${tnDraft}/issue`).send({ version: 1 }).expect(want(201))).body.number).toBe('KS/41');
    expect((await api('fin', 'post', `/staffing/invoices/${ids.kaDraft}/issue`).send({ version: 1 }).expect(want(201))).body.number).toBe('KS/42');
    await api('fin', 'post', `/staffing/invoices/${tnDraft}/issue`).send({ version: 2 }).expect(409);
    await api('fin', 'delete', `/staffing/invoices/${tnDraft}`).expect(409);
    ids.inv = tnDraft;
    // The series only goes up; the used numbers are gone for good.
    const series = (await api('am', 'get', '/staffing/settings').expect(200)).body.series.find((s: { id: string }) => s.id === ids.series);
    expect(series.nextNumber).toBe(43);
    await api('am', 'put', `/staffing/invoice-series/${ids.series}`).send({ legalEntityId: ids.entity, gstin: OURS, financialYear: financialYear(w1), prefix: 'KS/', nextNumber: 41, version: series.version }).expect(400);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'staffing.invoice.issued' } }))).toBe(2);
  });

  it('credit notes: their own number, never more than is left; cancel and reissue only an untouched invoice', async () => {
    const cn = (b: Record<string, unknown>) => api('fin', 'post', `/staffing/invoices/${ids.inv}/credit-note`).send({ amount: '4500', reason: 'Overtime not agreed', ...b });
    await api('am', 'post', `/staffing/invoices/${ids.inv}/credit-note`).send({ amount: '1', reason: 'x y z' }).expect(403);
    await cn({ amount: '136500.01' }).expect(400);
    await cn({ reason: '' }).expect(400);
    await cn({ amount: '0' }).expect(400);
    expect((await cn({}).expect(want(201))).body.number).toBe('KS/CN1');
    await cn({ amount: '132000.01' }).expect(400); // only 132000 left
    const v = (await api('fin', 'get', `/staffing/invoices/${ids.inv}`).expect(200)).body;
    expect(v.creditNotes).toEqual([expect.objectContaining({ number: 'KS/CN1', amount: '5310.00', reason: 'Overtime not agreed' })]);
    expect(v.invoice.outstanding).toBe('155760.00');
    await api('fin', 'post', `/staffing/invoices/${ids.inv}/reissue`).send({ reason: 'Past the IRN window' }).expect(409); // has a credit note
    const r = (await api('fin', 'post', `/staffing/invoices/${ids.kaDraft}/reissue`).send({ reason: 'Past the IRN window' }).expect(want(201))).body;
    const again = (await api('fin', 'get', `/staffing/invoices/${r.draftId}`).expect(200)).body.invoice;
    expect(again).toMatchObject({ status: 'draft', total: '28320.00' });
    expect((await api('fin', 'post', `/staffing/invoices/${r.draftId}/issue`).send({ version: 1 }).expect(want(201))).body.number).toBe('KS/43');
    ids.kaInv = r.draftId;
  });

  it('the e-invoice window comes from the rule set and the company setting; no IRP connection', async () => {
    expect((await api('fin', 'get', `/staffing/invoices/${ids.inv}`).expect(200)).body.invoice).toMatchObject({ irn: 'not_needed', window: null });
    await settings('am', [{ key: 'staffing.einvoice.applies', value: 'on' }]).expect(want(200));
    const id = (await api('fin', 'post', '/staffing/invoices/draft').send({ clientId: ids.ka, month, seriesId: ids.series }).expect(400)); // nothing to bill
    void id;
    // Back-date an issued invoice to see the window states (data only).
    await inA((tx) => tx.staffingInvoice.update({ where: { id: ids.kaInv }, data: { irn: 'pending', invoiceDate: day(addDays(today, -27)) } }));
    const v = (await api('fin', 'get', `/staffing/invoices/${ids.kaInv}`).expect(200)).body;
    expect(v.invoice.window).toEqual({ days: 27, state: 'warning' });
    expect(v.rule).toMatchObject({ reportWithinDays: 30, warnFromDay: 25 });
    await inA((tx) => tx.staffingInvoice.update({ where: { id: ids.kaInv }, data: { invoiceDate: day(addDays(today, -33)) } }));
    expect((await api('fin', 'get', `/staffing/invoices/${ids.kaInv}`).expect(200)).body.invoice.window).toEqual({ days: 33, state: 'blocked' });
    await settings('am', [{ key: 'staffing.einvoice.applies', value: 'off' }]).expect(want(200));
    expect((await api('fin', 'get', `/staffing/invoices/${ids.kaInv}`).expect(200)).body.invoice.window.state).toBe('not_applicable');
  });

  it('receipts: cash + TDS settle invoices exactly; ledger ageing, 26AS and disputes; finance only', async () => {
    const r = (who: Who, b: Record<string, unknown>) => api(who, 'post', '/staffing/receipts').send({ clientId: ids.tn, receivedOn: today, amount: '100000', tds: '2730', allocations: [{ invoiceId: ids.inv, amount: '102730' }], ...b });
    await r('am', {}).expect(403);
    await r('acting', {}).expect(403);
    await r('adminB', {}).expect(404);
    await r('fin', { allocations: [{ invoiceId: ids.inv, amount: '100000' }] }).expect(400); // must add up
    await r('fin', { allocations: [{ invoiceId: ids.kaInv, amount: '102730' }] }).expect(400); // another client's invoice
    await r('fin', { receivedOn: addDays(today, 1) }).expect(400);
    await r('fin', { amount: '200000', allocations: [{ invoiceId: ids.inv, amount: '202730' }] }).expect(400); // more than outstanding
    await r('fin', {}).expect(want(201));
    const led = (await api('fin', 'get', '/staffing/receivables').expect(200)).body;
    const row = led.rows.find((x: { invoiceId: string }) => x.invoiceId === ids.inv);
    expect(row).toMatchObject({ client: `Nilgiri Retail ${run}`, tdsSection: '194C', outstanding: '53030.00', tdsDeducted: '2730.00', tds26as: null, bucket: '0–30', dispute: null });
    expect(row.nextReminder).toBe(addDays(row.dueOn, -3));
    expect((await api('fin', 'get', `/staffing/invoices/${ids.inv}`).expect(200)).body.invoice.status).toBe('part_paid');
    await api('am', 'get', '/staffing/receivables').expect(403);
    await api('rec', 'get', '/staffing/receivables').expect(403);
    const c = (b: Record<string, unknown>) => api('fin', 'put', `/staffing/invoices/${ids.inv}/collection`).send({ version: row.version, ...b });
    await c({ tds26as: '2700', dispute: 'Client disputes 2 hours on week 2' }).expect(want(200));
    await c({ dispute: null }).expect(409); // stale version
    const after = (await api('fin', 'get', '/staffing/receivables').expect(200)).body.rows.find((x: { invoiceId: string }) => x.invoiceId === ids.inv);
    expect(after).toMatchObject({ tds26as: '2700.00', dispute: 'Client disputes 2 hours on week 2', nextReminder: null });
    // Paying the rest closes it.
    await r('fin', { amount: '53030', tds: '0', allocations: [{ invoiceId: ids.inv, amount: '53030' }] }).expect(want(201));
    expect((await api('fin', 'get', '/staffing/receivables').expect(200)).body.rows.some((x: { invoiceId: string }) => x.invoiceId === ids.inv)).toBe(false);
    expect((await api('fin', 'get', `/staffing/invoices/${ids.inv}`).expect(200)).body.invoice.status).toBe('paid');
  });

  it('fees and guarantee: account managers set them per client; the taper only goes down; finance reads', async () => {
    const t = (who: Who, b: Record<string, unknown>) => api(who, 'put', `/staffing/clients/${ids.tn}/terms`).send({ feeKind: 'percent', feePct: '8.33', taper: [{ fromMonth: 0, pct: '8.33' }, { fromMonth: 3, pct: '6' }, { fromMonth: 12, pct: '0' }], guaranteeDays: 90, remedy: 'replace', ...b });
    await t('fin', {}).expect(403);
    await t('rec', {}).expect(403);
    await t('adminB', {}).expect(404);
    for (const b of [{ feePct: '120' }, { feePct: '8.333' }, { feeKind: 'fixed' }, { taper: [{ fromMonth: 1, pct: '5' }] }, { taper: [{ fromMonth: 0, pct: '5' }, { fromMonth: 3, pct: '6' }] }, { guaranteeDays: 400 }, { remedy: 'refund-ish' }])
      await t('am', b).expect(400);
    await t('am', {}).expect(want(200));
    await t('am', { feeKind: 'fixed', feeAmount: '150000', remedy: 'refund', version: 9 }).expect(409);
    await t('am', { feeKind: 'fixed', feeAmount: '150000', remedy: 'refund', version: 1 }).expect(want(200));
    const got = (await api('fin', 'get', `/staffing/clients/${ids.tn}/terms`).expect(200)).body;
    expect(got).toMatchObject({ canEdit: false, terms: { feeKind: 'fixed', feeAmount: '150000.00', feePct: null, guaranteeDays: 90, remedy: 'refund', version: 2, taper: [{ fromMonth: 0, pct: '8.33' }, { fromMonth: 3, pct: '6.00' }, { fromMonth: 12, pct: '0.00' }] } });
    await api('rec', 'get', `/staffing/clients/${ids.tn}/terms`).expect(403);
  });

  it('vendor invoices: proposed from approved hours × the vendor rate with GST and TDS from the rule sets; confirm once, then paid', async () => {
    const list = (await api('fin', 'get', '/staffing/vendor-bills').expect(200)).body;
    const priya = list.rows.find((r: { worker: string }) => r.worker === 'Priya Nair');
    // 40 h × ₹900 = ₹36,000; the vendor has a GSTIN: 18%; 194C, PAN of a company: 2%.
    expect(priya).toMatchObject({ id: null, status: 'waiting', vendor: `Velocity ${run}`, month, hours: '40', rate: '900.00', net: '36000.00', gst: '6480.00', tdsSection: '194C', tds: '720.00' });
    await api('am', 'get', '/staffing/vendor-bills').expect(403);
    const b = { placementId: ids.pVendor, month, vendorInvoiceNo: 'VT/26-27/044' };
    await api('acting', 'post', '/staffing/vendor-bills').send(b).expect(403);
    await api('adminB', 'post', '/staffing/vendor-bills').send(b).expect(404);
    await api('fin', 'post', '/staffing/vendor-bills').send({ ...b, vendorInvoiceNo: '' }).expect(400);
    await api('fin', 'post', '/staffing/vendor-bills').send({ ...b, placementId: ids.pOwn }).expect(404); // not vendor supplied
    // Round 4 (answer 496): only a vendor linked to its consultant record in payroll is confirmed, into PAY 8.
    await api('fin', 'post', '/staffing/vendor-bills').send(b).expect(409);
    const kId = await inA(async (tx) => {
      await payScope(tx, [ids.entity!]);
      const prof = await tx.permissionProfile.create({ data: { organizationId: org.A.id, name: `payapp-${run}`, permissionsJson: JSON.stringify(['consultant.invoice.approve']) } });
      await tx.user.create({ data: { organizationId: org.A.id, email: `payapp@staff3-${run}.test`, name: 'Pay approver', passwordHash: 'x', role: 'panel', permissionProfileId: prof.id } });
      return (await tx.consultant.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity!, name: `Velocity LLP ${run}`, kind: 'firm', email: `ap-${run}@velocity.test`, panStatus: 'missing', defaultSection: '194C', createdBy: users.admin! } })).id;
    });
    await api('fin', 'put', `/staffing/vendor-bills/vendors/${ids.agency}/consultant`).send({ consultantId: kId }).expect(want(200));
    const made = (await api('fin', 'post', '/staffing/vendor-bills').send(b).expect(want(201))).body;
    await api('fin', 'post', '/staffing/vendor-bills').send(b).expect(400); // nothing left to bill
    await api('fin', 'post', `/staffing/vendor-bills/${made.id}/paid`).send({ paidOn: addDays(today, 1) }).expect(400);
    await api('fin', 'post', `/staffing/vendor-bills/${made.id}/paid`).send({ paidOn: today }).expect(409); // paid through payroll payouts
    expect((await api('fin', 'get', '/staffing/vendor-bills').expect(200)).body.rows.find((r: { id: string | null }) => r.id === made.id)).toMatchObject({ status: 'confirmed', vendorInvoiceNo: 'VT/26-27/044', net: '36000.00', payroll: { status: 'submitted', paidOn: null } });
  });

  it('484: the statutory cost default is 13% with a PF or ESI registration, else 0%; a saved value wins', async () => {
    const stat = async () => (await api('am', 'get', '/staffing/settings').expect(200)).body;
    expect((await stat()).defaults['staffing.statutory_cost_pct']).toBe('0');
    await inA((tx) => tx.statutoryRegistration.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity!, statute: 'IN.PT', state: 'IN-KA', status: 'on' } }));
    expect((await stat()).defaults['staffing.statutory_cost_pct']).toBe('0'); // PT is not PF or ESI
    const esi = await inA((tx) => tx.statutoryRegistration.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity!, statute: 'IN.ESI', status: 'off' } }));
    expect((await stat()).defaults['staffing.statutory_cost_pct']).toBe('0'); // switched off
    await inA((tx) => tx.statutoryRegistration.update({ where: { id: esi.id }, data: { status: 'applied_awaited', appliedOn: day(today) } }));
    const s = await stat();
    expect([s.defaults['staffing.statutory_cost_pct'], s.values['staffing.statutory_cost_pct']]).toEqual(['13', '13']);
    expect((await api('am', 'get', `/staffing/placements/${ids.pOwn}`).expect(200)).body.placement).toMatchObject({ costRate: '800.00', statutory: '104.00', margin: '296.00' });
    await settings('am', [{ key: 'staffing.statutory_cost_pct', value: '5' }]).expect(want(200));
    expect((await api('am', 'get', `/staffing/placements/${ids.pOwn}`).expect(200)).body.placement.statutory).toBe('40.00');
    expect((await stat()).values['staffing.statutory_cost_pct']).toBe('5');
  });

  it('483: the nightly job ends a placement past its last day once and benches own payroll; skips vendors and people already on the bench', async () => {
    const yesterday = addDays(today, -1);
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      for (const [k, given] of [['bhavna', 'Bhavna'], ['chitra', 'Chitra']] as const) {
        const person = await tx.person.create({ data: { ...x, givenName: given } });
        ids[k] = (await tx.employee.create({ data: { ...x, personId: person.id, givenName: given } })).id;
        await tx.employment.create({ data: { ...x, employeeId: ids[k]!, legalEntityId: ids.entity!, employeeCode: `${k}-${run}`, codeScopeKey: ids.entity!, joinedOn: day('2025-04-01') } });
      }
      const p = { ...x, clientId: ids.tn!, lineId: ids.tnLine!, startOn: day(addDays(today, -60)), endOn: day(yesterday) };
      ids.pDone = (await tx.staffingPlacement.create({ data: { ...p, supply: 'own', employeeId: ids.bhavna!, workerName: 'Bhavna' } })).id;
      ids.pDone2 = (await tx.staffingPlacement.create({ data: { ...p, supply: 'own', employeeId: ids.chitra!, workerName: 'Chitra' } })).id;
      ids.pVendorDone = (await tx.staffingPlacement.create({ data: { ...p, supply: 'vendor', agencyId: ids.agency!, workerName: 'Vendor worker', vendorRatePaise: 90000n } })).id;
      ids.benchChitra = (await tx.staffingBench.create({ data: { ...x, employeeId: ids.chitra!, sinceOn: day(addDays(today, -3)) } })).id; // already on the bench
    });
    expect(await jobs.endPlacements(today)).toBeGreaterThanOrEqual(2);
    const [b, c, v] = await inA((tx) => Promise.all([ids.pDone, ids.pDone2, ids.pVendorDone].map((id) => tx.staffingPlacement.findUniqueOrThrow({ where: { id } }))));
    expect([b.status, b.endedReason, c.status, v.status]).toEqual(['ended', 'completed', 'ended', 'active']); // vendor supply untouched
    const benches = await inA((tx) => tx.staffingBench.findMany({ where: { employeeId: { in: [ids.bhavna!, ids.chitra!] } } }));
    expect(benches.filter((x) => x.employeeId === ids.bhavna).map((x) => x.sinceOn.toISOString().slice(0, 10))).toEqual([today]);
    expect(benches.filter((x) => x.employeeId === ids.chitra)).toHaveLength(1); // not a second spell
    expect(await jobs.endPlacements(today)).toBe(0); // once per placement
    const audits = await inA((tx) => tx.auditLog.findMany({ where: { action: 'staffing.placement.completed', entityId: { in: [ids.pDone!, ids.pDone2!] } } }));
    expect(audits.map((x) => JSON.parse(x.metadataJson!).skipped).sort()).toEqual(['already on the bench', null]);
    // Arun's placement runs to next year: untouched.
    expect((await inA((tx) => tx.staffingPlacement.findUniqueOrThrow({ where: { id: ids.pOwn } }))).status).toBe('active');
  });

  it('482: bench pay reaches payroll once per bench spell per pay month as loss-of-pay days; added to manual LOP; a locked month is skipped', async () => {
    const month = prevFirst.slice(0, 7);
    const lastDay = addDays(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 10), -1);
    const days = Number(lastDay.slice(8));
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      // Bhavna: on the bench from the 21st of last month (50% pay, the default): (days − 20) × 0.5 LOP days.
      await tx.staffingBench.updateMany({ where: { employeeId: ids.bhavna }, data: { sinceOn: day(`${month}-21`) } });
      // Chitra: a manual LOP of 2 days already; bench from the 1st to the 10th.
      await tx.staffingBench.update({ where: { id: ids.benchChitra }, data: { sinceOn: day(`${month}-01`), untilOn: day(`${month}-10`) } });
      const e = await tx.employment.findFirstOrThrow({ where: { employeeId: ids.chitra } });
      await payScope(tx, [e.legalEntityId]); // the pay guard, as payroll staff
      await tx.lopInput.create({ data: { ...x, legalEntityId: e.legalEntityId, employeeId: ids.chitra!, employmentId: e.id, periodStart: day(`${month}-01`), lopDays: '2', reason: 'Absent', enteredBy: users.admin! } });
      // Dinesh: another entity whose month is locked: skipped.
      const ent = await tx.legalEntity.create({ data: { ...x, name: 'Locked Entity', shortName: `LE-${run}` } });
      const person = await tx.person.create({ data: { ...x, givenName: 'Dinesh' } });
      ids.dinesh = (await tx.employee.create({ data: { ...x, personId: person.id, givenName: 'Dinesh' } })).id;
      await tx.employment.create({ data: { ...x, employeeId: ids.dinesh, legalEntityId: ent.id, employeeCode: `d-${run}`, codeScopeKey: ent.id, joinedOn: day('2025-04-01') } });
      await tx.staffingBench.create({ data: { ...x, employeeId: ids.dinesh, sinceOn: day(`${month}-05`) } });
      await tx.payPeriod.create({ data: { ...x, legalEntityId: ent.id, periodStart: day(`${month}-01`), periodEnd: day(lastDay), stage: 'locked' } });
    });
    expect(await jobs.benchPay(today)).toBe(2);
    const lop = await inA(async (tx) => (await payScope(tx, [ids.entity!]), tx.lopInput.findMany({ where: { periodStart: day(`${month}-01`), employeeId: { in: [ids.bhavna!, ids.chitra!, ids.dinesh!] } } })));
    const of = (e: string) => lop.find((x) => x.employeeId === e);
    expect([Number(of(ids.bhavna!)!.lopDays), of(ids.bhavna!)!.source]).toEqual([((days - 20) * 0.5), 'bench']);
    expect([Number(of(ids.chitra!)!.lopDays), of(ids.chitra!)!.source, of(ids.chitra!)!.reason]).toEqual([7, 'manual', 'Absent; Bench 10 days at 50% pay']);
    expect(of(ids.dinesh!)).toBeUndefined();
    expect(await jobs.benchPay(today)).toBe(0); // once per spell per month
    expect(Number((await inA(async (tx) => (await payScope(tx, [ids.entity!]), tx.lopInput.findFirstOrThrow({ where: { employeeId: ids.bhavna, periodStart: day(`${month}-01`) } })))).lopDays)).toBe((days - 20) * 0.5);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'staffing.bench_pay.sent' } }))).toBe(2);
  });

  it('row-level security: company B sees none of the new rows', async () => {
    const counts = await inB(async (tx) => [await tx.staffingHours.count(), await tx.staffingInvoice.count(), await tx.staffingInvoiceLine.count(), await tx.staffingReceipt.count(), await tx.staffingReceiptAllocation.count(), await tx.staffingClientTerms.count(), await tx.staffingVendorBill.count(), await tx.staffingPortalSession.count(), await tx.staffingBenchPay.count()]);
    expect(counts).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const a = await inA(async (tx) => [await tx.staffingHours.count(), await tx.staffingInvoice.count(), await tx.staffingReceipt.count(), await tx.staffingVendorBill.count(), await tx.staffingPortalSession.count()]);
    expect(a.every((n) => n > 0)).toBe(true);
  });
});
