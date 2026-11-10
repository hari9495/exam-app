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
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { OfferBuilderService } from '../src/offers/offer-builder.service';

// HIR-09 offer builder and HIR-29 conditions end to end against the real database (forced RLS, the app role). A recruiter
// with the offer-pay key drafts an offer from the company's salary structure (Pay's own breakup), sends it for approval
// (the company's chain; never approved by the sender), and sends it; above the grade range adds the step from the company
// setting (default the HR head); each change is a new version with its history; pay is hidden without the key; conditions
// are met or waived with a reason; accepting by the link makes the joiner in People exactly as before and, at joining, the
// offer's pay goes to Pay; e-sign only when the template says so; an older text offer reads as version 0. Refusals: an
// employee (403), another company (404), acting for someone else (403), bad input (400).
describe('HIR-09 offer builder and HIR-29 conditions', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  let builder: OfferBuilderService;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'rec' | 'rec2' | 'noPay' | 'hrHead' | 'mgr' | 'hr' | 'pay' | 'emp' | 'recB' | 'actee' | 'cfo' | 'acting';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const pub = (method: 'get' | 'post', path: string) => request(server())[method](`/api/v1/public${path}`);
  const at = (o: string) => <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => at(org.A.id)(fn);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const plus = (days: number) => new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const endOfToday = `${today}T23:59:00+05:30`;
  const email = { send: jest.fn(async (_m: { to: string; subject: string }) => ({ success: true })) };
  const codeFor = async (to: string) => {
    for (let i = 0; i < 60; i++) {
      const m = [...email.send.mock.calls].reverse().find(([x]) => x.to === to && /^\d{6}/.test(x.subject));
      if (m) return m[0].subject.slice(0, 6);
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`no code for ${to}`);
  };
  const setting = (key: string, value: string | null) =>
    inA(async (tx) => {
      await tx.setting.deleteMany({ where: { organizationId: org.A.id, key } });
      if (value) await tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key, value } });
    });
  const entry = async (k: string) => (ids[k] = (await api('rec', 'post', `/jobs/${ids.job}/entries`).send({ newCandidate: { name: `Cand ${k}`, email: `${k}-${run}@mail.test` } }).expect(201)).body.id);
  const draft = (entryId: string, over: Record<string, unknown> = {}) => ({ entryId, templateVersionId: ids.tv, annualCtc: '1600000', variablePay: '150000', locationId: ids.blr, startDate: plus(30), expiresAt: plus(10), addConditions: true, ...over });
  /** A revision's body: the draft without the application (the offer already has it). */
  const revision = (entryId: string, over: Record<string, unknown>, fromVersion: number, note?: string) => {
    const { entryId: _e, ...rest } = draft(entryId, over);
    return { ...rest, fromVersion, ...(note ? { note } : {}) };
  };
  const record = async (who: Who, id: string) => (await api(who, 'get', `/hiring/offers/${id}`).expect(200)).body;
  const request$ = (offerId: string) => inA(async (tx) => tx.wfRequest.findFirstOrThrow({ where: { id: (await tx.offer.findFirstOrThrow({ where: { id: offerId } })).wfRequestId! } }));
  const decide = async (offerId: string, who: Who, decision: 'approve' | 'reject' = 'approve') => {
    const req = await request$(offerId);
    const task = await inA((tx) => tx.wfTask.findFirstOrThrow({ where: { requestId: req.id, assigneeUserId: users[who], status: 'open' } }));
    return api(who, 'post', `/workflow/approvals/tasks/${task.id}/decide`).send({ decision, ...(decision === 'reject' ? { reason: 'Check the range' } : {}) }).expect(200);
  };
  const tokenOf = async (offerId: string) => (await inA((tx) => tx.offer.findFirstOrThrow({ where: { id: offerId } }))).offerToken!;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue(email).overrideProvider(BlobStorageService).useValue(createFakeBlobStorage()).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    builder = moduleRef.get(OfferBuilderService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `hir09-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HIR09 Org ${k}`, slug: `hir09-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const PAYKEY = 'ats.offer.compensation.view';
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['rec', 'A', 'panel', [...tpl('recruiter'), PAYKEY]],
      ['rec2', 'A', 'panel', [...tpl('recruiter'), PAYKEY]],
      ['noPay', 'A', 'panel', tpl('recruiter')],
      ['hrHead', 'A', 'panel', tpl('hiring_admin')],
      ['mgr', 'A', 'panel', tpl('hiring_manager')],
      ['hr', 'A', 'panel', [...tpl('hr_admin'), 'employee.salary.manage', 'employee.salary.view']],
      ['pay', 'A', 'panel', tpl('payroll_admin')],
      ['emp', 'A', 'panel', []],
      ['recB', 'B', 'panel', [...tpl('recruiter'), PAYKEY]],
      // Answer 332: a named band approver (holds the offer-pay key, nothing else).
      ['cfo', 'A', 'panel', [PAYKEY]],
      // Acted for: a recruiter whose role (the company's override) holds every key used here, so only the acting rule can
      // refuse (an impersonation token carries the role's keys, not a permission profile).
      ['actee', 'A', 'recruiter', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await at(o)((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at(o)((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hir09-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hir09-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Kaveri Offers Pvt Ltd', shortName: `KO${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.blr = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      const hrDept = randomUUID();
      ids.hrDept = (await tx.department.create({ data: { ...o, id: hrDept, name: 'Human Resources', code: 'HR', path: `/${hrDept}/` } })).id;
      const qaDept = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: qaDept, name: 'Quality', code: 'QA', path: `/${qaDept}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Senior QA Engineer', code: 'SQA' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      ids.g6 = (await tx.grade.create({ data: { ...o, name: 'Grade 6', code: 'G6', rank: 6 } })).id;
      await tx.gradePayRange.create({ data: { ...o, gradeId: ids.g6, legalEntityId: ids.entity, currency: 'INR', min: 1_200_000, mid: 1_500_000, max: 1_800_000, validFrom: new Date('2026-04-01') } });
    });
    // The HR head: the head of the department coded HR (the band approver by default).
    const hrHeadEmp = (await api('adminA', 'post', '/people/employees').send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: 'Lakshmi', familyName: run, employeeCode: 'KO-001', joinedOn: '2026-04-06', userId: users.hrHead, workEmail: `hrHead@hir09-${run}.test`, assignment: { locationId: ids.blr, departmentId: ids.hrDept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null } }).expect(201)).body.id;
    await inA((tx) => tx.department.update({ where: { id: ids.hrDept }, data: { headEmployeeId: hrHeadEmp, headSince: new Date(`${today}T00:00:00Z`) } }));
    // Pay's starter salary structure (the CTC lines come from it).
    await api('pay', 'post', '/payroll/components/starter').expect(201);
    ids.tv = (await inA((tx) => tx.salaryTemplateVersion.findFirstOrThrow({ where: { organizationId: org.A.id } }))).id;
    // The job: G6 in the entity, hired for by mgr.
    ids.job = (await api('rec', 'post', '/jobs').send({ title: 'Senior QA Engineer' }).expect(201)).body.id;
    await inA((tx) => tx.job.update({ where: { id: ids.job }, data: { legalEntityId: ids.entity, gradeId: ids.g6, locationId: ids.blr, hiringManagerId: users.mgr } }));
    for (const k of ['joseph', 'fatima', 'arun', 'old', 'esign', 'other']) await entry(k);
    ids.jobB = (await api('recB', 'post', '/jobs').send({ title: 'Other company job' }).expect(201)).body.id;
    // The company's offer chain: one step; the sender is also listed and must be taken out.
    await api('adminA', 'put', '/organizations/approvals/chains/offer').send({ enabled: true, steps: [{ name: 'Hiring head', approverType: 'users', approverUserIds: [users.rec, users.rec2] }] }).expect(200);
    await api('adminA', 'post', '/lifecycle/journey-templates/from-starter').send({ starterKey: 'onboarding_standard' }).expect(201);
    await inA((tx) => tx.orgRolePermission.create({ data: { organizationId: org.A.id, role: 'recruiter', permissionsJson: JSON.stringify(['ats.offer.manage', 'pipeline:manage', 'ats.offer.compensation.view', 'ats.job.manage', 'ats.candidate.manage']) } }));
  }, 300_000);

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

  it('the builder: the structure, the grade range, places, letters and the route; a live CTC preview from Pay', async () => {
    const s = (await api('rec', 'get', `/hiring/offers/setup?entryId=${ids.joseph}`).expect(200)).body;
    expect(s).toMatchObject({ candidate: { name: 'Cand joseph' }, job: { title: 'Senior QA Engineer' }, grade: { name: 'G6' }, band: { min: 1_200_000, max: 1_800_000 } });
    expect(s.structures.map((x: { value: string }) => x.value)).toContain(ids.tv);
    expect(s.locations).toEqual([{ value: ids.blr, label: 'Bengaluru' }]);
    // Answer 404: the builder's default expiry is the one company setting (7 by default), changed on 6.1.
    expect(s.expiryDays).toBe(7);
    await setting('hiring.offer.expiry_days', '14');
    expect((await api('rec', 'get', `/hiring/offers/setup?entryId=${ids.joseph}`).expect(200)).body.expiryDays).toBe(14);
    await setting('hiring.offer.expiry_days', null);
    expect(s.defaultConditions).toEqual(['Background check clear', 'Degree certificate uploaded', 'Relieving letter from current employer']);
    // The sender is never an approver: rec is taken out of the chain step.
    expect(s.route.steps).toEqual([{ name: 'Hiring head', approvers: [`rec2 ${run}`] }]);
    expect(s.route.bandStep).toEqual({ name: 'Above the pay range (HR head)', approvers: [`hrHead ${run}`] });

    const p = (await api('rec', 'post', '/hiring/offers/preview').send({ entryId: ids.joseph, templateVersionId: ids.tv, annualCtc: '1600000', variablePay: '150000', locationId: ids.blr }).expect(200)).body;
    expect(p).toMatchObject({ bandPosition: 'within', extraApproval: false });
    const kinds = new Set(p.lines.map((l: { kind: string }) => l.kind));
    expect(kinds.has('earning') && kinds.has('employer') && kinds.has('variable')).toBe(true);
    expect(kinds.has('deduction' as never)).toBe(false);
    // Earnings and employer costs inside the CTC add up to the fixed CTC (Pay's maths, to the rupee).
    const inCtc = p.lines.filter((l: { kind: string }) => l.kind === 'earning' || l.kind === 'employer').reduce((t: number, l: { annual: number }) => t + l.annual, 0);
    expect(Math.abs(inCtc - 1_600_000)).toBeLessThan(13);
    expect((await api('rec', 'post', '/hiring/offers/preview').send({ entryId: ids.joseph, templateVersionId: ids.tv, annualCtc: '2050000', locationId: ids.blr }).expect(200)).body).toMatchObject({ bandPosition: 'above', extraApproval: true });
  });

  it('within the range: the recruiter drafts, one approval (never the sender), then sends; the letter waits for approval', async () => {
    // Answer 532: a fixed CTC of 0 or blank is refused with the bulk offers words; nothing is made.
    for (const annualCtc of ['0', '0.00', ''])
      expect((await api('rec', 'post', '/hiring/offers').send(draft(ids.joseph, { annualCtc })).expect(400)).body.message.join(' ')).toMatch(/Enter a fixed CTC above ₹0\./);
    await api('rec', 'post', '/hiring/offers/preview').send({ entryId: ids.joseph, templateVersionId: ids.tv, annualCtc: '0', locationId: ids.blr }).expect(400);
    expect(await inA((tx) => tx.offer.count({ where: { pipelineEntryId: ids.joseph } }))).toBe(0);
    const made = (await api('rec', 'post', '/hiring/offers').send(draft(ids.joseph, { startDate: today, expiresAt: endOfToday })).expect(201)).body;
    ids.o1 = made.id;
    expect(made).toMatchObject({ version: 1, bandPosition: 'within', extraApproval: false });
    // A second open offer on the same application is refused.
    await api('rec', 'post', '/hiring/offers').send(draft(ids.joseph)).expect(409);
    // Not approved yet: it cannot go to the candidate.
    await api('rec', 'post', `/offers/${ids.o1}/send`).expect(409);
    expect((await api('rec', 'post', `/hiring/offers/${ids.o1}/submit`).expect(200)).body.status).toBe('pending_approval');
    const req = await request$(ids.o1);
    const steps = req.steps as unknown as { name: string; approverIds: string[] }[];
    expect(steps.map((x) => [x.name, x.approverIds])).toEqual([['Hiring head', [users.rec2]]]);
    // The sender has no task to approve their own offer.
    expect(await inA((tx) => tx.wfTask.count({ where: { requestId: req.id, assigneeUserId: users.rec } }))).toBe(0);
    await decide(ids.o1, 'rec2');
    expect((await record('rec', ids.o1)).status).toBe('approved');
    const sent = (await api('rec', 'post', `/offers/${ids.o1}/send`).expect(201)).body;
    expect(sent).toMatchObject({ status: 'sent', esign: false });
    expect(email.send.mock.calls.some(([m]) => m.to === `joseph-${run}@mail.test`)).toBe(true);
  });

  it('above the range adds the step from the company setting (default the HR head; then the hiring manager)', async () => {
    ids.o2 = (await api('rec', 'post', '/hiring/offers').send(draft(ids.fatima, { annualCtc: '2050000' })).expect(201)).body.id;
    await api('rec', 'post', `/hiring/offers/${ids.o2}/submit`).expect(200);
    const steps = (await request$(ids.o2)).steps as unknown as { name: string; approverIds: string[] }[];
    expect(steps.map((x) => [x.name, x.approverIds])).toEqual([['Hiring head', [users.rec2]], ['Above the pay range (HR head)', [users.hrHead]]]);
    await decide(ids.o2, 'rec2');
    expect((await record('rec', ids.o2)).status).toBe('pending_approval');
    await decide(ids.o2, 'hrHead');
    expect((await record('rec', ids.o2)).status).toBe('approved');

    await setting('hiring.offer.band_approver', 'hiring_manager');
    ids.o3 = (await api('rec', 'post', '/hiring/offers').send(draft(ids.arun, { annualCtc: '1900000' })).expect(201)).body.id;
    await api('rec', 'post', `/hiring/offers/${ids.o3}/submit`).expect(200);
    const steps3 = (await request$(ids.o3)).steps as unknown as { name: string; approverIds: string[] }[];
    expect(steps3[1]).toMatchObject({ name: 'Above the pay range (hiring manager)', approverIds: [users.mgr] });
    // Turned down: back to draft for the recruiter to change.
    await decide(ids.o3, 'rec2', 'reject');
    expect((await record('rec', ids.o3)).status).toBe('draft');
    await setting('hiring.offer.band_approver', null);
  });

  it('answer 332: the band approver can be a named person who sees offer pay; others are refused', async () => {
    const page = (await api('adminA', 'get', '/hiring/settings').expect(200)).body;
    expect(page.offerApprovers.map((p: { id: string }) => p.id)).toEqual(expect.arrayContaining([users.cfo, users.rec, users.hrHead]));
    expect(page.offerApprovers.map((p: { id: string }) => p.id)).not.toContain(users.noPay);
    expect(page.values['hiring.offer.band_approver']).toBe('hr_head');
    expect((await api('adminA', 'put', '/hiring/settings').send({ changes: [{ key: 'hiring.offer.band_approver', value: users.noPay }] }).expect(400)).body.message).toMatch(/cannot see offer pay/);
    await api('adminA', 'put', '/hiring/settings').send({ changes: [{ key: 'hiring.offer.band_approver', value: users.recB }] }).expect(404);
    await api('adminA', 'put', '/hiring/settings').send({ changes: [{ key: 'hiring.offer.band_approver', value: 'cfo' }] }).expect(404);
    await api('rec', 'put', '/hiring/settings').send({ changes: [{ key: 'hiring.offer.band_approver', value: users.cfo }] }).expect(403);
    await api('adminA', 'put', '/hiring/settings').send({ changes: [{ key: 'hiring.offer.band_approver', value: users.cfo }] }).expect(200);
    const id = (await api('rec', 'post', '/hiring/offers').send(draft(ids.other, { annualCtc: '2100000' })).expect(201)).body.id;
    await api('rec', 'post', `/hiring/offers/${id}/submit`).expect(200);
    const steps = (await request$(id)).steps as unknown as { name: string; approverIds: string[] }[];
    expect(steps[1]).toMatchObject({ name: `Above the pay range (cfo ${run})`, approverIds: [users.cfo] });
    await api('rec', 'post', `/offers/${id}/approval/cancel`).expect(201);
    await inA((tx) => tx.offer.update({ where: { id }, data: { status: 'withdrawn' } }));
    await api('adminA', 'put', '/hiring/settings').send({ changes: [{ key: 'hiring.offer.band_approver', value: 'hr_head' }] }).expect(200);
  });

  it('versions: each change is a new version with its history; the old letter stops working; unchanged pay needs no new approval', async () => {
    const oldToken = await tokenOf(ids.o1);
    await pub('get', `/offers/${oldToken}`).expect(200);
    const res2 = await api('rec', 'post', `/hiring/offers/${ids.o1}/versions`).send(revision(ids.joseph, { startDate: today, expiresAt: endOfToday, annualCtc: '1700000' }, 1, 'Counter-offer'));
    expect([res2.status, res2.body.message]).toEqual([201, undefined]);
    const v2 = res2.body;
    expect(v2).toMatchObject({ version: 2, status: 'draft', needsApproval: true, letterWithdrawn: true });
    await pub('get', `/offers/${oldToken}`).expect(404);
    // Someone else's change wins: a revision from an old version is refused.
    await api('rec', 'post', `/hiring/offers/${ids.o1}/versions`).send(revision(ids.joseph, { startDate: today, expiresAt: endOfToday }, 1)).expect(409);
    await api('rec', 'post', `/hiring/offers/${ids.o1}/submit`).expect(200);
    await decide(ids.o1, 'rec2');
    // Same CTC and grade (only the variable changed): stays approved, no new route.
    const v3 = (await api('rec', 'post', `/hiring/offers/${ids.o1}/versions`).send(revision(ids.joseph, { startDate: today, expiresAt: endOfToday, annualCtc: '1700000', variablePay: '200000', joiningBonus: '100000', clawbackMonths: 12 }, 2)).expect(201)).body;
    expect(v3).toMatchObject({ version: 3, status: 'approved', needsApproval: false });
    const r = await record('rec', ids.o1);
    expect(r.versions.map((x: { version: number; current: boolean }) => [x.version, x.current])).toEqual([[3, true], [2, false], [1, false]]);
    expect(r.versions.map((x: { annualCtc: number }) => x.annualCtc)).toEqual([1_700_000, 1_700_000, 1_600_000]);
    expect(r.current).toMatchObject({ version: 3, annualCtc: 1_700_000, variablePay: 200_000, joiningBonus: 100_000, clawbackMonths: 12, bandPosition: 'within' });
    expect(r.activity.map((a: { action: string }) => a.action)).toEqual(expect.arrayContaining(['created offer version 1', 'revised the offer to version 2 (needs approval again)', 'revised the offer to version 3', 'sent the offer to the candidate']));
    // No amounts in the audit log.
    const logs = await inA((tx) => tx.auditLog.findMany({ where: { entityType: 'offer', entityId: ids.o1 } }));
    expect(JSON.stringify(logs.map((l) => l.metadataJson))).not.toMatch(/1700000|1600000/);
  });

  it('offer pay is hidden without the compensation key; the offer itself is not', async () => {
    const r = await record('noPay', ids.o1);
    expect(r).toMatchObject({ canSeePay: false, status: 'approved', candidate: { name: 'Cand joseph' } });
    expect(r.current).not.toHaveProperty('annualCtc');
    expect(r.current).not.toHaveProperty('lines');
    expect(r.versions.every((x: { annualCtc: number | null }) => x.annualCtc === null)).toBe(true);
    const listed = (await api('noPay', 'get', `/candidates/${(await inA((tx) => tx.pipelineEntry.findFirstOrThrow({ where: { id: ids.joseph } }))).candidateId}/offers`).expect(200)).body;
    expect(listed[0].compensation).toBeNull();
    await api('noPay', 'get', `/offers/${ids.o1}/pdf`).expect(403);
    await api('noPay', 'get', `/hiring/offers/setup?entryId=${ids.other}`).expect(403);
    await api('noPay', 'post', '/hiring/offers').send(draft(ids.other)).expect(403);
    await api('noPay', 'post', '/hiring/offers/preview').send({ entryId: ids.other, templateVersionId: ids.tv, annualCtc: '1600000', locationId: ids.blr }).expect(403);
    // With the key: the letter opens.
    await api('rec', 'get', `/offers/${ids.o1}/pdf`).expect(200);
  });

  it('conditions: started from the company list, each met or waived with a reason, never twice', async () => {
    const r = await record('rec', ids.o1);
    expect(r.conditions.map((c: { name: string; status: string; dueOn: string }) => [c.name, c.status, c.dueOn])).toEqual([
      ['Background check clear', 'open', today],
      ['Degree certificate uploaded', 'open', today],
      ['Relieving letter from current employer', 'open', today],
    ]);
    const [bgv, degree, relieving] = r.conditions.map((c: { id: string }) => c.id);
    await api('noPay', 'post', `/hiring/offers/${ids.o1}/conditions/${bgv}/met`).send({}).expect(200);
    await api('rec', 'post', `/hiring/offers/${ids.o1}/conditions/${bgv}/met`).send({}).expect(409);
    await api('rec', 'post', `/hiring/offers/${ids.o1}/conditions/${relieving}/waive`).send({}).expect(400);
    await api('rec', 'post', `/hiring/offers/${ids.o1}/conditions/${relieving}/waive`).send({ reason: '  ' }).expect(400);
    await api('rec', 'post', `/hiring/offers/${ids.o1}/conditions/${relieving}/waive`).send({ reason: 'Notice bought out by us' }).expect(200);
    await api('rec', 'post', `/hiring/offers/${ids.o1}/conditions/${degree}/met`).send({ note: 'Seen the original' }).expect(200);
    await api('rec', 'post', `/hiring/offers/${ids.o1}/conditions`).send({ name: 'Medical fitness', dueOn: plus(-1) }).expect(400);
    const added = (await api('rec', 'post', `/hiring/offers/${ids.o1}/conditions`).send({ name: 'Medical fitness', dueOn: today }).expect(201)).body.id;
    await api('rec', 'post', `/hiring/offers/${ids.o1}/conditions/${added}/met`).send({}).expect(200);
    const after = await record('rec', ids.o1);
    expect(after.conditions.map((c: { status: string; reason: string | null }) => [c.status, c.reason])).toEqual(expect.arrayContaining([['met', null], ['waived', 'Notice bought out by us'], ['met', 'Seen the original']]));
    expect(after.activity.map((a: { action: string }) => a.action)).toContain('waived "Relieving letter from current employer": Notice bought out by us');
  });

  it('accept by the link (the default) makes the joiner in People as before; at joining the offer pay goes to Pay', async () => {
    await api('rec', 'post', `/offers/${ids.o1}/send`).expect(201);
    const t = await tokenOf(ids.o1);
    expect((await pub('get', `/offers/${t}`).expect(200)).body).toMatchObject({ status: 'sent', esign: false });
    await pub('post', `/offers/${t}/respond`).send({ action: 'accept' }).expect(201);
    const joiner = (await api('hr', 'post', `/lifecycle/ready-to-onboard/${ids.o1}`).send({ givenName: 'Joseph', familyName: run, joiningOn: today, legalEntityId: ids.entity, locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm }).expect(201)).body;
    // Exactly as today: one joiner per offer.
    await api('hr', 'post', `/lifecycle/ready-to-onboard/${ids.o1}`).send({ givenName: 'Joseph', familyName: run, joiningOn: today, legalEntityId: ids.entity, locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm }).expect(409);
    expect((await record('rec', ids.o1)).joiner).toMatchObject({ id: joiner.id, status: 'invited' });
    const pb = (await api('hr', 'get', `/lifecycle/joiners/${joiner.id}`).expect(200)).body;
    const joined = (await api('hr', 'post', `/lifecycle/joiners/${joiner.id}/join`).send({ identityAttested: true, status: 'probation', version: pb.version }).expect(200)).body;
    expect(joined.payHandoff).toMatchObject({ status: 'sent', offerVersion: 3, bonus: { status: 'queued', month: today.slice(0, 7) } });
    // Pay rows sit behind the pay guard: open it to the entity, as payroll's own reads do.
    const pay = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => inA(async (tx) => (await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`, fn(tx)));
    const pkg = await pay((tx) => tx.compensationPackage.findFirstOrThrow({ where: { changeId: joined.payHandoff.changeId } }));
    expect(pkg).toMatchObject({ templateVersionId: ids.tv, employeeId: joined.employeeId });
    expect(Number(pkg.annualCtc)).toBe(1_700_000);
    const lines = await pay((tx) => tx.compensationLine.findMany({ where: { packageId: pkg.id } }));
    expect(lines.length).toBeGreaterThan(2);
    // Answer 334: the joining bonus is one-time pay for the first run, linked to the offer, queued once.
    const bonus = await pay((tx) => tx.oneTimePay.findMany({ where: { sourceRef: `offer:${ids.o1}:joining` } }));
    expect(bonus).toEqual([expect.objectContaining({ source: 'm10', componentCode: 'joining_bonus', status: 'approved', employeeId: joined.employeeId })]);
    expect(Number(bonus[0]!.amount)).toBe(100_000);
    // A pay change is approved by someone else, as any other.
    expect((await inA((tx) => tx.employeeChange.findFirstOrThrow({ where: { id: joined.payHandoff.changeId } }))).status).toBe('pending');
  });

  it('answers 335 and 336: HR is told once on the joining day about open conditions; reminders only by the button', async () => {
    // An open condition on the accepted (and joined) offer o1, due today.
    await api('rec', 'post', `/hiring/offers/${ids.o1}/conditions`).send({ name: 'Medical report', dueOn: today }).expect(201);
    expect(await builder.joiningDaySweep()).toBeGreaterThanOrEqual(1);
    const told = await inA((tx) => tx.userNotification.findMany({ where: { type: 'ats.offer.conditions_open', entityId: ids.o1 } }));
    expect(told.map((n) => n.recipientUserId)).toEqual(expect.arrayContaining([users.hr]));
    expect(told[0]!.contextText).toMatch(/Medical report/);
    await builder.joiningDaySweep();
    expect(await inA((tx) => tx.userNotification.count({ where: { type: 'ats.offer.conditions_open', entityId: ids.o1 } }))).toBe(told.length);
    // Nothing lapses or is withdrawn by itself.
    expect((await record('rec', ids.o1)).conditions.find((c: { name: string }) => c.name === 'Medical report').status).toBe('open');

    // Reminders: never automatic (the sweep sent none), only the button; the documents one for an accepted offer with open conditions.
    email.send.mockClear();
    expect((await api('rec', 'post', `/hiring/offers/${ids.o1}/remind`).expect(200)).body).toEqual({ sent: true, kind: 'documents' });
    const m = email.send.mock.calls.find(([x]) => x.to === `joseph-${run}@mail.test`)![0] as unknown as { subject: string; html: string };
    expect(m.subject).toMatch(/Still due/);
    expect(m.html).toContain('Medical report');
    await api('rec', 'post', `/hiring/offers/${ids.o1}/remind`).expect(409);
    expect((await record('rec', ids.o1)).activity.map((a: { action: string }) => a.action)).toContain('reminded the candidate about what is still due');
    // A draft offer has nothing to remind about; refusals as everywhere.
    await api('rec', 'post', `/hiring/offers/${ids.o3}/remind`).expect(409);
    await api('emp', 'post', `/hiring/offers/${ids.o1}/remind`).expect(403);
    await api('recB', 'post', `/hiring/offers/${ids.o1}/remind`).expect(404);
  });

  it('e-sign only when the template switches it on: then the emailed code and the disclosure are needed', async () => {
    const tplE = (await api('rec', 'post', '/offer-template').send({ name: `Signed letter ${run}`, subject: 'Your offer', body: 'Dear {{candidateName}}, {{compensation}}. Sign here: {{offerLink}}', esign: true }).expect(201)).body;
    expect(tplE.esign).toBe(true);
    ids.o5 = (await api('rec', 'post', '/hiring/offers').send(draft(ids.esign, { templateId: tplE.id })).expect(201)).body.id;
    await api('rec', 'post', `/hiring/offers/${ids.o5}/submit`).expect(200);
    await decide(ids.o5, 'rec2');
    expect((await api('rec', 'post', `/offers/${ids.o5}/send`).expect(201)).body.esign).toBe(true);
    // Answer 336: the offer reminder for a sent offer not answered yet, from the company's template.
    email.send.mockClear();
    expect((await api('rec', 'post', `/hiring/offers/${ids.o5}/remind`).expect(200)).body.kind).toBe('offer');
    expect(email.send.mock.calls.find(([x]) => x.to === `esign-${run}@mail.test`)![0].subject).toMatch(/waiting for your answer/);
    // Answer 337: the settings page lists each offer letter with its e-sign switch.
    expect((await api('adminA', 'get', '/hiring/settings').expect(200)).body.offerLetters).toEqual(expect.arrayContaining([expect.objectContaining({ id: tplE.id, esign: true })]));
    const t = await tokenOf(ids.o5);
    expect((await pub('get', `/offers/${t}`).expect(200)).body.esign).toBe(true);
    expect((await pub('post', `/offers/${t}/respond`).send({ action: 'accept' }).expect(400)).body.code).toBe('ESIGN_DISCLOSURE');
    expect((await pub('post', `/offers/${t}/respond`).send({ action: 'accept', disclosureAccepted: true }).expect(400)).body.code).toBe('ESIGN_CODE');
    await pub('post', `/offers/${t}/respond`).send({ action: 'accept', disclosureAccepted: true, code: 'abc' }).expect(400);
    expect((await pub('post', `/offers/${t}/esign-code`).expect(200)).body.sent).toBe(true);
    const code = await codeFor(`esign-${run}@mail.test`);
    await pub('post', `/offers/${t}/respond`).send({ action: 'accept', disclosureAccepted: true, code: code === '000000' ? '111111' : '000000' }).expect(401);
    await pub('post', `/offers/${t}/respond`).send({ action: 'accept', disclosureAccepted: true, code }).expect(201);
    const o = await inA((tx) => tx.offer.findFirstOrThrow({ where: { id: ids.o5 } }));
    expect(o.status).toBe('accepted');
    expect(o.esignEvidence).toMatchObject({ channel: 'email', assurance: 'one-time code', letterSha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    // Without e-sign (the default) no code is asked: offer 1 above was accepted by the link alone.
    expect((await inA((tx) => tx.offer.findFirstOrThrow({ where: { id: ids.o1 } }))).esignEvidence).toBeNull();
  });

  it('an older text offer stays readable as version 0, also after its first CTC version', async () => {
    ids.o4 = (await api('rec', 'post', `/pipeline/entries/${ids.old}/offers`).send({ compensation: 'Rs 9 LPA fixed', startDate: plus(30), expiresAt: plus(10) }).expect(201)).body.id;
    let r = await record('rec', ids.o4);
    expect(r).toMatchObject({ currentVersion: 0, current: null });
    expect(r.versions).toEqual([expect.objectContaining({ version: 0, current: true, text: 'Rs 9 LPA fixed' })]);
    expect((await record('noPay', ids.o4)).versions[0].text).toBeNull();
    await api('rec', 'post', `/hiring/offers/${ids.o4}/versions`).send(revision(ids.old, {}, 0)).expect(201);
    r = await record('rec', ids.o4);
    expect(r.versions.map((x: { version: number }) => x.version)).toEqual([1, 0]);
    expect(r.versions[1]).toMatchObject({ version: 0, current: false, text: 'Rs 9 LPA fixed' });
  });

  it('refused: an employee (403), another company (404), acting for someone else (403), bad input (400)', async () => {
    await api('emp', 'get', `/hiring/offers/${ids.o1}`).expect(403);
    await api('emp', 'post', '/hiring/offers').send(draft(ids.other)).expect(403);
    await api('recB', 'get', `/hiring/offers/${ids.o1}`).expect(404);
    await api('recB', 'get', `/hiring/offers/setup?entryId=${ids.other}`).expect(404);
    await api('recB', 'post', '/hiring/offers').send(draft(ids.other)).expect(404);
    await api('recB', 'post', `/hiring/offers/${ids.o2}/conditions`).send({ name: 'X check', dueOn: today }).expect(404);
    await api('recB', 'post', `/hiring/offers/${ids.o2}/submit`).expect(404);

    token.acting = (await request(server()).post(`/api/v1/auth/impersonate/${users.actee}`).set('Authorization', `Bearer ${token.adminA}`).expect(200)).body.accessToken;
    expect((await api('acting', 'post', '/hiring/offers').send(draft(ids.other)).expect(403)).body.message).toMatch(/acting for someone else/);
    await api('acting', 'post', `/hiring/offers/${ids.o3}/submit`).expect(403);
    await api('acting', 'post', `/hiring/offers/${ids.o2}/conditions`).send({ name: 'X check', dueOn: today }).expect(403);
    await api('acting', 'post', `/offers/${ids.o2}/send`).expect(403);
    await api('acting', 'post', `/hiring/offers/${ids.o2}/remind`).expect(403);
    await api('acting', 'get', `/hiring/offers/${ids.o1}`).expect(200);

    for (const bad of [
      { annualCtc: 'twelve lakh' },
      { annualCtc: '-5' },
      { startDate: plus(-1) },
      { expiresAt: plus(40) },
      { templateVersionId: randomUUID() },
      { joiningBonus: '100000' },
      { clawbackMonths: 99, joiningBonus: '100000' },
      { entryId: 'not-a-uuid' },
    ]) await api('rec', 'post', '/hiring/offers').send(draft(ids.other, bad)).expect(400);
    await api('rec', 'post', `/hiring/offers/${ids.o2}/conditions`).send({ name: 'x', dueOn: today }).expect(400);
    await api('rec', 'get', '/hiring/offers/not-a-uuid').expect(400);
    // A sent-and-accepted offer cannot be revised.
    await api('rec', 'post', `/hiring/offers/${ids.o1}/versions`).send(revision(ids.joseph, {}, 3)).expect(409);
  });
});
