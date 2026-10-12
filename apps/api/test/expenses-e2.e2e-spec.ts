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
import { gstinCheckChar } from '../src/expenses/checks';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Expenses batch E2 end to end against the real database (forced RLS, the app role): snap-first receipts read by the
// dev-fake OCR (suggestions only; the employee confirms every read line), the same receipt refused for a second claim,
// the policy check (receipt needed, over the limit needs a reason and an extra approval), computed mileage, GST input
// credit, the P03 route (manager, over-the-limit, finance), approve with changes and its reason, send back, the
// virus check blocking submit, who may see a claim and its receipt, and two companies apart.
process.env.EXPENSE_OCR_ADAPTER = 'dev-fake';
process.env.SD_SCANNER = 'dev-fake';

describe('Expenses batch E2', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
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
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const shift = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const dmy = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const gstin = (state: string, pan: string) => `${state}${pan}1Z${gstinCheckChar(`${state}${pan}1Z`)}`;
  const OURS = gstin('27', 'AAPFU0939F');
  const SUPPLIER = gstin('27', 'BBBBB2222B');
  // A 1×1 PNG; extra bytes make each receipt a different file.
  const png = () => Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'), Buffer.from(randomUUID())]);
  type Claim = { id: string; version: number; status: string; paymentStatus: string; claimedTotal: string; approvedTotal: string | null; netPayable: string; risk: string; decisionNote: string | null; lines: { id: string; version: number; categoryCode: string; claimed: string; approved: string | null; reduceReason: string | null; ocr: { fields: Record<string, { value: string; confidence: number }>; lowConfidence: string[]; confirmed: boolean } | null; gst: { itcStatus: string | null } | null; policy: { outcome: string } | null }[]; flags: { id: string; kind: string; status: string }[]; route: { steps: { name: string; state: string }[] } | null; can: Record<string, boolean> };
  const claim = async (who: Who, id: string) => (await api(who, 'get', `/claims/${id}`).expect(200)).body as Claim;
  const newClaim = async (title: string) => (await api('ravi', 'post', '/claims').send({ title }).expect(201)).body as Claim;
  const upload = (who: Who, id: string, name: string, data = png()) => api(who, 'post', `/claims/${id}/receipts`).attach('file', data, { filename: name, contentType: 'image/png' });
  const clean = async (claimId: string) => {
    for (let i = 0; i < 40; i++) {
      const pending = await inA((tx) => tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM files f JOIN expense_lines l ON l.organization_id = f.organization_id AND l.receipt_file_id = f.id WHERE l.claim_id = ${claimId}::uuid AND f.scan_status = 'pending'`);
      if (!pending[0].n) return;
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error('receipts never scanned');
  };
  const line = (o: Record<string, unknown>) => ({ payMode: 'personal', spentOn: shift(today, -3), ...o });

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

    planId = (await prisma.plan.create({ data: { name: `exp2-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Exp2 Org ${k}`, slug: `exp2-${k.toLowerCase()}-${run}`, planId } });
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
      ['fin', 'A', 'panel', ['expense.finance.review']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@exp2-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@exp2-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Sea Foods Pvt Ltd', shortName: `SF${run.slice(0, 4).toUpperCase()}`, isDefault: true, pan: 'AAPFU0939F' } })).id;
      ids.mum = (await tx.location.create({ data: { ...x, legalEntityId: ids.entity, name: 'Mumbai', code: 'MUM', address: {}, country: 'IN', state: 'IN-MH', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...x, id: deptId, name: 'Sales', code: 'SAL', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...x, name: 'Executive', code: 'EX' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...x, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (who: Who, given: string, code: string, manager: string | null) =>
      (await request(server()).post('/api/v1/people/employees').set('Authorization', `Bearer ${token.adminA}`).send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: given, familyName: run, employeeCode: code, joinedOn: '2026-04-06', userId: users[who], workEmail: `${who}@exp2-${run}.test`, assignment: { locationId: ids.mum, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } }).expect(201)).body.id as string;
    emp.head = await hire('head', 'Arun', 'SF-001', null);
    emp.mgr = await hire('mgr', 'Divya', 'SF-002', emp.head);
    emp.ravi = await hire('ravi', 'Ravi', 'SF-003', emp.mgr);
    emp.sita = await hire('sita', 'Sita', 'SF-004', emp.mgr);
    emp.fin = await hire('fin', 'Meena', 'SF-005', emp.head);
    await api('adminA', 'post', '/setup/from-starter').expect(201);
    await api('adminA', 'post', '/gst-registrations').send({ legalEntityId: ids.entity, gstin: OURS, validFrom: '2026-04-01' }).expect(201);
    await inA((tx) => tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key: 'expense.gst.capture', value: 'on' } }));
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('snap first: the receipt is read into a draft line the employee must confirm; the same receipt is refused on another claim', async () => {
    const c = await newClaim('Mumbai client visit');
    ids.claim1 = c.id;
    const name = `receipt__Hotel Sea View__GSTIN ${SUPPLIER}__Invoice No: SV-1182__Date ${dmy(shift(today, -3))}__CGST 9% 450.00__SGST 9% 450.00__Grand Total 5,900.00__Thank you@0.6.png`;
    const bytes = png();
    let after = (await upload('ravi', c.id, name, bytes).expect(201)).body as Claim;
    const read = after.lines[0];
    // The read amount counts in the claim at once; the employee still confirms it before sending.
    expect(after.claimedTotal).toBe('5900.00');
    expect(read.ocr).toMatchObject({ confirmed: false, fields: { amount: { value: '5900.00' }, gstin: { value: SUPPLIER }, invoiceNo: { value: 'SV-1182' }, date: { value: shift(today, -3) } } });
    expect(read.ocr!.lowConfidence).toContain('merchant');
    await clean(c.id);
    // Nothing read is used until the employee confirms it.
    expect((await api('ravi', 'post', `/claims/${c.id}/submit`).send({ version: after.version }).expect(400)).body.message).toBe('Line 1: check the values read from the receipt and save the line.');
    // The same file on Sita's claim is refused (F1).
    const other = (await api('sita', 'post', '/claims').send({ title: 'Mine' }).expect(201)).body as Claim;
    expect((await upload('sita', other.id, 'same.png', bytes).expect(409)).body.code).toBe('SAME_RECEIPT');
    // Confirmed as lodging in Mumbai (Tier 1, cap 5,000 a bill): over the limit, with GST billed to the company.
    after = (await api('ravi', 'put', `/claims/${c.id}/lines/${read.id}`).send(line({ categoryCode: 'lodging', merchant: 'Hotel Sea View', city: 'Mumbai', amount: '5900.00', gst: { supplierGstin: SUPPLIER, invoiceNo: 'SV-1182', taxableValue: '5000.00', cgst: '450.00', sgst: '450.00', billedToGstin: OURS }, version: read.version })).expect(200)).body;
    expect(after.lines[0]).toMatchObject({ policy: { outcome: 'over_justify' }, gst: { itcStatus: 'eligible' }, ocr: { confirmed: true } });
  });

  it('computed lines and the policy blockers: mileage is never typed; a big cab bill needs a receipt; over the limit needs a reason', async () => {
    const c = await claim('ravi', ids.claim1);
    await api('ravi', 'post', `/claims/${c.id}/lines`).send(line({ categoryCode: 'mileage', amount: '900.00', mileage: { vehicle: 'car', km: 42 } })).expect(400);
    const m = (await api('ravi', 'post', `/claims/${c.id}/lines`).send(line({ categoryCode: 'mileage', mileage: { vehicle: 'car', km: 42, from: 'Office', to: 'Client' } })).expect(201)).body as Claim;
    expect(m.lines.find((l) => l.categoryCode === 'mileage')!.claimed).toBe('714.00');
    const cab = (await api('ravi', 'post', `/claims/${c.id}/lines`).send(line({ categoryCode: 'local_conveyance', city: 'Mumbai', merchant: 'City Cabs', amount: '100000.00' })).expect(201)).body as Claim;
    const check = (await api('ravi', 'post', `/claims/${c.id}/check`).expect(200)).body as { blockers: { text: string }[] };
    expect(check.blockers.map((b) => b.text)).toEqual(expect.arrayContaining(['Line 1: over the limit by 900.00; say why.', 'Line 3: a receipt is needed above 500.00.', expect.stringMatching(/^Line 3: over the limit by/)]));
    const cabLine = cab.lines.find((l) => l.categoryCode === 'local_conveyance')!;
    await api('ravi', 'delete', `/claims/${c.id}/lines/${cabLine.id}`).expect(200);
    // A client-chosen approver does not exist (EX-D3).
    await api('ravi', 'post', `/claims/${c.id}/lines`).send(line({ categoryCode: 'meals', amount: '300.00', selfDeclared: true, approverUserId: users.fin })).expect(400);
    const hotel = (await claim('ravi', c.id)).lines.find((l) => l.categoryCode === 'lodging')!;
    await api('ravi', 'put', `/claims/${c.id}/lines/${hotel.id}`).send(line({ categoryCode: 'lodging', merchant: 'Hotel Sea View', city: 'Mumbai', amount: '5900.00', justification: 'Client asked us to stay at the venue', gst: { supplierGstin: SUPPLIER, invoiceNo: 'SV-1182', taxableValue: '5000.00', cgst: '450.00', sgst: '450.00', billedToGstin: OURS }, version: hotel.version })).expect(200);
  });

  it('the virus check must finish before submitting', async () => {
    const c = await claim('ravi', ids.claim1);
    const hotel = c.lines.find((l) => l.categoryCode === 'lodging')!;
    // A receipt whose scan has not come back (a scan verdict, once given, is final in the database).
    const { real, pending } = await inA(async (tx) => {
      const l = await tx.expenseLine.findFirstOrThrow({ where: { id: hotel.id } });
      const f = await tx.file.create({ data: { organizationId: org.A.id, area: 'expense', storageRef: 'none', fileName: 'late.png', mime: 'image/png', size: 10, sha256: 'a'.repeat(64), uploadedVia: 'self' } });
      await tx.expenseLine.update({ where: { id: l.id }, data: { receiptFileId: f.id } });
      return { real: l.receiptFileId!, pending: f.id };
    });
    expect((await api('ravi', 'post', `/claims/${c.id}/submit`).send({ version: c.version }).expect(400)).body.message).toMatch(/still being checked for viruses/);
    await inA((tx) => tx.expenseLine.update({ where: { id: hotel.id }, data: { receiptFileId: real } }));
    expect(pending).toBeTruthy();
  });

  it('the route: manager, then over the limit (the manager’s manager), then finance; the manager lowers a line with a reason', async () => {
    let c = await claim('ravi', ids.claim1);
    c = (await api('ravi', 'post', `/claims/${c.id}/submit`).send({ version: c.version }).expect(200)).body;
    expect(c.status).toBe('submitted');
    expect(c.route!.steps.map((s) => s.name)).toEqual(['Manager', 'Over the limit', 'Finance check']);
    expect(c.flags.map((f) => f.kind)).toContain('over_limit');
    expect(c.can).toMatchObject({ edit: false, withdraw: true, decide: false });
    // Sita (not an approver) cannot see it; Ravi cannot change amounts.
    await api('sita', 'get', `/claims/${c.id}`).expect(404);
    const hotel = c.lines.find((l) => l.categoryCode === 'lodging')!;
    await api('ravi', 'patch', `/claims/${c.id}/lines/${hotel.id}/approve-amount`).send({ amount: '5000.00', reason: 'cap' }).expect(403);
    // Divya: a reduction needs a reason; never above what was claimed.
    expect((await api('mgr', 'patch', `/claims/${c.id}/lines/${hotel.id}/approve-amount`).send({ amount: '5000.00' }).expect(400)).body.message).toBe('Say why you are approving less; the employee sees it.');
    await api('mgr', 'patch', `/claims/${c.id}/lines/${hotel.id}/approve-amount`).send({ amount: '6500.00', reason: 'more' }).expect(400);
    await api('mgr', 'patch', `/claims/${c.id}/lines/${hotel.id}/approve-amount`).send({ amount: '5000.00', reason: 'Hotel cap Tier 1' }).expect(200);
    const receipt = await api('mgr', 'get', `/claims/${c.id}/lines/${hotel.id}/receipt`).expect(200);
    expect(receipt.headers['content-type']).toBe('image/png');
    await api('sita', 'get', `/claims/${c.id}/lines/${hotel.id}/receipt`).expect(404);
    await api('mgr', 'post', `/claims/${c.id}/decide`).send({ decision: 'approve' }).expect(200);
    // The manager approved the first step, so the second (the over-limit step) is the head's.
    await api('mgr', 'post', `/claims/${c.id}/decide`).send({ decision: 'approve' }).expect(403);
    await api('head', 'post', `/claims/${c.id}/decide`).send({ decision: 'approve' }).expect(200);
    const fin = await claim('fin', c.id);
    expect(fin.can).toMatchObject({ decide: true, review: true });
    const flag = fin.flags.find((f) => f.kind === 'over_limit')!;
    await api('fin', 'post', `/flags/${flag.id}`).send({ decision: 'clear', note: 'Client venue, agreed' }).expect(200);
    await api('fin', 'post', `/claims/${c.id}/decide`).send({ decision: 'approve' }).expect(200);
    const done = await claim('ravi', c.id);
    expect(done).toMatchObject({ status: 'partly_approved', paymentStatus: 'approved_unpaid', claimedTotal: '6614.00', approvedTotal: '5714.00', netPayable: '5714.00' });
    expect(done.lines.find((l) => l.categoryCode === 'lodging')).toMatchObject({ claimed: '5900.00', approved: '5000.00', reduceReason: 'Hotel cap Tier 1' });
  });

  it('send back: the employee edits and submits again; an invoice already claimed is refused', async () => {
    const c = await newClaim('Second visit');
    const n = (await api('ravi', 'post', `/claims/${c.id}/lines`).send(line({ categoryCode: 'meals', city: 'Mumbai', merchant: 'Cafe', amount: '300.00', selfDeclared: true })).expect(201)).body as Claim;
    let s = (await api('ravi', 'post', `/claims/${c.id}/submit`).send({ version: n.version }).expect(200)).body as Claim;
    await api('mgr', 'post', `/claims/${c.id}/decide`).send({ decision: 'send_back' }).expect(400);
    await api('mgr', 'post', `/claims/${c.id}/decide`).send({ decision: 'send_back', reason: 'Add the restaurant name' }).expect(200);
    s = await claim('ravi', c.id);
    expect(s).toMatchObject({ status: 'sent_back', decisionNote: 'Add the restaurant name', can: { edit: true } });
    // The same GST invoice as the approved claim cannot be claimed again (F2).
    const dup = (await api('ravi', 'post', `/claims/${c.id}/lines`).send(line({ categoryCode: 'lodging', city: 'Mumbai', merchant: 'Hotel Sea View', amount: '100.00', selfDeclared: true, gst: { supplierGstin: SUPPLIER, invoiceNo: 'SV-1182' } })).expect(201)).body as Claim;
    expect((await api('ravi', 'post', `/claims/${c.id}/submit`).send({ version: dup.version }).expect(400)).body.message).toMatch(/invoice SV-1182 .* is already claimed/);
    const lodging = dup.lines.find((l) => l.categoryCode === 'lodging')!;
    const fixed = (await api('ravi', 'delete', `/claims/${c.id}/lines/${lodging.id}`).expect(200)).body as Claim;
    s = (await api('ravi', 'post', `/claims/${c.id}/submit`).send({ version: fixed.version }).expect(200)).body;
    expect(s.status).toBe('submitted');
    await api('mgr', 'post', `/claims/${c.id}/decide`).send({ decision: 'reject', reason: 'Personal meal' }).expect(200);
    expect((await claim('ravi', c.id)).status).toBe('rejected');
  });

  it('withdraw returns a waiting claim to a draft; companies stay apart', async () => {
    const c = await newClaim('Third');
    const n = (await api('ravi', 'post', `/claims/${c.id}/lines`).send(line({ categoryCode: 'meals', city: 'Mumbai', merchant: 'Canteen', amount: '120.00', selfDeclared: true })).expect(201)).body as Claim;
    await api('ravi', 'post', `/claims/${c.id}/submit`).send({ version: n.version }).expect(200);
    expect(((await api('ravi', 'post', `/claims/${c.id}/withdraw`).expect(200)).body as Claim).status).toBe('draft');
    expect(((await api('mgr', 'get', '/claims?view=approvals').expect(200)).body as { claims: unknown[] }).claims).toHaveLength(0);
    const home = (await api('ravi', 'get', '/me/home').expect(200)).body as { claims: unknown[]; toReceive: string };
    expect(home).toMatchObject({ toReceive: '5714.00' });
    await api('adminB', 'get', `/claims/${c.id}`).expect(404);
    expect(((await api('adminB', 'get', '/claims').expect(200)).body as { claims: unknown[] }).claims).toEqual([]);
  });
});
