import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import JSZip from 'jszip';
import type Redis from 'ioredis';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { gstinCheckChar } from '../src/expenses/checks';
import { financialYear } from '../src/staffing/staffing-rules';

// Staffing answer 522: the accounting export of a month's issued invoices and credit notes per GSTIN series, as a Tally
// XML import and a Zoho Books CSV pair. Ledger names, the GST split, TDS and round-off from 6.2; formats from rule sets.
// Finance only; drafts never; audited; another company 404, acting for someone 403.

jest.setTimeout(300_000);

describe('Staffing accounting export', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'am' | 'fin' | 'rec' | 'adminB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  type Tx = Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0];
  const inA = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const day = (s: string) => new Date(`${s}T00:00:00Z`);
  const monday = (iso: string) => addDays(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));
  const gstin = (first14: string) => first14 + gstinCheckChar(first14);
  const OURS = gstin('29AABCK1234F1Z');
  const binary = (r: request.Test) =>
    r.buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
  const exp = (who: Who, q: Record<string, string>) => binary(api(who, 'get', `/staffing/exports?${new URLSearchParams({ seriesId: ids.series!, month, format: 'tally', ...q })}`));
  const settings = (who: Who, changes: { key: string; value: string }[]) => api(who, 'put', '/staffing/settings').send({ changes });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).compile();
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
    planId = (await prisma.plan.create({ data: { name: `staff5-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `STAFF5 Org ${k}`, slug: `staff5-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['am', 'A', 'panel', ['ats.staffing.manage', 'ats.staffing.view']],
      ['fin', 'A', 'panel', ['ats.staffing.billing', 'ats.staffing.view']],
      ['rec', 'A', 'panel', ['ats.staffing.view']],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@staff5-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@staff5-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.fin}`).expect(200)).body.accessToken;
    await settings('am', [{ key: 'staffing.desk.enabled', value: 'on' }, { key: 'staffing.rate_change.backdate_days', value: '90' }]).expect(want(200));
    await settings('adminB', [{ key: 'staffing.desk.enabled', value: 'on' }]).expect(want(200));
    ids.entity = (await inA((tx) => tx.legalEntity.create({ data: { organizationId: org.A.id, name: 'Kaveri Staffing Pvt Ltd', shortName: `KS5-${run}`, isDefault: true, gstin: OURS } }))).id;
    ids.series = (await api('am', 'post', '/staffing/invoice-series').send({ legalEntityId: ids.entity, gstin: OURS, financialYear: financialYear(today), prefix: 'KS/', nextNumber: 1 }).expect(want(201))).body.id;
    ids.client = (await api('am', 'post', '/staffing/clients').send({ name: `Nilgiri & Sons ${run}`, legalName: `Nilgiri & Sons ${run}`, state: 'IN-TN', billingAddress: 'Chennai', status: 'active', contractStart: '2026-04-01', contractEnd: '2027-03-31', tdsSection: '194C' }).expect(want(201))).body.id;
    await api('am', 'post', `/staffing/clients/${ids.client}/rates`).send({ role: 'Java Developer', skill: 'Java', location: 'Chennai', unit: 'hour', billRate: '1200.33', payRate: '800', validFrom: addDays(today, -85) }).expect(want(201));
    const line = (await inA((tx) => tx.staffingRate.findFirstOrThrow({ where: { clientId: ids.client } }))).lineId;
    const w = monday(addDays(today, -30));
    await inA(async (tx) => {
      const p = await tx.staffingPlacement.create({ data: { organizationId: org.A.id, clientId: ids.client!, lineId: line, startOn: day(addDays(today, -80)), endOn: day(addDays(today, 200)), supply: 'vendor', workerName: 'Arun Kumar', vendorRatePaise: 90000n, agencyId: (await tx.agency.create({ data: { organizationId: org.A.id, name: `V ${run}`, portalToken: randomUUID() } })).id } });
      await tx.staffingHours.create({ data: { organizationId: org.A.id, placementId: p.id, clientId: ids.client!, weekStart: day(w), hoursCenti: 4050, status: 'approved', decidedAt: new Date() } });
      await tx.staffingHours.create({ data: { organizationId: org.A.id, placementId: p.id, clientId: ids.client!, weekStart: day(addDays(w, 7)), hoursCenti: 1000, status: 'approved', decidedAt: new Date() } });
    });
    const [inv] = (await api('fin', 'post', '/staffing/invoices/draft').send({ clientId: ids.client, month: w.slice(0, 7), seriesId: ids.series }).expect(want(201))).body.ids;
    await api('fin', 'post', `/staffing/invoices/${inv}/issue`).send({ version: 1 }).expect(want(201));
    ids.inv = inv;
    await api('fin', 'post', `/staffing/invoices/${inv}/credit-note`).send({ amount: '100.50', reason: 'Half an hour less' }).expect(want(201));
    // A second draft stays a draft (left out of every export).
    if (addDays(w, 7).slice(0, 7) !== w.slice(0, 7)) await api('fin', 'post', '/staffing/invoices/draft').send({ clientId: ids.client, month: addDays(w, 7).slice(0, 7), seriesId: ids.series }).expect(want(201));
    else await inA((tx) => tx.staffingInvoice.create({ data: { organizationId: org.A.id, clientId: ids.client!, seriesId: ids.series!, kind: 'staffing', supplierState: 'IN-KA', placeOfSupply: 'IN-TN', gstPct: '18', taxablePaise: 100n, igstPaise: 18n, totalPaise: 118n } }));
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users) as string[];
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        for (const o of [org.A.id, org.B.id]) {
          for (const t of ['staffing_hours', 'staffing_invoice_lines'] as const) await tx.$executeRawUnsafe(`DELETE FROM "${t}" WHERE organization_id = $1::uuid`, o);
          await tx.$executeRawUnsafe(`DELETE FROM "staffing_invoices" WHERE organization_id = $1::uuid AND credit_of IS NOT NULL`, o);
          await tx.$executeRawUnsafe(`DELETE FROM "staffing_invoices" WHERE organization_id = $1::uuid`, o);
        }
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('the export sheet: series, months with issued documents, drafts left out; finance only', async () => {
    const o = (await api('fin', 'get', '/staffing/exports/options').expect(200)).body;
    expect(o.series).toEqual([expect.objectContaining({ id: ids.series, months: [month], drafts: 1 })]);
    for (const who of ['am', 'rec'] as const) await api(who, 'get', '/staffing/exports/options').expect(403);
  });

  it('Tally XML: issued invoice and credit note, default ledgers, round-off; refused to others, acting, drafts and bad input', async () => {
    const r = await exp('fin', {}).expect(200);
    expect(r.headers['content-type']).toContain('application/xml');
    expect(r.headers['content-disposition']).toContain(`KS-${month}-tally.xml`);
    const x = (r.body as Buffer).toString('utf8');
    expect(x.match(/<VOUCHER /g)).toHaveLength(2);
    expect(x).toContain('<VOUCHERNUMBER>KS/1</VOUCHERNUMBER>');
    expect(x).toContain('<VOUCHER VCHTYPE="Credit Note" ACTION="Create">');
    expect(x).toContain(`<PARTYLEDGERNAME>Nilgiri &amp; Sons ${run}</PARTYLEDGERNAME>`);
    for (const l of ['Sales - Staffing Services', 'Output IGST', 'Round Off']) expect(x).toContain(`<LEDGERNAME>${l}</LEDGERNAME>`);
    expect(x).not.toContain('Output CGST');
    expect(x).toContain('<SVCURRENTCOMPANY>Kaveri Staffing Pvt Ltd</SVCURRENTCOMPANY>');
    for (const who of ['am', 'rec'] as const) await exp(who, {}).expect(403);
    await exp('acting', {}).expect(403);
    await exp('adminB', {}).expect(404);
    await exp('fin', { format: 'excel' }).expect(400);
    await exp('fin', { month: '2026-13' }).expect(400);
    await exp('fin', { month: '2020-01' }).expect(400); // nothing issued (drafts never)
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'staffing.invoices.exported' } }))).toBe(1);
  });

  it('6.2 ledgers, GST split, TDS and round-off drive the export; bad names refused', async () => {
    for (const bad of ['', 'Two\nlines', 'x'.repeat(101), '<Sales>']) await settings('fin', [{ key: 'staffing.export.ledger.sales', value: bad }]).expect(403); // finance cannot change settings
    for (const bad of ['', 'Two\nlines', 'x'.repeat(101), '<Sales>']) await settings('am', [{ key: 'staffing.export.ledger.sales', value: bad }]).expect(400);
    await settings('am', [{ key: 'staffing.export.gst_split', value: 'both' }]).expect(400);
    const s = (await api('am', 'get', '/staffing/settings').expect(200)).body.values;
    expect(s).toMatchObject({ 'staffing.export.ledger.sales': 'Sales - Staffing Services', 'staffing.export.gst_split': 'separate', 'staffing.export.tds': 'none', 'staffing.export.round_off': 'rupee' });
    await settings('am', [
      { key: 'staffing.export.ledger.sales', value: 'Manpower Sales' },
      { key: 'staffing.export.gst_split', value: 'combined' },
      { key: 'staffing.export.tds', value: 'expected' },
      { key: 'staffing.export.round_off', value: 'none' },
    ]).expect(want(200));
    const x = ((await exp('fin', {}).expect(200)).body as Buffer).toString('utf8');
    expect(x).toContain('<LEDGERNAME>Manpower Sales</LEDGERNAME>');
    expect(x).toContain('<LEDGERNAME>Output GST</LEDGERNAME>');
    expect(x).toContain('<LEDGERNAME>TDS Receivable</LEDGERNAME>'); // 194C at 2% expected on the invoice
    expect(x).not.toContain('<LEDGERNAME>Round Off</LEDGERNAME>');
    expect(x).not.toContain('Output IGST');
  });

  it('Zoho Books: a zip of the invoices CSV and the credit notes CSV with the rule set columns', async () => {
    const r = await exp('fin', { format: 'zoho' }).expect(200);
    expect(r.headers['content-type']).toContain('application/zip');
    const zip = await JSZip.loadAsync(r.body as Buffer);
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual([`KS-${month}-credit-notes.csv`, `KS-${month}-invoices.csv`]);
    const inv = (await zip.file(`KS-${month}-invoices.csv`)!.async('string')).trim().split('\r\n');
    expect(inv[0]!.startsWith('Invoice Date,Invoice Number,Invoice Status,Customer Name')).toBe(true);
    expect(inv.length).toBeGreaterThanOrEqual(2);
    expect(inv[1]).toContain(',KS/1,Sent,');
    const cn = (await zip.file(`KS-${month}-credit-notes.csv`)!.async('string')).trim().split('\r\n');
    expect(cn[0]!.startsWith('Credit Note Date,Credit Note Number,Reference Invoice,Reason')).toBe(true);
    expect(cn[1]).toContain('KS/CN1,KS/1,Half an hour less');
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'staffing.invoices.exported' } }))).toBe(3);
  });

  it('574: the month’s receipts go in as Receipt vouchers (Tally) and customer payments (Zoho); another month’s are left out', async () => {
    const inv = await inA((tx) => tx.staffingInvoice.findFirstOrThrow({ where: { id: ids.inv } }));
    await inA(async (tx) => {
      const r = await tx.staffingReceipt.create({ data: { organizationId: org.A.id, clientId: ids.client!, receivedOn: day(today), amountPaise: 100000n, tdsPaise: 2000n, reference: `UTR${run}` } });
      await tx.staffingReceiptAllocation.create({ data: { organizationId: org.A.id, receiptId: r.id, invoiceId: inv.id, amountPaise: 100000n, tdsPaise: 2000n } });
      const old = await tx.staffingReceipt.create({ data: { organizationId: org.A.id, clientId: ids.client!, receivedOn: day(addDays(`${month}-01`, -1)), amountPaise: 5000n, reference: `OLD${run}` } });
      await tx.staffingReceiptAllocation.create({ data: { organizationId: org.A.id, receiptId: old.id, invoiceId: inv.id, amountPaise: 5000n } });
    });
    await settings('am', [{ key: 'staffing.export.ledger.bank', value: '<Bank>' }]).expect(400);
    await settings('am', [{ key: 'staffing.export.tds', value: 'none' }, { key: 'staffing.export.ledger.bank', value: 'HDFC Current' }]).expect(want(200));
    const xml = (await exp('fin', {}).expect(200)).body.toString('utf8');
    expect(xml).toContain('<VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>');
    expect(xml).toContain(`<VOUCHERNUMBER>UTR${run}</VOUCHERNUMBER>`);
    expect(xml).toMatch(/<LEDGERNAME>HDFC Current<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>-1000\.00<\/AMOUNT>/);
    expect(xml).not.toContain(`OLD${run}`);
    const zip = await JSZip.loadAsync((await exp('fin', { format: 'zoho' }).expect(200)).body as Buffer);
    expect(Object.keys(zip.files).sort()).toEqual([`KS-${month}-credit-notes.csv`, `KS-${month}-customer-payments.csv`, `KS-${month}-invoices.csv`]);
    const pay = (await zip.file(`KS-${month}-customer-payments.csv`)!.async('string')).trim().split(/\r\n/);
    expect(pay[0]).toBe('Date,Payment Number,Customer Name,Payment Mode,Deposit To,Reference Number,Amount,Invoice Number,Amount Applied to Invoice,Withholding Tax Amount');
    expect(pay).toHaveLength(2);
    expect(pay[1]).toContain(`UTR${run}`);
    expect(pay[1]).toContain(`,${inv.number},1020.00,20.00`);
  });

  it('915: a month with receipts but no invoices is offered and exports just the receipts; an empty month is refused', async () => {
    // The receipt dated the day before this month (from the 574 test) pays this series' invoice.
    const prev = addDays(`${month}-01`, -1).slice(0, 7);
    const o = (await api('fin', 'get', '/staffing/exports/options').expect(200)).body;
    const series = o.series.find((x: { id: string }) => x.id === ids.series);
    expect(series.months).toEqual(expect.arrayContaining([month, prev]));
    const xml = ((await exp('fin', { month: prev }).expect(200)).body as Buffer).toString('utf8');
    expect(xml).toContain(`<VOUCHERNUMBER>OLD${run}</VOUCHERNUMBER>`);
    expect(xml).toContain('<VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>');
    expect(xml).not.toContain('<VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>');
    const zip = await JSZip.loadAsync((await exp('fin', { month: prev, format: 'zoho' }).expect(200)).body as Buffer);
    expect(Object.keys(zip.files)).toEqual([`KS-${prev}-customer-payments.csv`]);
    // Negative: a month with neither invoices nor receipts, and someone without the finance key.
    const empty = addDays(`${prev}-01`, -40).slice(0, 7);
    expect(series.months).not.toContain(empty);
    await exp('fin', { month: empty }).expect(400);
    await exp('am', { month: prev }).expect(403);
  });
});

