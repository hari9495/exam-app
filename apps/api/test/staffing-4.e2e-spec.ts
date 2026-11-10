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

// Staffing round 4 (answers 491 portal interviews through HIR-06, 492 GST invoice PDF, 493 payment reminders, 494 the
// placement fee and the guarantee credit, 496 vendor invoices into PAY 8): positive and negative, another company 404,
// acting for someone 403, recruiters see no money.

jest.setTimeout(300_000);

describe('Staffing desk round 4', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let jobs: StaffingJobsService;
  const send = jest.fn(async (_m: { to: string; subject: string; html: string }) => ({ success: true }));
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'am' | 'fin' | 'rec' | 'payapp' | 'adminB' | 'acting';
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
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const day = (s: string) => new Date(`${s}T00:00:00Z`);
  const monday = (iso: string) => addDays(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));
  const gstin = (first14: string) => first14 + gstinCheckChar(first14);
  const OURS = gstin('29AABCK1234F1Z');
  const prevFirst = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10);
  const w1 = monday(addDays(prevFirst, 13));
  const month = w1.slice(0, 7);
  const binary = (r: request.Test) => r.buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

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
    planId = (await prisma.plan.create({ data: { name: `staff4-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `STAFF4 Org ${k}`, slug: `staff4-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['am', 'A', 'panel', ['ats.staffing.manage', 'ats.staffing.view']],
      ['fin', 'A', 'panel', ['ats.staffing.billing', 'ats.staffing.view']],
      ['rec', 'A', 'panel', ['ats.staffing.view']],
      ['payapp', 'A', 'panel', ['consultant.invoice.approve']],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@staff4-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@staff4-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.fin}`).expect(200)).body.accessToken;
    const settings = (who: Who, changes: { key: string; value: string }[]) => api(who, 'put', '/staffing/settings').send({ changes });
    await settings('am', [{ key: 'staffing.desk.enabled', value: 'on' }, { key: 'staffing.rate_change.backdate_days', value: '90' }]).expect(want(200));
    await settings('adminB', [{ key: 'staffing.desk.enabled', value: 'on' }]).expect(want(200));
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Staffing Pvt Ltd', shortName: `KS4-${run}`, isDefault: true, gstin: OURS, registeredAddress: { lines: ['12 MG Road'], city: 'Bengaluru', postalCode: '560001' } } })).id;
      const person = await tx.person.create({ data: { ...x, givenName: 'Arun', familyName: 'Kumar' } });
      ids.arun = (await tx.employee.create({ data: { ...x, personId: person.id, givenName: 'Arun', familyName: 'Kumar' } })).id;
      ids.agency = (await tx.agency.create({ data: { ...x, name: `Velocity ${run}`, portalToken: randomUUID(), pan: 'ABCDE1234F', tdsSection: '194C', gstin: gstin('29ABCDE1234F1Z') } })).id;
      await payScope(tx, [ids.entity]);
      ids.consultant = (await tx.consultant.create({ data: { ...x, legalEntityId: ids.entity, name: `Velocity Talent LLP ${run}`, kind: 'firm', email: `ap-${run}@velocity.test`, panStatus: 'missing', defaultSection: '194C', createdBy: users.admin! } })).id;
    });
    ids.series = (await api('am', 'post', '/staffing/invoice-series').send({ legalEntityId: ids.entity, gstin: OURS, financialYear: financialYear(today), prefix: 'KS/', nextNumber: 1 }).expect(want(201))).body.id;
    const client = (name: string, extra: Record<string, unknown> = {}) => ({ name: `${name} ${run}`, legalName: name, state: 'IN-TN', billingAddress: '14 Anna Salai, Chennai', status: 'active', contractStart: '2026-04-01', contractEnd: '2027-03-31', accountManagerUserId: users.am, paymentTermsDays: 30, ...extra });
    ids.tn = (await api('am', 'post', '/staffing/clients').send(client('Nilgiri Retail')).expect(want(201))).body.id;
    ids.other = (await api('am', 'post', '/staffing/clients').send(client('Coromandel')).expect(want(201))).body.id;
    ids.billing = (await api('am', 'post', `/staffing/clients/${ids.tn}/contacts`).send({ name: 'Meera Pillai', role: 'Finance', email: `meera-${run}@nilgiri.test`, billing: true }).expect(want(201))).body.id;
    ids.hr = (await api('am', 'post', `/staffing/clients/${ids.tn}/contacts`).send({ name: 'Ravi', role: 'HR', email: `ravi-${run}@nilgiri.test` }).expect(want(201))).body.id;
    ids.otherContact = (await api('am', 'post', `/staffing/clients/${ids.other}/contacts`).send({ name: 'Uma', role: 'TA', email: `uma-${run}@coromandel.test`, billing: true }).expect(want(201))).body.id;
    for (const [k, cl] of [['line', 'tn'], ['otherLine', 'other']] as const) {
      await api('am', 'post', `/staffing/clients/${ids[cl]}/rates`).send({ role: 'Java Developer', skill: 'Java', location: 'Chennai', unit: 'hour', billRate: '1200', payRate: '800', validFrom: addDays(today, -85) }).expect(want(201));
      ids[k] = (await inA((tx) => tx.staffingRate.findFirstOrThrow({ where: { clientId: ids[cl] } }))).lineId;
    }
    await api('am', 'put', `/staffing/clients/${ids.tn}/terms`).send({ feeKind: 'percent', feePct: '8.33', taper: [{ fromMonth: 0, pct: '8.33' }, { fromMonth: 3, pct: '6' }], guaranteeDays: 90, remedy: 'refund' }).expect(want(200));
    await inA(async (tx) => {
      const x = { organizationId: org.A.id, clientId: ids.tn!, lineId: ids.line!, startOn: day(addDays(today, -80)), endOn: day(addDays(today, 200)) };
      ids.pOwn = (await tx.staffingPlacement.create({ data: { ...x, supply: 'own', employeeId: ids.arun!, workerName: 'Arun Kumar' } })).id;
      ids.pVendor = (await tx.staffingPlacement.create({ data: { ...x, supply: 'vendor', agencyId: ids.agency!, workerName: 'Priya Nair', vendorRatePaise: 90000n } })).id;
      ids.pOther = (await tx.staffingPlacement.create({ data: { ...x, clientId: ids.other!, lineId: ids.otherLine!, supply: 'vendor', agencyId: ids.agency!, workerName: 'Kiran', vendorRatePaise: 90000n } })).id;
      for (const p of [ids.pOwn!, ids.pVendor!, ids.pOther!]) await tx.staffingHours.create({ data: { organizationId: org.A.id, placementId: p, clientId: p === ids.pOther ? ids.other! : ids.tn!, weekStart: day(w1), hoursCenti: 4000, status: 'approved', decidedAt: new Date() } });
    });
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users) as string[];
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        for (const o of [org.A.id, org.B.id]) {
          for (const t of ['staffing_reminders', 'staffing_receipt_allocations', 'staffing_receipts', 'staffing_vendor_bills', 'staffing_hours', 'staffing_invoice_lines'] as const) await tx.$executeRawUnsafe(`DELETE FROM "${t}" WHERE organization_id = $1::uuid`, o);
          await tx.$executeRawUnsafe(`DELETE FROM "staffing_invoices" WHERE organization_id = $1::uuid AND credit_of IS NOT NULL`, o);
          await tx.$executeRawUnsafe(`DELETE FROM "staffing_invoices" WHERE organization_id = $1::uuid`, o);
        }
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  const issue = async (clientId: string) => {
    const [id] = (await api('fin', 'post', '/staffing/invoices/draft').send({ clientId, month, seriesId: ids.series }).expect(want(201))).body.ids;
    const v = (await api('fin', 'get', `/staffing/invoices/${id}`).expect(200)).body.invoice.version;
    await api('fin', 'post', `/staffing/invoices/${id}/issue`).send({ version: v }).expect(want(201));
    return id as string;
  };

  it('492: the GST invoice PDF of an issued invoice and its credit note; never a draft; readers only', async () => {
    const [draft] = (await api('fin', 'post', '/staffing/invoices/draft').send({ clientId: ids.tn, month, seriesId: ids.series }).expect(want(201))).body.ids;
    await api('fin', 'get', `/staffing/invoices/${draft}/pdf`).expect(409);
    await api('fin', 'post', `/staffing/invoices/${draft}/issue`).send({ version: 1 }).expect(want(201));
    ids.inv = draft;
    const r = await binary(api('am', 'get', `/staffing/invoices/${draft}/pdf`)).expect(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.headers['content-disposition']).toContain('KS_1.pdf');
    expect((r.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    await api('rec', 'get', `/staffing/invoices/${draft}/pdf`).expect(403);
    await api('adminB', 'get', `/staffing/invoices/${draft}/pdf`).expect(404);
    const cn = (await api('fin', 'post', `/staffing/invoices/${draft}/credit-note`).send({ amount: '100.50', reason: 'Half an hour less on 3 Oct' }).expect(want(201))).body;
    expect(cn.number).toBe('KS/CN1');
    expect(((await binary(api('fin', 'get', `/staffing/invoices/${cn.id}/pdf`)).expect(200)).body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    // Paise from the money field (answer 499) arrive exactly.
    expect((await api('fin', 'get', `/staffing/invoices/${draft}`).expect(200)).body.creditNotes[0]).toMatchObject({ amount: '118.59' });
  });

  it('491 and 492 in the client portal: interviews through HIR-06 for own candidates; own invoice PDFs only', async () => {
    // A candidate and an employee submitted to a client job; the candidate is in the job's pipeline.
    await inA(async (tx) => {
      const job = await tx.job.create({ data: { organizationId: org.A.id, title: 'Java Developer', status: 'open', staffingClientId: ids.tn, staffingLineId: ids.line, createdById: users.am! } });
      const jobOther = await tx.job.create({ data: { organizationId: org.A.id, title: 'Java Developer', status: 'open', staffingClientId: ids.other, staffingLineId: ids.otherLine, createdById: users.am! } });
      const cand = await tx.candidate.create({ data: { organizationId: org.A.id, email: `deepa-${run}@mail.test`, name: 'Deepa Nair' } });
      await tx.pipelineEntry.create({ data: { organizationId: org.A.id, jobId: job.id, candidateId: cand.id, enteredVia: 'manual', applicationToken: randomUUID() } });
      const base = { organizationId: org.A.id, clientId: ids.tn!, jobId: job.id, lineId: ids.line!, contactId: ids.hr!, billRatePaise: 120000n, submittedBy: users.am! };
      ids.subCand = (await tx.staffingSubmission.create({ data: { ...base, candidateId: cand.id } })).id;
      ids.subEmp = (await tx.staffingSubmission.create({ data: { ...base, employeeId: ids.arun } })).id;
      ids.subOther = (await tx.staffingSubmission.create({ data: { ...base, clientId: ids.other!, jobId: jobOther.id, lineId: ids.otherLine!, contactId: ids.otherContact!, candidateId: cand.id } })).id;
    });
    await api('am', 'post', `/staffing/clients/${ids.tn}/contacts/${ids.hr}/portal`).send({ access: true }).expect(want(201));
    send.mockClear();
    await portal('post', '/code').send({ email: `ravi-${run}@nilgiri.test` }).expect(200);
    let code = '';
    for (let i = 0; i < 50 && !code; i++) {
      const m = send.mock.calls.find(([x]) => x.to === `ravi-${run}@nilgiri.test`);
      if (m) code = m[0].subject.slice(0, 6);
      else await new Promise((r) => setTimeout(r, 100));
    }
    const t = (await portal('post', '/verify').send({ email: `ravi-${run}@nilgiri.test`, code }).expect(200)).body.token as string;
    const me = (await portal('get', '/me', t).expect(200)).body;
    expect(me.bookable.map((b: { value: string }) => b.value)).toEqual([ids.subCand]); // the employee is not bookable here; no other client
    const when = `${addDays(today, 3)}T11:00`;
    const book = (b: Record<string, unknown>) => portal('post', '/interviews', t).send({ submissionId: ids.subCand, startsAt: when, mode: 'video', panel: 'Divya R, Karthik S', ...b });
    await book({ startsAt: `${addDays(today, -1)}T11:00` }).expect(400);
    await book({ mode: 'carrier pigeon' }).expect(400);
    await book({ submissionId: ids.subOther }).expect(403);
    await book({ submissionId: ids.subEmp }).expect(409);
    await portal('post', '/interviews').send({ submissionId: ids.subCand, startsAt: when, mode: 'video' }).expect(401);
    const made = (await book({}).expect(200)).body.id;
    const iv = await inA((tx) => tx.interview.findUniqueOrThrow({ where: { id: made }, include: { slots: true } }));
    expect([iv.status, iv.location, iv.timeZone]).toEqual(['proposed', 'Video call', 'Asia/Kolkata']);
    expect(iv.recruiterNote).toContain('Client panel: Divya R, Karthik S');
    expect(iv.slots[0]!.startsAt.toISOString()).toBe(new Date(`${when}:00+05:30`).toISOString());
    expect((await inA((tx) => tx.staffingSubmission.findUniqueOrThrow({ where: { id: ids.subCand } }))).stage).toBe('interview');
    const after = (await portal('get', '/me', t).expect(200)).body;
    expect(after.interviews).toEqual([expect.objectContaining({ id: made, candidate: 'Deepa Nair', mode: 'Video call', panel: 'Divya R, Karthik S', status: 'Proposed' })]);
    // Invoice PDFs: this client's issued invoice, never another client's.
    expect(((await binary(portal('get', `/invoices/${ids.inv}/pdf`, t)).expect(200)).body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    const otherInv = await issue(ids.other!);
    await portal('get', `/invoices/${otherInv}/pdf`, t).expect(404);
    await portal('get', `/invoices/${ids.inv}/pdf`).expect(401);
  });

  it('493: payment reminders once per step to billing contacts, the latest step only; paused by a dispute; off sends none', async () => {
    await inA(async (tx) => {
      await tx.staffingInvoice.update({ where: { id: ids.inv }, data: { invoiceDate: day(addDays(today, -40)) } }); // due 10 days ago: steps −3 and +7 have come
    });
    send.mockClear();
    expect(await jobs.reminders(today)).toBe(1); // Meera, the billing contact (the other client's invoice is not due yet)
    const to = send.mock.calls.map(([m]) => m.to).sort();
    expect(to).toContain(`meera-${run}@nilgiri.test`);
    expect(to).not.toContain(`ravi-${run}@nilgiri.test`); // not a billing contact
    expect(send.mock.calls.find(([m]) => m.to === `meera-${run}@nilgiri.test`)![0].subject).toBe('Payment reminder: invoice KS/1');
    const steps = await inA((tx) => tx.staffingReminder.findMany({ where: { invoiceId: ids.inv }, orderBy: { step: 'asc' } }));
    expect(steps.map((s) => [s.step, s.emailed])).toEqual([[-3, false], [7, true]]);
    send.mockClear();
    expect(await jobs.reminders(today)).toBe(0); // once per step
    // A dispute pauses it; the schedule off sends none.
    const ledger = (await api('fin', 'get', '/staffing/receivables').expect(200)).body.rows.find((r: { invoiceId: string }) => r.invoiceId === ids.inv);
    expect(ledger.lastReminder).toBe(today);
    await api('fin', 'put', `/staffing/invoices/${ids.inv}/collection`).send({ dispute: 'Hours on week 2', version: ledger.version }).expect(want(200));
    expect(await jobs.reminders(addDays(today, 15))).toBe(0);
    await api('fin', 'put', `/staffing/invoices/${ids.inv}/collection`).send({ dispute: null, version: ledger.version + 1 }).expect(want(200));
    await api('am', 'put', '/staffing/settings').send({ changes: [{ key: 'staffing.dunning.schedule', value: 'off' }] }).expect(want(200));
    expect(await jobs.reminders(addDays(today, 15))).toBe(0);
    await api('am', 'put', '/staffing/settings').send({ changes: [{ key: 'staffing.dunning.schedule', value: 'standard' }] }).expect(want(200));
    expect(await jobs.reminders(addDays(today, 15))).toBeGreaterThanOrEqual(1); // step +21 for KS/1
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'staffing.reminder.sent', entityId: ids.inv } }))).toBe(2);
  });

  it('494: the client hires: a draft fee invoice from the terms; leaving inside the guarantee raises the credit note', async () => {
    const hire = (who: Who, pid: string, b: Record<string, unknown> = {}) => api(who, 'post', `/staffing/placements/${pid}/hired`).send({ hiredOn: today, ctc: '1800000', seriesId: ids.series, ...b });
    await hire('rec', ids.pOwn!).expect(403);
    await hire('fin', ids.pOwn!).expect(403);
    await hire('adminB', ids.pOwn!).expect(404);
    await hire('am', ids.pOwn!, { hiredOn: addDays(today, 1) }).expect(400);
    await hire('am', ids.pOwn!, { hiredOn: addDays(today, -100) }).expect(400); // before the placement
    await hire('am', ids.pOwn!, { ctc: '0' }).expect(400);
    await hire('am', ids.pOther!).expect(400); // no terms for that client
    const h = (await hire('am', ids.pOwn!).expect(want(201))).body;
    expect(h.fee).toBe('149940.00'); // 2 months served: 8.33% of ₹18,00,000
    // Answer 528: by default the placement ends the day before the hire (existing end path, audited), with no bench spell.
    expect(h.ended).toBe(addDays(today, -1));
    const ended = await inA((tx) => tx.staffingPlacement.findUniqueOrThrow({ where: { id: ids.pOwn } }));
    expect([ended.status, ended.endOn.toISOString().slice(0, 10), ended.endNote]).toEqual(['ended', addDays(today, -1), 'Hired by the client']);
    expect(await inA((tx) => tx.staffingBench.count({ where: { employeeId: ids.arun } }))).toBe(0);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'staffing.placement.ended', entityId: ids.pOwn } }))).toBe(1);
    await hire('am', ids.pOwn!).expect(409);
    const fee = (await api('fin', 'get', `/staffing/invoices/${h.invoiceId}`).expect(200)).body;
    expect(fee.invoice).toMatchObject({ kind: 'fee', status: 'draft', taxable: '149940.00', interState: true, igst: '26989.20' });
    const left = (who: Who, b: Record<string, unknown> = {}) => api(who, 'post', `/staffing/placements/${ids.pOwn}/left`).send({ leftOn: today, ...b });
    await left('am').expect(409); // the fee invoice is still a draft
    await api('fin', 'post', `/staffing/invoices/${h.invoiceId}/issue`).send({ version: 1 }).expect(want(201));
    await left('am', { leftOn: addDays(today, 1) }).expect(400);
    await left('rec').expect(403);
    const l = (await left('am').expect(want(201))).body;
    expect(l).toMatchObject({ outcome: 'credit', credit: '149940.00' }); // left on day 0 of 90: all of it
    await left('am').expect(409);
    const after = (await api('fin', 'get', `/staffing/invoices/${h.invoiceId}`).expect(200)).body;
    expect(after.creditNotes).toEqual([expect.objectContaining({ amount: '176929.20' })]);
    // Outside the guarantee: nothing. Replacement remedy: no credit.
    await hire('am', ids.pVendor!, { hiredOn: addDays(today, -95) }).expect(400); // before the placement? no: start was −80
    const v = (await hire('am', ids.pVendor!, { hiredOn: addDays(today, -70), endPlacement: false }).expect(want(201))).body;
    expect(v.ended).toBeNull();
    expect((await inA((tx) => tx.staffingPlacement.findUniqueOrThrow({ where: { id: ids.pVendor } }))).status).toBe('active'); // left as it is when turned off
    await hire('am', ids.pOther!, { endPlacement: 'yes' }).expect(400);
    await api('fin', 'post', `/staffing/invoices/${v.invoiceId}/issue`).send({ version: 1 }).expect(want(201));
    expect((await api('am', 'post', `/staffing/placements/${ids.pVendor}/left`).send({ leftOn: today }).expect(want(201))).body).toMatchObject({ outcome: 'credit' }); // 70 days in: (90 − 70)/90
    expect(await inA((tx) => tx.auditLog.count({ where: { action: { in: ['staffing.placement.hired', 'staffing.placement.left_client'] } } }))).toBe(4);
  });

  it('496: a confirmed vendor invoice enters payroll (PAY 8) as an invoice of the linked consultant; paid there, never twice', async () => {
    const b = { placementId: ids.pVendor, month, vendorInvoiceNo: 'VT/26-27/044', invoiceDate: today };
    await api('fin', 'post', '/staffing/vendor-bills').send(b).expect(409); // not linked yet
    expect((await api('fin', 'get', '/staffing/vendor-bills/consultants').expect(200)).body.map((o: { value: string }) => o.value)).toEqual([ids.consultant]);
    await api('rec', 'get', '/staffing/vendor-bills/consultants').expect(403);
    const link = (who: Who, consultantId: string | null) => api(who, 'put', `/staffing/vendor-bills/vendors/${ids.agency}/consultant`).send({ consultantId });
    await link('rec', ids.consultant!).expect(403);
    await link('acting', ids.consultant!).expect(403);
    await link('fin', randomUUID()).expect(400);
    await link('adminB', ids.consultant!).expect(404);
    await link('fin', ids.consultant!).expect(want(200));
    await api('fin', 'post', '/staffing/vendor-bills').send({ ...b, vendorInvoiceNo: 'bad no!' }).expect(400);
    const made = (await api('fin', 'post', '/staffing/vendor-bills').send(b).expect(want(201))).body;
    await api('fin', 'post', '/staffing/vendor-bills').send(b).expect(400); // nothing left to bill
    const ci = await inA(async (tx) => (await payScope(tx, [ids.entity!]), tx.consultantInvoice.findUniqueOrThrow({ where: { id: made.consultantInvoiceId } })));
    expect([ci.consultantId, ci.invoiceNo, ci.taxableValue.toFixed(2), ci.igst.toFixed(2), ci.cgst.toFixed(2), ci.section, ci.uploadedVia, ci.status]).toEqual([ids.consultant, 'VT/26-27/044', '36000.00', '0.00', '3240.00', '194C', 'staff', 'submitted']);
    const rows = (await api('fin', 'get', '/staffing/vendor-bills').expect(200)).body;
    expect(rows.vendors.find((v: { id: string }) => v.id === ids.agency).consultantId).toBe(ids.consultant);
    expect(rows.rows.find((r: { id: string }) => r.id === made.id).payroll).toMatchObject({ status: 'submitted', paidOn: null });
    await api('fin', 'post', `/staffing/vendor-bills/${made.id}/paid`).send({ paidOn: today }).expect(409); // paid through payroll payouts
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'consultant.invoice.submitted', entityId: made.consultantInvoiceId } }))).toBe(1);
  });
});
