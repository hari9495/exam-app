process.env.SD_SCANNER = 'dev-fake';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// HLP-13 collective disputes end to end against the real database (forced RLS, the app role). Positive and negative:
// only the System Admin names the industrial relations team (not HR); IR members (an outside lawyer too) see a dispute,
// while HR, the System Admin, a manager, other staff and another company get 404 and an empty list; every route refused
// while acting for someone else; the conciliation clock from the IN.IR.DISPUTE rule set; papers fingerprinted, every
// open audited; the two-person settlement (the proposer cannot approve, the database refuses it too); the approved
// settlement creates exactly one PAY-37 wage-settlement arrears worksheet and no pay at all before payroll runs it;
// bad input; append-only.
describe('HLP-13 collective disputes', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hr' | 'ir1' | 'ir2' | 'lawyer' | 'manager' | 'other' | 'payAdmin' | 'irB' | 'acting';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1/desk/disputes${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const shift = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const asSuper = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant(SUPER, fn);
  // Payroll's tables also need the pay guard opened to the legal entity, even for the test's super-admin reads.
  const asPayroll = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) =>
    asSuper(async (tx) => (await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`, fn(tx)));
  const DISPUTE = () => ({ title: 'Charter of demands 2026', unionName: 'Kaveri Foods Workers Union (recognised)', locationId: ids.hosur, workersCovered: 212, receivedOn: shift(-40) });
  const SETTLEMENT = () => ({ kind: 'conciliation', signedOn: shift(-2), effectiveFrom: shift(-200), covered: 'Unskilled, semi-skilled and skilled workers, Hosur plant', terms: 'Basic pay +11 %, night-shift allowance Rs 120 a shift, transport for all shifts ending after 10 pm.', rates: [{ category: 'skilled', monthlyIncrease: '1500' }, { category: 'unskilled', monthlyIncrease: '1100' }], paperId: ids.signed });

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

    planId = (await prisma.plan.create({ data: { name: `hlp13-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HLP13 Org ${k}`, slug: `hlp13-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hr', 'A', 'panel', tpl('hr_admin')],
      ['ir1', 'A', 'panel', []],
      ['ir2', 'A', 'panel', []],
      ['lawyer', 'A', 'panel', []],
      ['manager', 'A', 'panel', tpl('manager_raise')],
      ['other', 'A', 'panel', []],
      ['payAdmin', 'A', 'panel', tpl('payroll_admin')],
      ['irB', 'B', 'panel', []],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hlp13-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hlp13-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Foods Pvt Ltd', shortName: `KF${run.slice(0, 4).toUpperCase()}`, isDefault: true, pan: 'AAPFU0939F' } })).id;
      ids.hosur = (await tx.location.create({ data: { ...x, legalEntityId: ids.entity, name: 'Hosur plant', code: 'HSR', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
    });
    ids.locB = (await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, async (tx) => {
      const le = await tx.legalEntity.create({ data: { organizationId: org.B.id, name: 'Other Co', shortName: `OC${run.slice(0, 4).toUpperCase()}`, isDefault: true, pan: 'AAPFU0939F' } });
      return tx.location.create({ data: { organizationId: org.B.id, legalEntityId: le.id, name: 'Pune', code: 'PNQ', address: {}, country: 'IN', state: 'IN-MH', timezone: 'Asia/Kolkata' } });
    })).id;
  }, 180_000);

  afterAll(async () => {
    await asSuper(async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('before set-up nobody can record a dispute; only the System Admin names the IR team (not HR); an outside lawyer joins as external', async () => {
    await api('ir1', 'get', '/form').expect(404);
    await api('ir1', 'post', '').send(DISPUTE()).expect(404);
    expect((await api('ir1', 'get', '').expect(200)).body).toEqual([]);
    const add = (who: Who, body: Record<string, unknown>) => request(server()).post('/api/v1/desk/speakup/setup/members').set('Authorization', `Bearer ${token[who]}`).send(body);
    await add('hr', { team: 'ir', userId: users.hr }).expect(403);
    await add('adminA', { team: 'ir', userId: users.ir1 }).expect(201);
    await add('adminA', { team: 'ir', userId: users.ir2 }).expect(201);
    await add('adminA', { team: 'ir', userId: users.lawyer, role: 'external' }).expect(201);
    await add('adminA', { team: 'ir', userId: users.ir1 }).expect(409);
    await add('adminA', { team: 'unions', userId: users.other }).expect(400);
    await add('adminB', { team: 'ir', userId: users.irB }).expect(201);
    const setup = (await request(server()).get('/api/v1/desk/speakup/setup').set('Authorization', `Bearer ${token.adminA}`).expect(200)).body;
    expect(setup.members).toEqual(expect.arrayContaining([expect.objectContaining({ team: 'ir', userId: users.lawyer, role: 'external' })]));
    expect((await api('ir1', 'get', '/form').expect(200)).body.locations).toEqual([{ id: ids.hosur, name: 'Hosur plant' }]);
  });

  it('bad input is refused with plain reasons', async () => {
    const bad = async (patch: Record<string, unknown>) => api('ir1', 'post', '').send({ ...DISPUTE(), ...patch }).expect(400);
    await bad({ receivedOn: shift(3) });
    await bad({ receivedOn: '40 days ago' });
    await bad({ locationId: ids.locB });
    await bad({ locationId: 'hosur' });
    await bad({ workersCovered: 0 });
    await bad({ workersCovered: '212' });
    await bad({ title: 'x' });
    await bad({ unionName: undefined });
    await bad({ secret: 'x' });
  });

  it('an IR member records a dispute; the IR team (the lawyer too) sees it; HR, the System Admin, a manager, others and another company get Not found', async () => {
    const r = (await api('ir1', 'post', '').send(DISPUTE()).expect(201)).body;
    expect(r.number).toBe('IRD-0001');
    ids.d = r.id;
    for (const who of ['ir1', 'ir2', 'lawyer'] as const) expect((await api(who, 'get', `/${ids.d}`).expect(200)).body).toMatchObject({ number: 'IRD-0001', unionName: 'Kaveri Foods Workers Union (recognised)', workersCovered: 212, stage: 'Charter received' });
    for (const who of ['hr', 'adminA', 'manager', 'other', 'payAdmin', 'adminB', 'irB'] as const) {
      await api(who, 'get', `/${ids.d}`).expect(404);
      await api(who, 'post', `/${ids.d}/demands`).send({ text: 'Basic pay +18 %', union: '18 %', mgmt: '9 %' }).expect(404);
    }
    for (const who of ['hr', 'adminA', 'manager', 'other', 'irB'] as const) expect([who, (await api(who, 'get', '').expect(200)).body]).toEqual([who, []]);
    await api('ir1', 'get', `/${randomUUID()}`).expect(404);
    const rows = (await api('ir2', 'get', '').expect(200)).body;
    expect(rows).toEqual([expect.objectContaining({ id: ids.d, ref: 'IRD-0001', kind: 'dispute', subject: 'Charter of demands 2026', location: 'Hosur plant', stage: 'Charter received', status: 'open' })]);
    // Every look is audited.
    expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'dispute.viewed', entityId: ids.d } }))).toBe(3);
    // The IR team sees Cases in the menu, with the open dispute counted; someone on no list doesn't.
    const counts = async (who: Who) => (await request(server()).get('/api/v1/workspace/counts').set('Authorization', `Bearer ${token[who]}`).expect(200)).body;
    expect((await counts('ir2')).casesOpen).toBe(1);
    expect((await counts('other')).casesOpen).toBeUndefined();
  });

  it('acting for someone else is refused on every route', async () => {
    token.acting = (await request(server()).post(`/api/v1/auth/impersonate/${users.ir1}`).set('Authorization', `Bearer ${token.adminA}`).expect(200)).body.accessToken;
    await api('acting', 'get', '').expect(403);
    await api('acting', 'get', '/form').expect(403);
    await api('acting', 'post', '').send(DISPUTE()).expect(403);
    await api('acting', 'get', `/${ids.d}`).expect(403);
    await api('acting', 'post', `/${ids.d}/demands`).send({ text: 'Basic pay +18 %', union: '18 %', mgmt: '9 %' }).expect(403);
    await api('acting', 'post', `/${ids.d}/meetings`).send({ kind: 'bipartite', on: today, attended: 'HR and the union', minutes: 'Talks held today.' }).expect(403);
    await api('acting', 'post', `/${ids.d}/settlement/approve`).expect(403);
    await api('acting', 'post', `/${ids.d}/close`).send({ how: 'withdrawn', note: 'Union withdrew it.' }).expect(403);
  });

  it('demands: added and agreed; agreed needs the words; bad input refused', async () => {
    ids.d1 = (await api('ir1', 'post', `/${ids.d}/demands`).send({ text: 'Basic pay increase of 18 % for all categories', union: '18 %', mgmt: '9 %' }).expect(201)).body.id;
    ids.d2 = (await api('ir2', 'post', `/${ids.d}/demands`).send({ text: 'Two additional festival holidays', union: '2 days', mgmt: '0' }).expect(201)).body.id;
    await api('ir1', 'post', `/${ids.d}/demands/${ids.d1}`).send({ status: 'agreed' }).expect(400);
    await api('ir1', 'post', `/${ids.d}/demands/${ids.d1}`).send({ status: 'won' }).expect(400);
    await api('ir1', 'post', `/${ids.d}/demands/${randomUUID()}`).send({ status: 'withdrawn' }).expect(404);
    await api('ir1', 'post', `/${ids.d}/demands`).send({ text: 'x', union: '', mgmt: '' }).expect(400);
    await api('ir1', 'post', `/${ids.d}/demands/${ids.d1}`).send({ status: 'agreed', agreed: '11 %', mgmt: '11 %' }).expect(201);
    const d = (await api('ir1', 'get', `/${ids.d}`).expect(200)).body;
    expect(d.demands).toEqual([expect.objectContaining({ code: 'D1', status: 'agreed', agreed: '11 %', mgmt: '11 %' }), expect.objectContaining({ code: 'D2', status: 'open', agreed: null })]);
  });

  it('meetings and papers: the minutes fingerprinted, opened only when clean, every open audited; the clock comes from IN.IR.DISPUTE', async () => {
    const minutes = (await api('ir1', 'post', `/${ids.d}/papers`).field('title', 'Minutes, conciliation meeting 1').attach('file', Buffer.from('%PDF-1.4\n%minutes\n'), 'minutes-1.pdf').expect(201)).body;
    expect(minutes.sha256).toMatch(/^[0-9a-f]{64}$/);
    await api('ir1', 'post', `/${ids.d}/papers`).field('title', 'Script').attach('file', Buffer.from('#!/bin/sh\necho hi\n'), 'run.sh').expect(400);
    await api('ir1', 'post', `/${ids.d}/papers`).field('title', 'Nothing').expect(400);
    ids.minutes = minutes.id;
    const meet = (body: Record<string, unknown>) => api('ir1', 'post', `/${ids.d}/meetings`).send({ attended: 'Union office bearers, HR-IR, the conciliation officer', minutes: 'Positions exchanged on pay and holidays.', ...body });
    await meet({ kind: 'bipartite', on: shift(-35) }).expect(201);
    await meet({ kind: 'conciliation', on: shift(-30) }).expect(400); // no officer
    await meet({ kind: 'conciliation', on: shift(1), officer: 'Assistant Labour Commissioner, Hosur' }).expect(400); // future
    await meet({ kind: 'conciliation', on: shift(-41), officer: 'ALC' }).expect(400); // before the charter
    await meet({ kind: 'conciliation', on: shift(-30), officer: 'ALC', nextOn: shift(-30) }).expect(400); // next not after
    await meet({ kind: 'conciliation', on: shift(-30), officer: 'ALC', paperId: randomUUID() }).expect(400); // not this dispute's paper
    await meet({ kind: 'conciliation', on: shift(-30), officer: 'Assistant Labour Commissioner, Hosur', paperId: ids.minutes, nextOn: shift(5) }).expect(201);
    const d = (await api('ir2', 'get', `/${ids.d}`).expect(200)).body;
    expect(d.stage).toBe('Conciliation');
    expect(d.meetings[1]).toMatchObject({ kind: 'conciliation', officer: 'Assistant Labour Commissioner, Hosur', paper: { id: ids.minutes, name: 'minutes-1.pdf' }, nextOn: shift(5) });
    // The report clock: the first conciliation meeting + the rule set's days (read from the database row, never code).
    const rs = await asSuper((tx) => tx.statutoryRuleSet.findFirstOrThrow({ where: { statute: 'IN.IR.DISPUTE', version: '2020-v1' } }));
    const days = (rs.values as { conciliationReportDays: number }).conciliationReportDays;
    expect(rs.verify).toBe(true);
    expect(d.source).toBe('IN.IR.DISPUTE 2020-v1 (verify)');
    expect(d.clocks).toEqual([
      { key: 'next', label: 'Next conciliation meeting', due: shift(5), doneOn: null },
      { key: 'report', label: 'Conciliation officer’s report', due: shift(-30 + days), doneOn: null },
    ]);
    for (let i = 0; i < 20 && (await inA((tx) => tx.file.findFirst({ where: { id: ids.minutes } })))?.scanStatus !== 'clean'; i++) await new Promise((r) => setTimeout(r, 250));
    await api('ir2', 'get', `/${ids.d}/files/${ids.minutes}`).expect(200);
    await api('hr', 'get', `/${ids.d}/files/${ids.minutes}`).expect(404);
    await api('ir2', 'get', `/${ids.d}/files/${randomUUID()}`).expect(404);
    const opens = await inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'dispute.paper_opened', entityId: ids.d } }));
    expect(opens).toHaveLength(1);
    expect(JSON.parse(opens[0].metadataJson!)).toMatchObject({ fileId: ids.minutes, sha256: minutes.sha256 });
  });

  it('the settlement needs two people: the proposer cannot approve (the database refuses it too); a lawyer approves only when the company allows', async () => {
    ids.signed = (await api('ir1', 'post', `/${ids.d}/papers`).field('title', 'Signed settlement').attach('file', Buffer.from('%PDF-1.4\n%signed\n'), 'settlement.pdf').expect(201)).body.id;
    const bad = async (patch: Record<string, unknown>) => api('ir1', 'post', `/${ids.d}/settlement`).send({ ...SETTLEMENT(), ...patch }).expect(400);
    await bad({ signedOn: shift(1) });
    await bad({ signedOn: shift(-50) });
    await bad({ effectiveTo: shift(-300) });
    await bad({ rates: [] });
    await bad({ rates: [{ category: 'skilled', monthlyIncrease: '1500' }, { category: 'skilled', monthlyIncrease: '900' }] });
    await bad({ rates: [{ category: 'managers', monthlyIncrease: '1500' }] });
    await bad({ rates: [{ category: 'skilled', monthlyIncrease: '-5' }] });
    await bad({ paperId: undefined });
    await bad({ paperId: randomUUID() });
    ids.proposal = (await api('ir1', 'post', `/${ids.d}/settlement`).send(SETTLEMENT()).expect(201)).body.id;
    await api('ir2', 'post', `/${ids.d}/settlement`).send(SETTLEMENT()).expect(409);
    let d = (await api('ir1', 'get', `/${ids.d}`).expect(200)).body;
    expect(d.settlement).toMatchObject({ status: 'proposed', proposedByMe: true, canApprove: false });
    expect((await api('ir2', 'get', `/${ids.d}`).expect(200)).body.settlement).toMatchObject({ status: 'proposed', proposedByMe: false, canApprove: true });
    expect((await api('ir1', 'get', '').expect(200)).body[0]).toMatchObject({ stage: 'Settlement to approve', status: 'action' });
    await api('ir1', 'post', `/${ids.d}/settlement/approve`).expect(403);
    await api('hr', 'post', `/${ids.d}/settlement/approve`).expect(404);
    await api('adminA', 'post', `/${ids.d}/settlement/approve`).expect(404);
    // The outside lawyer: refused under the default company setting.
    expect((await api('lawyer', 'get', `/${ids.d}`).expect(200)).body.settlement.canApprove).toBe(false);
    await api('lawyer', 'post', `/${ids.d}/settlement/approve`).expect(403);
    // The database refuses an approval by the proposer even if the app were bypassed.
    await expect(inA((tx) => tx.irDisputeStep.create({ data: { organizationId: org.A.id, disputeId: ids.d, kind: 'settlement_approved', actorUserId: users.ir1, data: { proposalId: ids.proposal, proposedBy: users.ir2, wageSettlementId: randomUUID() } } }))).rejects.toThrow(/four_eyes/);
    await expect(inA((tx) => tx.irDisputeStep.create({ data: { organizationId: org.A.id, disputeId: ids.d, kind: 'settlement_approved', actorUserId: users.ir2, data: { proposalId: randomUUID() } } }))).rejects.toThrow(/four_eyes/);
    // Sent back with a reason, recorded again.
    await api('ir2', 'post', `/${ids.d}/settlement/send-back`).send({ reason: 'x' }).expect(400);
    await api('ir2', 'post', `/${ids.d}/settlement/send-back`).send({ reason: 'The effective date is wrong.' }).expect(201);
    d = (await api('ir1', 'get', `/${ids.d}`).expect(200)).body;
    expect(d.settlement).toMatchObject({ status: 'none', sentBack: { reason: 'The effective date is wrong.' } });
    await api('ir2', 'post', `/${ids.d}/settlement/approve`).expect(409);
    ids.proposal = (await api('ir1', 'post', `/${ids.d}/settlement`).send(SETTLEMENT()).expect(201)).body.id;
  });

  it('the approved settlement creates exactly one arrears worksheet for payroll, with no pay change before payroll runs it', async () => {
    const counts = () =>
      asPayroll(async (tx) => ({
        settlements: await tx.wageSettlement.count({ where: { organizationId: org.A.id } }),
        postings: await tx.specialPosting.count({ where: { organizationId: org.A.id } }),
        oneTime: await tx.oneTimePay.count({ where: { organizationId: org.A.id } }),
        runs: await tx.payrollRun.count({ where: { organizationId: org.A.id } }),
        payslips: await tx.payslip.count({ where: { organizationId: org.A.id } }),
      }));
    expect(await counts()).toEqual({ settlements: 0, postings: 0, oneTime: 0, runs: 0, payslips: 0 });
    const r = (await api('ir2', 'post', `/${ids.d}/settlement/approve`).expect(201)).body;
    expect(r.wageSettlementId).toEqual(expect.any(String));
    await api('ir2', 'post', `/${ids.d}/settlement/approve`).expect(409);
    await api('ir1', 'post', `/${ids.d}/settlement/approve`).expect(409);
    // Exactly one worksheet, waiting for payroll (nothing posted, nothing paid).
    expect(await counts()).toEqual({ settlements: 1, postings: 0, oneTime: 0, runs: 0, payslips: 0 });
    const ws = await asPayroll((tx) => tx.wageSettlement.findFirstOrThrow({ where: { organizationId: org.A.id } }));
    expect(ws).toMatchObject({ id: r.wageSettlementId, legalEntityId: ids.entity, title: 'Charter of demands 2026 (IRD-0001)', createdBy: users.ir2 });
    expect(ws.rates).toEqual([{ category: 'skilled', monthlyIncrease: '1500' }, { category: 'unskilled', monthlyIncrease: '1100' }]);
    // Payroll sees it on its Settlements tab, to preview, post and get approved as usual.
    const pay = (await request(server()).get('/api/v1/payroll/special/unions').query({ legalEntityId: ids.entity }).set('Authorization', `Bearer ${token.payAdmin}`).expect(200)).body;
    expect(pay.settlements).toEqual([expect.objectContaining({ id: r.wageSettlementId, title: 'Charter of demands 2026 (IRD-0001)' })]);
    // The IR team never gets payroll access from this.
    await request(server()).get('/api/v1/payroll/special/unions').query({ legalEntityId: ids.entity }).set('Authorization', `Bearer ${token.ir2}`).expect(403);
    const d = (await api('ir1', 'get', `/${ids.d}`).expect(200)).body;
    expect(d.settlement).toMatchObject({ status: 'approved', wageSettlementId: r.wageSettlementId, proposedBy: `ir1 ${run}`, approvedBy: `ir2 ${run}` });
    expect(d.stage).toBe('Settled, file the copy');
    expect(d.clocks.find((c: { key: string }) => c.key === 'copy')).toMatchObject({ label: 'Settlement copy to the authorities', doneOn: null });
    expect(d.clocks.find((c: { key: string }) => c.key === 'report')).toMatchObject({ doneOn: shift(-2) });
    // The record is complete: no more demands, meetings or settlements.
    await api('ir1', 'post', `/${ids.d}/demands`).send({ text: 'Canteen subsidy review', union: 'Full', mgmt: 'Current' }).expect(409);
    await api('ir1', 'post', `/${ids.d}/settlement`).send(SETTLEMENT()).expect(409);
    await api('ir1', 'post', `/${ids.d}/close`).send({ how: 'withdrawn', note: 'Union withdrew it.' }).expect(409);
    // The proposer and payroll are told.
    const notes = await inA((tx) => tx.userNotification.findMany({ where: { organizationId: org.A.id, type: 'helpdesk.dispute.settlement' }, select: { recipientUserId: true } }));
    expect(notes.map((n) => n.recipientUserId)).toEqual(expect.arrayContaining([users.ir1, users.payAdmin]));
  });

  it('the copy filed with the authorities: after signing, not in the future, once; then the dispute is settled', async () => {
    await api('ir1', 'post', `/${ids.d}/filed`).send({ on: shift(1) }).expect(400);
    await api('ir1', 'post', `/${ids.d}/filed`).send({ on: shift(-3) }).expect(400);
    await api('ir1', 'post', `/${ids.d}/filed`).send({ on: today, ref: 'ALC/HSR/2026/118' }).expect(201);
    await api('ir1', 'post', `/${ids.d}/filed`).send({ on: today }).expect(409);
    const d = (await api('lawyer', 'get', `/${ids.d}`).expect(200)).body;
    expect(d).toMatchObject({ stage: 'Settled, copy filed', filed: { on: today, ref: 'ALC/HSR/2026/118' } });
    expect((await api('ir1', 'get', '').expect(200)).body[0]).toMatchObject({ status: 'closed', next: null });
  });

  it('a dispute closes without a settlement; a lawyer may approve when the company setting allows; append-only in the database', async () => {
    const two = (await api('ir2', 'post', '').send({ ...DISPUTE(), title: 'Bonus demand 2026' }).expect(201)).body;
    expect(two.number).toBe('IRD-0002');
    await api('ir2', 'post', `/${two.id}/settlement`).send({ ...SETTLEMENT(), paperId: ids.signed }).expect(400); // another dispute's paper
    await api('ir2', 'post', `/${two.id}/close`).send({ how: 'gave-up', note: 'x' }).expect(400);
    await api('ir2', 'post', `/${two.id}/close`).send({ how: 'withdrawn', note: 'The union withdrew the demand.' }).expect(201);
    await api('ir2', 'post', `/${two.id}/close`).send({ how: 'withdrawn', note: 'Again.' }).expect(409);
    expect((await api('ir2', 'get', `/${two.id}`).expect(200)).body.stage).toBe('Closed (withdrawn)');

    const three = (await api('ir1', 'post', '').send({ ...DISPUTE(), title: 'Night-shift allowance' }).expect(201)).body.id;
    const paper = (await api('ir1', 'post', `/${three}/papers`).field('title', 'Signed settlement').attach('file', Buffer.from('%PDF-1.4\n%signed-2\n'), 'settlement-2.pdf').expect(201)).body.id;
    await api('ir1', 'post', `/${three}/settlement`).send({ ...SETTLEMENT(), kind: 'conciliation', paperId: paper }).expect(400); // no conciliation meeting yet
    await api('ir1', 'post', `/${three}/settlement`).send({ ...SETTLEMENT(), kind: 'bipartite', paperId: paper }).expect(201);
    await request(server()).put('/api/v1/org/settings').set('Authorization', `Bearer ${token.adminA}`).send({ key: 'dispute.lawyer_may_approve', scopeType: 'tenant', value: 'yes' }).expect(200);
    expect((await api('lawyer', 'get', `/${three}`).expect(200)).body.settlement.canApprove).toBe(true);
    await api('lawyer', 'post', `/${three}/settlement/approve`).expect(201);
    expect(await asPayroll((tx) => tx.wageSettlement.count({ where: { organizationId: org.A.id } }))).toBe(2);

    await expect(inA((tx) => tx.irDisputeStep.updateMany({ where: { disputeId: ids.d }, data: { data: {} } }))).rejects.toThrow();
    await expect(inA((tx) => tx.irDisputeStep.deleteMany({ where: { disputeId: ids.d } }))).rejects.toThrow();
    await expect(inA((tx) => tx.irDispute.updateMany({ where: { id: ids.d }, data: { workersCovered: 1 } }))).rejects.toThrow();
  });
});
