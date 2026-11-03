import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import ExcelJS from 'exceljs';
import type Redis from 'ioredis';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { ExpenseCardsService } from '../src/expenses/cards.service';
import { withPayScope } from '../src/payroll/pay-access';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// EXP-08 card statement import and matching end to end against the real database (forced RLS, the app role):
//   import      CSV and Excel; every row checked (one bad row and nothing is saved); the same file, or the same bank and
//               period, refused plainly; full card numbers cut to the last 4 digits (stored file too); a new version
//               only while nothing on the old one is matched or explained
//   match       suggestions by holder, amount (₹1) and date (3 days); confirm; a claim line matched once; a personal
//               line becomes a company-card line (not paid twice) and stays one; never one's own card
//   chase       Ask employee, Close (a card linked to nobody blocks it), reminders on the company schedule once each
//   employee    sees only their own lines; business makes a draft company-card claim line; personal is recovered
//   who         finance (expense.payout.manage company-wide) only; employee, manager and another company refused
process.env.EXPENSE_OCR_ADAPTER = 'dev-fake';
process.env.SD_SCANNER = 'dev-fake';

describe('Expenses: card statements (EXP-08)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let cards: ExpenseCardsService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'mgr' | 'ravi' | 'sita' | 'fin';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const emp = {} as Record<string, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => request(server())[method](`/api/v1/expenses${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const d = (n: number) => new Date(new Date(`${today}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const png = () => Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'), Buffer.from(randomUUID())]);
  type Claim = { id: string; version: number; claimedTotal: string; lines: { id: string; version: number; payMode: string }[] };
  type CardLine = { id: string; status: string; version: number; description: string; cardLast4: string | null; suggestion: { lineId: string } | null; matchedTo: { lineId: string } | null; holders: { id: string }[]; own: boolean };
  const MAP = { date: 'Txn Date', dateFormat: 'DD/MM/YYYY', description: 'Description', amountMode: 'signed', amount: 'Amount', card: 'Card Number' };
  const BANK = `Kaveri Bank ${run}`;
  const csv = (rows: string[][]) => Buffer.from(['Corporate card statement', '', 'Txn Date,Card Number,Description,Amount', ...rows.map((r) => r.join(','))].join('\n') + '\n');
  const upload = (who: Who, file: Buffer, name: string, fields: Record<string, string>) => {
    let r = api(who, 'post', '/card-statements').attach('file', file, { filename: name, contentType: name.endsWith('.csv') ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
    return r;
  };
  const bill = async (who: Who, claimId: string, name: string, body: Record<string, unknown>) => {
    const c = (await api(who, 'post', `/claims/${claimId}/receipts`).attach('file', png(), { filename: name, contentType: 'image/png' }).expect(201)).body as Claim;
    const l = c.lines[c.lines.length - 1];
    return (await api(who, 'put', `/claims/${claimId}/lines/${l.id}`).send({ ...body, version: l.version }).expect(200)).body as Claim;
  };
  const statement = async (id: string) => (await api('fin', 'get', `/card-statements/${id}`).expect(200)).body as { statement: { version: number; status: string; fullNumbersDropped: number }; lines: CardLine[] };
  const line = (lines: CardLine[], desc: string) => lines.find((l) => l.description === desc)!;
  let file1: Buffer;

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
    cards = moduleRef.get(ExpenseCardsService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `expc-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `ExpCards Org ${k}`, slug: `expc-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['mgr', 'A', 'panel', []],
      ['ravi', 'A', 'panel', []],
      ['sita', 'A', 'panel', []],
      ['fin', 'A', 'panel', ['expense.payout.manage']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@expc-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@expc-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Foods Pvt Ltd', shortName: `KF${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.blr = (await tx.location.create({ data: { ...x, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...x, id: deptId, name: 'Sales', code: 'SAL', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...x, name: 'Executive', code: 'EX' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...x, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (who: Who, given: string, code: string, manager: string | null) =>
      (await request(server()).post('/api/v1/people/employees').set('Authorization', `Bearer ${token.adminA}`).send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: given, familyName: run, employeeCode: code, joinedOn: '2026-04-06', userId: users[who], workEmail: `${who}@expc-${run}.test`, assignment: { locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } }).expect(201)).body.id as string;
    emp.mgr = await hire('mgr', 'Divya', 'KF-001', null);
    emp.ravi = await hire('ravi', 'Vikram', 'KF-002', emp.mgr);
    emp.sita = await hire('sita', 'Sana', 'KF-003', emp.mgr);
    emp.fin = await hire('fin', 'Meena', 'KF-004', emp.mgr);
    await api('adminA', 'post', '/setup/from-starter').expect(201);
    // Ravi paid the flight on the company card and claims it so; the fuel he put down as personal by mistake.
    const c = (await api('ravi', 'post', '/claims').send({ title: 'Mumbai visit' }).expect(201)).body as Claim;
    ids.claim = c.id;
    let got = await bill('ravi', c.id, 'receipt__SkyIndia__Grand Total 6,840.00.png', { categoryCode: 'other', spentOn: d(-6), merchant: 'SkyIndia Airlines', amount: '6840.00', payMode: 'company_card' });
    ids.flight = got.lines[0].id;
    got = await bill('ravi', c.id, 'receipt__Fuelpoint__Grand Total 2,100.00.png', { categoryCode: 'other', spentOn: d(-5), merchant: 'Fuelpoint', amount: '2100.00', payMode: 'personal' });
    ids.fuel = got.lines[1].id;
    // Meena (finance) has a card too, with a taxi on it.
    const f = (await api('fin', 'post', '/claims').send({ title: 'Taxi' }).expect(201)).body as Claim;
    ids.finTaxi = (await bill('fin', f.id, 'receipt__Taxi__Grand Total 300.00.png', { categoryCode: 'other', spentOn: d(-4), merchant: 'City Taxi', amount: '300.00', payMode: 'company_card' })).lines[0].id;
    file1 = csv([
      [dmy(d(-6)), '4111 1111 1111 1234', 'SKYINDIA AIRLINES BOM', '"6,840.00"'],
      [dmy(d(-4)), 'XXXX1234', 'FUELPOINT KORAMANGALA', '2100.50'],
      [dmy(d(-3)), 'XXXX1234', 'BOOKNOOK MG ROAD', '1450.00'],
      [dmy(d(-2)), 'XXXX9999', 'CLOUDSOFT SUBSCRIPTION', '3999.00'],
      [dmy(d(-4)), 'XXXX7777', 'CITY TAXI', '300.00'],
      [dmy(d(-1)), 'XXXX1234', 'REFUND SKYINDIA', '-500.00'],
    ]);
  }, 240_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) {
        // The app role cannot delete card rows; the test clean-up runs as the owner (super admin, RLS bypass).
        await tx.$executeRaw`DELETE FROM expense_card_lines WHERE organization_id = ${org[k].id}::uuid`.catch(() => undefined);
        await tx.$executeRaw`DELETE FROM expense_card_statements WHERE organization_id = ${org[k].id}::uuid`.catch(() => undefined);
        await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
      }
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('only finance with expense.payout.manage: the employee and the manager are refused', async () => {
    await api('ravi', 'get', '/card-statements').expect(403);
    await api('mgr', 'get', '/card-statements').expect(403);
    await upload('ravi', file1, 'kf.csv', { bankName: BANK, mapping: JSON.stringify(MAP) }).expect(403);
    await api('ravi', 'post', '/cards').send({ employeeId: emp.ravi, bankName: BANK, last4: '1234' }).expect(403);
    const empty = (await api('fin', 'get', '/card-statements').expect(200)).body;
    expect(empty).toMatchObject({ statements: [], banks: [], rules: { within: '1', days: 3 } });
  });

  it('preview: the columns and a few rows with full card numbers cut; a wrong file type or an empty file is refused', async () => {
    const p = (await api('fin', 'post', '/card-statements/preview').attach('file', file1, { filename: 'kf.csv', contentType: 'text/csv' }).field('bankName', BANK).expect(200)).body;
    expect(p.columns).toEqual(['Txn Date', 'Card Number', 'Description', 'Amount']);
    expect(p.rows).toBe(6);
    expect(p.sample[0][1]).toBe('XXXX1234');
    expect(JSON.stringify(p)).not.toContain('4111 1111 1111 1234');
    expect(p.mapping).toBeNull();
    const bad = await api('fin', 'post', '/card-statements/preview').attach('file', png(), { filename: 'kf.csv', contentType: 'text/csv' }).expect(400);
    expect(bad.body.code).toBe('FILE_REFUSED');
    await api('fin', 'post', '/card-statements/preview').attach('file', png(), { filename: 'kf.png', contentType: 'image/png' }).expect(400);
    await api('fin', 'post', '/card-statements/preview').expect(400);
  });

  it('a file with wrong rows: every bad row listed with what to fix, and nothing saved', async () => {
    const res = await upload('fin', csv([[dmy(d(-3)), '1234', 'OK ROW', '10.00'], ['31/02/2026', '1234', 'BAD DATE', '10'], [dmy(d(-3)), '12', '', 'ten']]), 'bad.csv', { bankName: BANK, mapping: JSON.stringify(MAP) }).expect(400);
    expect(res.body).toMatchObject({ code: 'ROWS_TO_FIX', total: 2, message: '2 rows need fixing. Nothing was imported. Fix the file and upload it again.' });
    expect(res.body.rows).toEqual([
      { rowNo: 5, problems: ['"31/02/2026" is not a date written as DD/MM/YYYY.'] },
      { rowNo: 6, problems: ['No description.', '"ten" is not an amount (up to 2 decimals).', 'The card number has fewer than 4 digits.'] },
    ]);
    // A mapping that names a column the file does not have, and a broken mapping.
    expect((await upload('fin', file1, 'kf.csv', { bankName: BANK, mapping: JSON.stringify({ ...MAP, amount: 'Debit' }) }).expect(400)).body.message).toContain('no heading row');
    await upload('fin', file1, 'kf.csv', { bankName: BANK, mapping: JSON.stringify({ ...MAP, amount: undefined }) }).expect(400);
    await upload('fin', file1, 'kf.csv', { bankName: BANK, mapping: 'not json' }).expect(400);
    await upload('fin', file1, 'kf.csv', { bankName: '<script>', mapping: JSON.stringify(MAP) }).expect(400);
    expect(await inA((tx) => tx.expenseCardStatement.count())).toBe(0);
    expect(await inA((tx) => tx.expenseCardMapping.count())).toBe(0);
  });

  it('cards on file: finance links the last 4 digits only; a bad number, a repeat and another company are refused', async () => {
    await api('fin', 'post', '/cards').send({ employeeId: emp.ravi, bankName: BANK, last4: '1234' }).expect(201);
    await api('fin', 'post', '/cards').send({ employeeId: emp.fin, bankName: BANK, last4: '7777' }).expect(201);
    await api('fin', 'post', '/cards').send({ employeeId: emp.ravi, bankName: BANK, last4: '1234' }).expect(409);
    await api('fin', 'post', '/cards').send({ employeeId: emp.ravi, bankName: BANK, last4: '4111111111111234' }).expect(400);
    await api('adminB', 'post', '/cards').send({ employeeId: emp.ravi, bankName: BANK, last4: '5555' }).expect(404);
    const people = (await api('fin', 'get', '/cards/people?q=San').expect(200)).body as { id: string; code: string }[];
    expect(people).toEqual([expect.objectContaining({ id: emp.sita, code: 'KF-003' })]);
    expect((await api('fin', 'get', '/cards/people?q=KF-002').expect(200)).body[0].id).toBe(emp.ravi);
    await api('ravi', 'get', '/cards/people?q=San').expect(403);
  });

  it('imports a CSV: full card numbers are cut to the last 4 digits (also in the stored file), refunds kept apart', async () => {
    const res = (await upload('fin', file1, 'kf-cards.csv', { bankName: BANK, mapping: JSON.stringify(MAP) }).expect(201)).body;
    ids.st = res.id;
    expect(res.fullNumbersDropped).toBe(1);
    const rows = await inA((tx) => tx.expenseCardLine.findMany({ where: { statementId: res.id }, orderBy: { rowNo: 'asc' } }));
    expect(rows.map((r) => [r.cardLast4, r.status])).toEqual([['1234', 'open'], ['1234', 'open'], ['1234', 'open'], ['9999', 'open'], ['7777', 'open'], ['1234', 'refund']]);
    expect(JSON.stringify(rows)).not.toContain('4111');
    const st = await inA((tx) => tx.expenseCardStatement.findFirstOrThrow({ where: { id: res.id } }));
    expect(st).toMatchObject({ rowCount: 6, revision: 1, status: 'open' });
    expect(st.debitTotal.toFixed(2)).toBe('14689.50');
    expect(st.creditTotal.toFixed(2)).toBe('500.00');
    const f = await inA((tx) => tx.file.findFirstOrThrow({ where: { id: st.fileId! } }));
    expect(f.fileName).toBe('kf-cards-last4-only.csv');
    expect((await inA((tx) => tx.auditLog.count({ where: { action: 'expense.card.statement.imported', entityId: res.id } })))).toBe(1);
    // The mapping is saved for the bank and offered next time.
    const p = (await api('fin', 'post', '/card-statements/preview').attach('file', file1, { filename: 'kf.csv', contentType: 'text/csv' }).field('bankName', BANK.toUpperCase()).expect(200)).body;
    expect(p.mapping).toMatchObject({ bankName: BANK, version: 1, columns: MAP });
  });

  it('the same file twice, or another file for the same bank and period, is refused plainly', async () => {
    const dup = await upload('fin', file1, 'again.csv', { bankName: BANK, mapping: JSON.stringify(MAP) }).expect(409);
    expect(dup.body).toMatchObject({ code: 'DUPLICATE_STATEMENT', statementId: ids.st });
    expect(dup.body.message).toContain('This file was already imported on');
    const other = Buffer.concat([file1, Buffer.from('\n')]);
    const same = await upload('fin', other, 'again.csv', { bankName: BANK, mapping: JSON.stringify(MAP) }).expect(409);
    expect(same.body).toMatchObject({ code: 'SAME_PERIOD', revision: 1 });
    expect(same.body.message).toContain('Import this file as version 2 to replace it');
    expect(await inA((tx) => tx.expenseCardStatement.count())).toBe(1);
  });

  it('suggestions: holder, amount within ₹1, date within 3 days; refunds and unknown cards have none; the view is audited', async () => {
    const s = await statement(ids.st);
    expect(line(s.lines, 'SKYINDIA AIRLINES BOM').suggestion?.lineId).toBe(ids.flight);
    expect(line(s.lines, 'FUELPOINT KORAMANGALA').suggestion?.lineId).toBe(ids.fuel);
    expect(line(s.lines, 'BOOKNOOK MG ROAD').suggestion).toBeNull();
    expect(line(s.lines, 'CLOUDSOFT SUBSCRIPTION')).toMatchObject({ suggestion: null, holders: [] });
    expect(line(s.lines, 'REFUND SKYINDIA')).toMatchObject({ status: 'refund', suggestion: null });
    expect(line(s.lines, 'CITY TAXI')).toMatchObject({ own: true });
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'expense.card.statement.viewed', entityId: ids.st } }))).toBeGreaterThan(0);
    await api('adminB', 'get', `/card-statements/${ids.st}`).expect(404);
    await api('ravi', 'get', `/card-statements/${ids.st}`).expect(403);
  });

  it('confirming matches: once per claim line; a stale version is refused; a personal line becomes a company-card line', async () => {
    let s = await statement(ids.st);
    const sky = line(s.lines, 'SKYINDIA AIRLINES BOM');
    await api('fin', 'post', `/card-statements/${ids.st}/lines/${sky.id}/match`).send({ claimLineId: ids.flight, version: sky.version }).expect(200);
    await api('fin', 'post', `/card-statements/${ids.st}/lines/${sky.id}/match`).send({ claimLineId: ids.flight, version: sky.version }).expect(409);
    const book = line(s.lines, 'BOOKNOOK MG ROAD');
    expect((await api('fin', 'post', `/card-statements/${ids.st}/lines/${book.id}/match`).send({ claimLineId: ids.flight, version: book.version }).expect(409)).body.message).toBe('That claim line is already matched to another card line.');
    const before = (await api('ravi', 'get', `/claims/${ids.claim}`).expect(200)).body as Claim;
    expect(before.claimedTotal).toBe('2100.00');
    const fuel = line(s.lines, 'FUELPOINT KORAMANGALA');
    await api('fin', 'post', `/card-statements/${ids.st}/lines/${fuel.id}/match`).send({ claimLineId: ids.fuel, version: fuel.version }).expect(200);
    const after = (await api('ravi', 'get', `/claims/${ids.claim}`).expect(200)).body as Claim;
    expect(after.lines.find((l) => l.id === ids.fuel)!.payMode).toBe('company_card');
    expect(after.claimedTotal).toBe('0.00');
    // The employee cannot turn a matched line back into a personal one (it would be paid twice).
    const fl = after.lines.find((l) => l.id === ids.fuel)!;
    expect((await api('ravi', 'put', `/claims/${ids.claim}/lines/${ids.fuel}`).send({ categoryCode: 'other', spentOn: d(-5), merchant: 'Fuelpoint', amount: '2100.00', payMode: 'personal', version: fl.version }).expect(400)).body.message).toContain('stays a company card line');
    // Never one's own card line; a refund is never matched; another company sees nothing.
    const taxi = line(s.lines, 'CITY TAXI');
    await api('fin', 'post', `/card-statements/${ids.st}/lines/${taxi.id}/match`).send({ claimLineId: ids.finTaxi, version: taxi.version }).expect(403);
    const refund = line(s.lines, 'REFUND SKYINDIA');
    await api('fin', 'post', `/card-statements/${ids.st}/lines/${refund.id}/match`).send({ claimLineId: ids.flight, version: refund.version }).expect(409);
    await api('adminB', 'post', `/card-statements/${ids.st}/lines/${book.id}/match`).send({ claimLineId: ids.flight, version: book.version }).expect(404);
    s = await statement(ids.st);
    expect(line(s.lines, 'SKYINDIA AIRLINES BOM')).toMatchObject({ status: 'matched', matchedTo: { lineId: ids.flight } });
  });

  it('closing: a card linked to nobody blocks it; linked, every line left goes to its holder', async () => {
    let s = await statement(ids.st);
    const close = await api('fin', 'post', `/card-statements/${ids.st}/close`).send({ version: s.statement.version, note: 'September done' }).expect(409);
    expect(close.body).toMatchObject({ code: 'CARDS_TO_LINK' });
    expect(close.body.message).toBe('1 line has a card not linked to one employee. Link the cards or match the lines first.');
    expect((await api('fin', 'post', '/cards').send({ employeeId: emp.sita, bankName: BANK, last4: '9999' }).expect(201)).body.lines).toBe(1);
    s = await statement(ids.st);
    expect(line(s.lines, 'CLOUDSOFT SUBSCRIPTION').holders.map((h) => h.id)).toEqual([emp.sita]);
    const book = line(s.lines, 'BOOKNOOK MG ROAD');
    await api('fin', 'post', `/card-statements/${ids.st}/lines/${book.id}/chase`).send({ version: book.version }).expect(200);
    await api('fin', 'post', `/card-statements/${ids.st}/lines/${book.id}/chase`).send({ version: book.version + 1 }).expect(409);
    await api('fin', 'post', `/card-statements/${ids.st}/close`).send({ version: s.statement.version + 5 }).expect(409);
    await api('fin', 'post', `/card-statements/${ids.st}/close`).send({ version: s.statement.version, note: 'September done' }).expect(200);
    s = await statement(ids.st);
    expect(s.statement.status).toBe('closed');
    expect(s.lines.map((l) => [l.description, l.status])).toEqual([
      ['SKYINDIA AIRLINES BOM', 'matched'],
      ['FUELPOINT KORAMANGALA', 'matched'],
      ['BOOKNOOK MG ROAD', 'to_chase'],
      ['CLOUDSOFT SUBSCRIPTION', 'to_chase'],
      ['CITY TAXI', 'to_chase'],
      ['REFUND SKYINDIA', 'refund'],
    ]);
    await api('fin', 'post', `/card-statements/${ids.st}/close`).send({ version: s.statement.version }).expect(409);
  });

  it('the employee sees only their own lines; business makes a draft company-card line, personal is recovered from salary', async () => {
    const mine = (await api('ravi', 'get', '/card-lines/mine').expect(200)).body;
    expect(mine.lines.map((l: { description: string }) => l.description)).toEqual(['BOOKNOOK MG ROAD']);
    expect(mine.recoveryInstalments).toBe(3);
    const sitas = (await api('sita', 'get', '/card-lines/mine').expect(200)).body.lines;
    expect(sitas.map((l: { description: string }) => l.description)).toEqual(['CLOUDSOFT SUBSCRIPTION']);
    await api('ravi', 'post', `/card-lines/${sitas[0].id}/explain`).send({ choice: 'personal', version: sitas[0].version }).expect(404);
    await api('ravi', 'post', `/card-lines/${mine.lines[0].id}/explain`).send({ choice: 'maybe', version: mine.lines[0].version }).expect(400);
    const b = (await api('ravi', 'post', `/card-lines/${mine.lines[0].id}/explain`).send({ choice: 'business', version: mine.lines[0].version }).expect(200)).body;
    const claim = (await api('ravi', 'get', `/claims/${b.claimId}`).expect(200)).body as Claim & { title: string };
    expect(claim.title).toMatch(/^Company card, /);
    expect(claim.lines[0]).toMatchObject({ id: b.lineId, payMode: 'company_card' });
    await api('ravi', 'post', `/card-lines/${mine.lines[0].id}/explain`).send({ choice: 'business', version: mine.lines[0].version + 1 }).expect(409);
    const p = (await api('sita', 'post', `/card-lines/${sitas[0].id}/explain`).send({ choice: 'personal', version: sitas[0].version }).expect(200)).body;
    expect(p).toMatchObject({ choice: 'personal', instalments: 3, emi: '1333.00' });
    const loan = await inA((tx) => withPayScope(tx, [ids.entity], () => tx.loan.findFirstOrThrow({ where: { sourceRef: `card:${sitas[0].id}` } })));
    expect(loan.principal.toFixed(2)).toBe('3999.00');
    expect((await api('sita', 'get', '/card-lines/mine').expect(200)).body.lines).toEqual([]);
    // Finance can no longer match a line the employee said was personal.
    const s = await statement(ids.st);
    expect(line(s.lines, 'CLOUDSOFT SUBSCRIPTION').status).toBe('personal');
    expect(line(s.lines, 'BOOKNOOK MG ROAD')).toMatchObject({ status: 'matched', matchedTo: { lineId: b.lineId } });
    await api('mgr', 'get', '/card-lines/mine').expect(200);
    await api('adminB', 'post', `/card-lines/${sitas[0].id}/explain`).send({ choice: 'personal', version: 1 }).expect(403);
  });

  it('reminders follow the company schedule (3, 7, 14 days), each once; "off" sends none', async () => {
    const taxi = await inA((tx) => tx.expenseCardLine.findFirstOrThrow({ where: { statementId: ids.st, description: 'CITY TAXI' } }));
    expect(taxi.chasedOn!.toISOString().slice(0, 10)).toBe(today);
    expect(await cards.remindOrg(org.A.id, d(2))).toBe(0);
    expect(await cards.remindOrg(org.A.id, d(3))).toBe(1);
    expect(await cards.remindOrg(org.A.id, d(3))).toBe(0);
    expect(await cards.remindOrg(org.A.id, d(7))).toBe(1);
    await inA((tx) => tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key: 'expense.card.reminder_days', value: 'off' } }));
    expect(await cards.remindOrg(org.A.id, d(14))).toBe(0);
  });

  it('an Excel statement of another bank (debit and credit columns); a new version replaces it while nothing is matched', async () => {
    const book = new ExcelJS.Workbook();
    const sh = book.addWorksheet('Statement');
    sh.addRow(['Date', 'Card', 'Narration', 'Debit', 'Credit', 'Currency']);
    sh.addRow([new Date(`${d(-10)}T00:00:00Z`), 'XXXX-1234', 'HOTEL DUBAI', 220, null, 'AED']);
    sh.addRow([new Date(`${d(-9)}T00:00:00Z`), 'XXXX-1234', 'CASHBACK', null, 25.5, 'INR']);
    const xlsx = Buffer.from(await book.xlsx.writeBuffer());
    const M2 = { date: 'Date', dateFormat: 'DD/MM/YYYY', description: 'Narration', amountMode: 'split', debit: 'Debit', credit: 'Credit', card: 'Card', currency: 'Currency' };
    const HDFC = `Second Bank ${run}`;
    const v1 = (await upload('fin', xlsx, 'second.xlsx', { bankName: HDFC, mapping: JSON.stringify(M2) }).expect(201)).body;
    let rows = await inA((tx) => tx.expenseCardLine.findMany({ where: { statementId: v1.id }, orderBy: { rowNo: 'asc' } }));
    expect(rows.map((r) => [r.currency, r.amount.toFixed(2), r.direction, r.employeeId])).toEqual([['AED', '220.00', 'debit', null], ['INR', '25.50', 'credit', null]]);
    sh.addRow([new Date(`${d(-9)}T00:00:00Z`), 'XXXX-1234', 'LATE FEE', 50, null, 'INR']);
    const xlsx2 = Buffer.from(await book.xlsx.writeBuffer());
    const v2 = (await upload('fin', xlsx2, 'second-v2.xlsx', { bankName: HDFC, mapping: JSON.stringify(M2), replace: 'true' }).expect(201)).body;
    const st = await inA((tx) => tx.expenseCardStatement.findMany({ where: { bankName: HDFC }, orderBy: { revision: 'asc' } }));
    expect(st.map((x) => [x.revision, x.status, x.replacesId])).toEqual([[1, 'replaced', null], [2, 'open', v1.id]]);
    rows = await inA((tx) => tx.expenseCardLine.findMany({ where: { statementId: v1.id } }));
    expect(rows.every((r) => r.status === 'replaced')).toBe(true);
    expect(v2.id).toBe(st[1].id);
    // The first statement has matched lines, so it cannot be replaced.
    const again = Buffer.concat([file1, Buffer.from('\n\n')]);
    expect((await upload('fin', again, 'kf-v2.csv', { bankName: BANK, mapping: JSON.stringify(MAP), replace: 'true' }).expect(409)).body.message).toContain('cannot be replaced');
    const list = (await api('fin', 'get', '/card-statements').expect(200)).body;
    expect(list.banks.map((b: { bankName: string }) => b.bankName).sort()).toEqual([BANK, HDFC].sort());
    expect(list.statements).toHaveLength(3);
  });

  it('the app cannot delete card statement rows (database grant)', async () => {
    await expect(inA((tx) => tx.$executeRaw`DELETE FROM expense_card_lines WHERE statement_id = ${ids.st}::uuid`)).rejects.toThrow(/permission denied/);
    await expect(inA((tx) => tx.$executeRaw`DELETE FROM expense_card_statements WHERE id = ${ids.st}::uuid`)).rejects.toThrow(/permission denied/);
  });
});
