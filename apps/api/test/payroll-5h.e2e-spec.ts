import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import JSZip from 'jszip';
import { randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// Payroll batch 5h end to end against the real database: the consultant register (PAN and bank sealed; a new account
// checked by someone else), invoices through P03 with TDS at approval (on the value before GST; the year's threshold
// crossed; no PAN at the higher rate; a s.197 certificate used within its limit), a duplicate invoice refused, the
// consultant's own sign-in seeing only their own rows (and a fresh session to upload), the bank file released by
// someone else after a fresh second step, the payment advice, Form 140 from the per-section challans and Form 131
// imported from a TRACES ZIP by PAN.
describe('Payroll batch 5h', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'payAdmin' | 'payAdmin2' | 'approver1' | 'adminB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const sendMock = jest.fn(async (_m: { to: string; subject: string }) => ({ success: true }));
  const api = (who: Who, method: 'get' | 'post' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const portal = (method: 'get' | 'post', path: string, t: string) => request(server())[method](`/api/v1/public/consultant/${org.A.slug}${path}`).set('X-Consultant-Portal', t);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const taxYear = (() => {
    const y = Number(month.slice(0, 4)) - (Number(month.slice(5, 7)) < 4 ? 1 : 0);
    return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  })();
  const quarter = Math.floor(((Number(month.slice(5, 7)) + 8) % 12) / 3) + 1;
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  const mail = (who: string) => `${who}@consult5h-${run}.test`;
  const binary = (r: request.Test) =>
    r.buffer(true).parse((res, cb) => {
      const c: Buffer[] = [];
      res.on('data', (x: Buffer) => c.push(x));
      res.on('end', () => cb(null, Buffer.concat(c)));
    });

  /** Staff enter an invoice; approver1 approves it from the inbox; the invoice as it then stands. */
  const invoice = async (consultantId: string, invoiceNo: string, taxableValue: string, extra: Record<string, string> = {}) => {
    const res = await api('payAdmin', 'post', '/payroll/consultant-invoices').send({ consultantId, invoiceNo, invoiceDate: today, period: month, taxableValue, ...extra });
    if (res.status !== 201) throw new Error(JSON.stringify(res.body));
    const inv = res.body;
    const task = ((await api('approver1', 'get', '/workflow/approvals/inbox').expect(200)).body as { taskId: string; title: string }[]).find((t) => t.title.endsWith(`invoice ${invoiceNo}`))!;
    await api('approver1', 'post', `/workflow/approvals/tasks/${task.taskId}/decide`).send({ decision: 'approve' }).expect(200);
    return ((await api('payAdmin', 'get', '/payroll/consultant-invoices').expect(200)).body as { id: string }[]).find((x) => x.id === inv.id) as {
      id: string;
      status: string;
      tds: { amount: string; base: string; rate: string; reason: string; certificateUsed: string };
      netPayable: string;
      gst: string;
    };
  };
  const signIn = async (email: string) => {
    sendMock.mockClear();
    await request(server()).post(`/api/v1/public/consultant/${org.A.slug}/code`).send({ email }).expect(200);
    let code = '';
    for (let i = 0; i < 50 && !code; i++) {
      const m = sendMock.mock.calls.find(([x]) => x.to === email);
      if (m) code = m[0].subject.slice(0, 6);
      else await new Promise((r) => setTimeout(r, 100));
    }
    return (await request(server()).post(`/api/v1/public/consultant/${org.A.slug}/verify`).send({ email, code }).expect(200)).body.token as string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: sendMock })
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
    planId = (await prisma.plan.create({ data: { name: `pay5h-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Pay5H Org ${k}`, slug: `pay5h-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    // Founder 21 Oct 2026 (option A): only HR changes pay. These pay tests' payroll fixture also plays the HR person who
    // sets the pay (the job-change key); payroll itself is refused a pay change (people-increment.e2e-spec.ts).
    // Founder 28 Oct 2026: only HR approves job changes; the approver fixture also plays the HR approver who sees pay
    // (payroll itself is refused: employee-history.e2e-spec.ts).
    const template = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions, ...(key === 'payroll_admin' ? ['employee.change.manage'] : key === 'payroll_approver' ? ['employee.change.approve'] : [])];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'panel', template('payroll_admin')],
      ['payAdmin', 'A', 'panel', template('payroll_admin')],
      ['payAdmin2', 'A', 'panel', template('payroll_admin')],
      ['approver1', 'A', 'panel', template('payroll_approver')],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys
        ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id
        : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@pay5h-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@pay5h-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      ids.entity = (
        await tx.legalEntity.create({
          data: { organizationId: org.A.id, name: 'Pay5H Advisory', shortName: `P5H-${run}`, isDefault: true, tan: 'BLRP12345E', pan: 'AAACP1234F', registeredAddress: { lines: ['12 MG Road'], city: 'Bengaluru', state: 'IN-KA', postalCode: '560001', country: 'IN' } },
        })
      ).id;
      await tx.statutoryRegistration.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity, statute: 'IN.TDS', registrationNo: 'BLRP12345E', responsiblePerson: 'Divya R', responsibleDesignation: 'Director', status: 'on' } });
    });
  }, 120_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('every 5h table has forced RLS, tenant isolation, the support exclusion and the pay guard', async () => {
    const tables = ['consultants', 'tds_197_certificates', 'consultant_payout_batches', 'consultant_invoices', 'consultant_portal_sessions', 'consultant_certificates'];
    const rows = await prisma.$queryRaw<{ t: string; ok: boolean }[]>`
      SELECT c.relname AS t, (c.relrowsecurity AND c.relforcerowsecurity
        AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation')
        AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'support_session_excluded' AND NOT p.polpermissive)
        AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'pay_guard' AND NOT p.polpermissive)) AS ok
      FROM pg_class c WHERE c.relname = ANY(${tables}::text[])`;
    expect(
      rows
        .filter((r) => r.ok)
        .map((r) => r.t)
        .sort(),
    ).toEqual([...tables].sort());
  });

  it('the register: PAN and bank sealed, one email per entity, a new account checked by someone else', async () => {
    const bank = { holder: 'Asha Rao', ifsc: 'HDFC0001234', account: '000111222333' };
    const k1 = (await api('payAdmin', 'post', '/payroll/consultants').send({ legalEntityId: ids.entity, name: 'Asha Rao', kind: 'individual', email: mail('asha'), pan: 'ABCDE1234F', defaultSection: '194J_B', bank }).expect(201)).body;
    ids.k1 = k1.id;
    expect(k1.pan).not.toContain('ABCDE');
    expect(k1.bank).toMatchObject({ account: '•••• 2333', verified: false, usable: false });
    const raw = await inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return tx.consultant.findFirstOrThrow({ where: { id: k1.id } });
    });
    expect(raw.panEnc).not.toContain('ABCDE1234F');
    expect(raw.bankAccountEnc).not.toContain('000111222333');
    await api('payAdmin', 'post', '/payroll/consultants').send({ legalEntityId: ids.entity, name: 'Asha again', kind: 'individual', email: mail('ASHA'), defaultSection: '194C' }).expect(409);
    // The maker cannot record the penny-drop check; someone else can.
    await api('payAdmin', 'post', `/payroll/consultants/${k1.id}/bank-check`).send({ reference: 'PD-778899' }).expect(403);
    expect((await api('payAdmin2', 'post', `/payroll/consultants/${k1.id}/bank-check`).send({ reference: 'PD-778899' }).expect(200)).body.bank).toMatchObject({ verified: true, usable: true });
    // An approver reads the register but does not change it; another company sees nothing.
    await api('approver1', 'post', '/payroll/consultants').send({ legalEntityId: ids.entity, name: 'X', kind: 'individual', email: mail('x'), defaultSection: '194C' }).expect(403);
    expect((await api('adminB', 'get', '/payroll/consultants').expect(200)).body).toEqual([]);
    ids.k2 = (await api('payAdmin', 'post', '/payroll/consultants').send({ legalEntityId: ids.entity, name: 'Nopan Works', kind: 'firm', email: mail('nopan'), defaultSection: '194C', bank: { ...bank, holder: 'Nopan Works', account: '444555666777' } }).expect(201)).body.id;
    await api('payAdmin2', 'post', `/payroll/consultants/${ids.k2}/bank-check`).send({ reference: 'PD-112233' }).expect(200);
    ids.k3 = (await api('payAdmin', 'post', '/payroll/consultants').send({ legalEntityId: ids.entity, name: 'Lower Rate LLP', kind: 'firm', email: mail('lower'), pan: 'LMNOP6789Q', defaultSection: '194J_B' }).expect(201)).body.id;
  });

  it('TDS at approval: on the value before GST, the year’s threshold crossed, no PAN at the higher rate', async () => {
    const a = await invoice(ids.k1, 'INV-001', '40000.00', { igst: '7200.00' });
    expect(a).toMatchObject({ status: 'approved', gst: '7200.00', netPayable: '47200.00' });
    expect(a.tds).toMatchObject({ amount: '0.00', reason: 'below_threshold' });
    // Crossing Rs 50,000 in the year: this invoice and the earlier one are taxed at 10%; GST never is.
    const b = await invoice(ids.k1, 'INV-002', '20000.00', { igst: '3600.00' });
    expect(b.tds).toMatchObject({ amount: '6000.00', base: '60000.00', reason: 'normal' });
    expect(b.netPayable).toBe('17600.00');
    ids.invB = b.id;
    // The same invoice number again in the year (any case) is refused.
    await api('payAdmin', 'post', '/payroll/consultant-invoices').send({ consultantId: ids.k1, invoiceNo: 'inv-001', invoiceDate: today, period: month, taxableValue: '100.00' }).expect(409);
    // No PAN: 20% (s.206AA) on a single payment over Rs 30,000 under s.194C.
    const c = await invoice(ids.k2, 'NW-77', '35000.00', { cgst: '3150.00', sgst: '3150.00' });
    expect(c.tds).toMatchObject({ amount: '7000.00', base: '35000.00', reason: 'no_pan' });
    ids.invC = c.id;
  });

  it('a s.197 certificate is used within its limit and no further', async () => {
    const from = `${taxYear.slice(0, 4)}-04-01`;
    const to = `${Number(taxYear.slice(0, 4)) + 1}-03-31`;
    const cert = await api('payAdmin', 'post', `/payroll/consultants/${ids.k3}/certificates-197`).send({ certificateNo: 'C197/0001', section: '194J_B', rate: '0.02', validFrom: from, validTo: to, limit: '70000.00' });
    expect([cert.status, cert.body]).toEqual([201, expect.anything()]);
    const first = await invoice(ids.k3, 'LR-1', '60000.00');
    expect(first.tds).toMatchObject({ amount: '1200.00', reason: 'certificate', certificateUsed: '60000.00' });
    // Rs 10,000 of the limit is left: 2% on that, 10% on the rest.
    const second = await invoice(ids.k3, 'LR-2', '20000.00');
    expect(second.tds).toMatchObject({ amount: '1200.00', reason: 'certificate_partly', certificateUsed: '10000.00' });
    const k3 = (await api('payAdmin', 'get', `/payroll/consultants/${ids.k3}`).expect(200)).body;
    expect(k3.certificates[0]).toMatchObject({ limit: '70000.00', consumed: '70000.00' });
  });

  it('the consultant signs in and sees only their own rows; uploading needs a fresh session', async () => {
    const t = (ids.tAsha = await signIn(mail('asha')));
    const me = (await portal('get', '/me', t).expect(200)).body;
    expect(me.me.id).toBe(ids.k1);
    expect(me.invoices.map((i: { invoiceNo: string }) => i.invoiceNo).sort()).toEqual(['INV-001', 'INV-002']);
    expect(JSON.stringify(me)).not.toContain('Nopan');
    // Someone else's invoice is "not found".
    await portal('get', `/invoices/${ids.invC}/advice`, t).expect(404);
    // The database itself keeps a portal session to that consultant.
    const seen = await inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.consultant_portal', ${ids.k1}, true)`;
      return tx.consultantInvoice.findMany({ select: { consultantId: true } });
    });
    expect(new Set(seen.map((x) => x.consultantId))).toEqual(new Set([ids.k1]));
    await expect(
      inA(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.consultant_portal', ${ids.k1}, true)`;
        return tx.consultantInvoice.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity, consultantId: ids.k2, invoiceNo: 'SNEAK', invoiceDate: new Date(), taxYear, period: new Date(`${month}-01T00:00:00Z`), taxableValue: 1, section: '194C', uploadedVia: 'consultant' } });
      }),
    ).rejects.toThrow();
    // Their own upload, with the PDF.
    const up = await portal('post', '/invoices', t).field('invoiceNo', 'INV-003').field('invoiceDate', today).field('period', month).field('taxableValue', '5000.00').attach('file', pdf, 'inv-003.pdf').expect(201);
    expect(up.body).toMatchObject({ status: 'submitted', uploadedVia: 'consultant', hasFile: true });
    await portal('post', '/invoices', t).field('invoiceNo', 'INV-004').field('invoiceDate', today).field('period', month).field('taxableValue', '5000.00').expect(400);
    // An older session must sign in again before sending an invoice.
    await tenantPrisma.forTenant(SUPER, (tx) => tx.consultantPortalSession.updateMany({ where: { consultantId: ids.k1 }, data: { createdAt: new Date(Date.now() - 20 * 60_000) } }));
    await portal('post', '/invoices', t).field('invoiceNo', 'INV-005').field('invoiceDate', today).field('period', month).field('taxableValue', '5000.00').attach('file', pdf, 'x.pdf').expect(401);
    // Unknown emails get the same answer and no code.
    sendMock.mockClear();
    await request(server()).post(`/api/v1/public/consultant/${org.A.slug}/code`).send({ email: mail('nobody') }).expect(200);
    await new Promise((r) => setTimeout(r, 300));
    expect(sendMock.mock.calls.some(([x]) => x.to === mail('nobody'))).toBe(false);
  });

  it('payment: a bank file released by someone else after a fresh second step; results; the payment advice', async () => {
    const b = (await api('payAdmin', 'post', '/payroll/consultant-payouts').send({ invoiceIds: [ids.invB, ids.invC], debitAccount: '123456789012' }).expect(201)).body;
    expect(b).toMatchObject({ rows: 2, total: '51900.00', releasePhrase: 'RELEASE 2' });
    // Not payable twice.
    await api('payAdmin', 'post', '/payroll/consultant-payouts').send({ invoiceIds: [ids.invB], debitAccount: '123456789012' }).expect(409);
    const file = binary(api('payAdmin', 'get', `/payroll/consultant-payouts/${b.id}/file`)).expect(200);
    expect((await file).body.length).toBeGreaterThan(100);
    await markSteppedUp(tenantPrisma, token.payAdmin);
    await api('payAdmin', 'post', `/payroll/consultant-payouts/${b.id}/release`).send({ confirmation: { phrase: 'RELEASE 2', impact: [] } }).expect(403);
    expect((await api('approver1', 'post', `/payroll/consultant-payouts/${b.id}/release`).send({ confirmation: { phrase: 'RELEASE 2', impact: [] } }).expect(403)).body.code).toBe('STEP_UP_REQUIRED');
    await markSteppedUp(tenantPrisma, token.approver1);
    await api('approver1', 'post', `/payroll/consultant-payouts/${b.id}/release`).send({ confirmation: { phrase: 'RELEASE 1', impact: [] } }).expect(400);
    await api('approver1', 'post', `/payroll/consultant-payouts/${b.id}/release`).send({ confirmation: { phrase: 'RELEASE 2', impact: [] } }).expect(200);
    await api('payAdmin', 'post', `/payroll/consultant-payouts/${b.id}/results`)
      .send({ rows: [{ invoiceId: ids.invB, status: 'paid', ref: 'UTR0001' }, { invoiceId: ids.invC, status: 'failed', reason: 'Account closed' }] })
      .expect(200);
    const invs = (await api('payAdmin', 'get', '/payroll/consultant-invoices').expect(200)).body as { id: string; status: string; paymentRef: string }[];
    expect(invs.find((i) => i.id === ids.invB)).toMatchObject({ status: 'paid', paymentRef: 'UTR0001' });
    expect(invs.find((i) => i.id === ids.invC)!.status).toBe('failed');
    const advice = await binary(api('payAdmin', 'get', `/payroll/consultant-invoices/${ids.invB}/advice`)).expect(200);
    expect(advice.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await binary(portal('get', `/invoices/${ids.invB}/advice`, ids.tAsha)).expect(200)).body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('Form 140: challans per section, reconciled, the e-TDS file with full PANs only in the file, filed', async () => {
    const challans = (await api('payAdmin', 'post', '/payroll/consultant-challans/prepare').send({ entityId: ids.entity, month }).expect(200)).body as { id: string; section: string; tds: string }[];
    expect(Object.fromEntries(challans.map((x) => [x.section, x.tds]))).toEqual({ '194C': '7000.00', '194J_B': '8400.00' });
    const ret = (await api('payAdmin', 'post', '/payroll/consultant-returns').send({ entityId: ids.entity, taxYear, quarter }).expect(201)).body;
    expect(ret).toMatchObject({ formCode: taxYear >= '2026-27' ? '140' : '26Q', rows: 4, tds: '15400.00' });
    expect(JSON.stringify(ret)).not.toContain('ABCDE1234F');
    expect((await api('payAdmin', 'post', `/payroll/consultant-returns/${ret.id}/reconcile`).expect(200)).body.status).toBe('draft');
    let n = 10;
    for (const ch of challans) await api('payAdmin', 'patch', `/statutory/challans/${ch.id}`).send({ challanNo: `000${n++}`, bsrCode: '0510308', depositDate: today }).expect(200);
    expect((await api('payAdmin', 'post', `/payroll/consultant-returns/${ret.id}/reconcile`).expect(200)).body.status).toBe('reconciled');
    const made = (await api('payAdmin', 'post', `/payroll/consultant-returns/${ret.id}/file`).expect(200)).body;
    const link = (await api('payAdmin', 'post', `/payroll/files/${made.fileId}/link`).expect(200)).body;
    const text = (await binary(api('payAdmin', 'get', link.path)).expect(200)).body.toString('utf8');
    expect(text).toContain('ABCDE1234F');
    expect(text).toContain('^94J-B^');
    // The salary return routes never touch it.
    await api('payAdmin', 'get', `/statutory/tds-returns/${ret.id}`).expect(404);
    const phrase = `FILED ${ret.formCode} Q${quarter} ${taxYear}`;
    expect((await api('payAdmin', 'post', `/payroll/consultant-returns/${ret.id}/filed`).send({ tokenNo: 'TKN123456', confirmation: { phrase, impact: [] } }).expect(200)).body.status).toBe('filed');
  });

  it('Form 131: the TRACES ZIP matched by PAN; the consultant downloads their own', async () => {
    const zip = new JSZip();
    zip.file(`ABCDE1234F_Q${quarter}.pdf`, pdf);
    zip.file('ZZZZZ9999Z_Q1.pdf', pdf);
    const data = await zip.generateAsync({ type: 'nodebuffer' });
    // A ZIP bomb (6 MB of zeros squeezed small) is refused before it is unpacked.
    const bomb = new JSZip();
    bomb.file('ABCDE1234F.pdf', Buffer.alloc(6_000_000));
    const big = await bomb.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    await api('payAdmin', 'post', '/payroll/consultant-certificates/import').field('legalEntityId', ids.entity).field('taxYear', taxYear).field('quarter', String(quarter)).attach('file', big, 'bomb.zip').expect(400);
    const out = (await api('payAdmin', 'post', '/payroll/consultant-certificates/import').field('legalEntityId', ids.entity).field('taxYear', taxYear).field('quarter', String(quarter)).attach('file', data, 'traces.zip').expect(201)).body;
    expect(out.matched.map((m: { consultantId: string }) => m.consultantId)).toEqual([ids.k1]);
    expect(out.unmatched).toEqual(['ZZZZZ9999Z_Q1.pdf']);
    const t = ids.tAsha;
    const me = (await portal('get', '/me', t).expect(200)).body;
    expect(me.certificates).toHaveLength(1);
    expect((await binary(portal('get', `/certificates/${me.certificates[0].id}/file`, t)).expect(200)).body.subarray(0, 5).toString()).toBe('%PDF-');
    const t2 = await signIn(mail('lower'));
    expect((await portal('get', '/me', t2).expect(200)).body.certificates).toHaveLength(0);
    await portal('get', `/certificates/${me.certificates[0].id}/file`, t2).expect(404);
    await portal('post', '/sign-out', t).expect(200);
    await portal('get', '/me', t).expect(401);
  });

  it('two bank files made at once never carry the same invoice', async () => {
    const i = await invoice(ids.k1, 'INV-009', '1000.00');
    const both = await Promise.all([1, 2].map(() => api('payAdmin', 'post', '/payroll/consultant-payouts').send({ invoiceIds: [i.id], debitAccount: '123456789012' })));
    expect(both.map((r) => r.status).sort()).toEqual([201, 409]);
  });
});
